import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_VALUATION_HISTORY, rankValuationVsHistory } from './collect.ts'
import type { MarketCode, RegionValuation } from './types.ts'

const v = (per: number, pbr = 2): RegionValuation => ({ symbol: 'SPY', per, pbr, psr: 1 })

/** per가 lo..hi로 고르게 퍼진 n일치 히스토리. */
const hist = (n: number, lo: number, hi: number) =>
  Array.from({ length: n }, (_, i) => ({
    valuation: { US: v(lo + ((hi - lo) * i) / Math.max(n - 1, 1)) } as Partial<Record<MarketCode, RegionValuation>>,
  }))

test('표본이 충분하면 자기 역사 대비 백분위를 낸다', () => {
  const out = rankValuationVsHistory({ US: v(30) }, hist(MIN_VALUATION_HISTORY, 10, 20))
  // 현재 30은 과거 10~20 전부보다 비싸다 → 100번째 백분위
  assert.equal(out.US?.perPctile, 100)
  assert.equal(out.US?.historyDays, MIN_VALUATION_HISTORY)
})

test('현재값이 과거 분포 한가운데면 백분위도 가운데', () => {
  const out = rankValuationVsHistory({ US: v(15) }, hist(MIN_VALUATION_HISTORY, 10, 20))
  assert.ok((out.US!.perPctile as number) > 40 && (out.US!.perPctile as number) < 60)
})

// 추세장에서 20일치로 재면 거의 모든 값이 0 또는 100이 된다. 그건 정보가 아니라 착시다.
test('표본이 최소치 미만이면 백분위는 null이고 historyDays로 진행도를 알린다', () => {
  const out = rankValuationVsHistory({ US: v(30) }, hist(MIN_VALUATION_HISTORY - 1, 10, 20))
  assert.equal(out.US?.perPctile, null)
  assert.equal(out.US?.pbrPctile, null)
  assert.equal(out.US?.historyDays, MIN_VALUATION_HISTORY - 1)
})

test('히스토리가 아예 없어도 측정값은 그대로 남는다', () => {
  const out = rankValuationVsHistory({ US: v(26) }, [])
  assert.equal(out.US?.per, 26)
  assert.equal(out.US?.perPctile, null)
  assert.equal(out.US?.historyDays, 0)
})

test('현재값이 null이면 그 지표만 백분위 null, 다른 지표는 계산된다', () => {
  const cur = { US: { symbol: 'SPY', per: null, pbr: 3, psr: 1 } }
  const out = rankValuationVsHistory(cur, hist(MIN_VALUATION_HISTORY, 10, 20))
  assert.equal(out.US?.perPctile, null)
  assert.equal(out.US?.pbrPctile, 100) // 과거 pbr은 전부 2, 현재 3
})

// 시장마다 히스토리 길이가 다를 수 있다(수집 시작 시점이 다름).
test('시장별로 히스토리 개수를 따로 센다', () => {
  const history = [
    { valuation: { US: v(20), KR: v(10) } },
    { valuation: { US: v(21) } },
  ]
  const out = rankValuationVsHistory({ US: v(22), KR: v(11) }, history)
  assert.equal(out.US?.historyDays, 2)
  assert.equal(out.KR?.historyDays, 1)
})
