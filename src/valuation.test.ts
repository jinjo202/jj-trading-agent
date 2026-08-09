import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_VALUATION_HISTORY, cpiFromObs, rankValuationVsHistory } from './collect.ts'
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

// 소스마다 CPI 형태가 다르다 — 일본 통계청은 지수, OECD 한국은 이미 전년동월비 퍼센트.
// 이 변환을 헷갈리면 3%가 300%가 되어 그대로 매크로 판단에 들어간다.
test('cpiFromObs는 지수를 전년동월비 비율로 바꾼다', () => {
  // 13개월치: 100에서 시작해 마지막이 103 → +3%
  const obs = Array.from({ length: 13 }, (_, i) => ({
    date: `2025-${String(i + 1).padStart(2, '0')}-01`,
    value: i === 12 ? 103 : 100,
  }))
  const out = cpiFromObs(obs, 'index')
  assert.ok(Math.abs((out.value as number) - 0.03) < 1e-12)
  assert.equal(out.asOf, '2025-13-01')
})

test('cpiFromObs는 퍼센트 시리즈를 100으로 나눠 비율로 만든다', () => {
  const out = cpiFromObs([{ date: '2026-05-01', value: 3.14 }], 'percent')
  assert.ok(Math.abs((out.value as number) - 0.0314) < 1e-12)
  assert.equal(out.asOf, '2026-05-01')
})

test('cpiFromObs는 결측을 null로 두고 마지막 유효 관측일을 쓴다', () => {
  const out = cpiFromObs([{ date: '2026-04-01', value: 2 }, { date: '2026-05-01', value: null }], 'percent')
  assert.equal(out.value, 0.02)
  assert.equal(out.asOf, '2026-04-01')
  assert.equal(cpiFromObs([], 'percent').value, null)
  assert.equal(cpiFromObs([], 'index').value, null)
})
