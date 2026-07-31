import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshot } from './snapshot.ts'
import type { Fundamentals, Ohlcv } from './types.ts'

const bar = (close: number, high = close, low = close): Ohlcv => ({
  date: 'd', open: close, high, low, close, volume: 1000,
})

// 253봉짜리 완만한 상승 추세. change_12m 계산에 필요한 최소 길이다.
function series(start: number, step: number, n = 260): Ohlcv[] {
  return Array.from({ length: n }, (_, i) => bar(start + step * i))
}

const funds = (over: Partial<Fundamentals> = {}): Fundamentals => ({
  symbol: 'X', name: null, sector: null, price: null, marketCap: 1e12,
  forwardPE: 15, priceToBook: 2, roe: 0.15, debtToEquity: 40,
  revenueGrowth: null, operatingMargin: 0.2, ...over,
})

test('buildSnapshot은 가격·변화율·52주 밴드를 봉에서 계산한다', () => {
  const bars = series(100, 0.5)
  const snap = buildSnapshot(bars, funds(), [10, 15, 20])!
  assert.ok(snap !== null)
  assert.equal(snap.price, bars.at(-1)!.close)
  assert.ok(snap.change_12m > 0, '상승 추세라 12개월 변화율이 양수')
  assert.equal(snap.week52.position, 1, '상승 추세의 마지막 봉은 52주 고점')
  assert.equal(snap.market_cap, 1e12)
  assert.equal(snap.per, 15)
  assert.equal(snap.pbr, 2)
  assert.equal(snap.debt_to_equity, 40)
  assert.deepEqual(snap.revenue_trend, [])
  assert.deepEqual(snap.op_margin_trend, [])
})

test('buildSnapshot은 253봉 미만이면 null — 지어내지 않고 건너뛴다', () => {
  assert.equal(buildSnapshot(series(100, 0.5, 100), funds(), []), null)
})

test('buildSnapshot은 marketCap이 null이면 null', () => {
  assert.equal(buildSnapshot(series(100, 0.5), funds({ marketCap: null }), []), null)
})

test('buildSnapshot은 봉이 없으면 null', () => {
  assert.equal(buildSnapshot([], funds(), []), null)
})

test('per_pctile_in_sector는 동료군 forwardPE 대비 백분위, forwardPE가 null이면 null', () => {
  const bars = series(100, 0.5)
  const snap = buildSnapshot(bars, funds({ forwardPE: 20 }), [10, 15, 20, 25])!
  // pctRank([10,15,20,25], 20)을 src/indicators.ts 구현으로 손으로 검산:
  // clean -> [10,15,20,25] (4개), below(=x<20) -> [10,15] (2개),
  // Math.min(2, 4-1)=2, (2/3)*100 = 66.666...
  // 계획서 원안은 50을 기대했으나 그 코멘트("2/3*100")조차 66.67이 되어 50과 맞지 않는다 —
  // pctRank를 바꾸지 않는 한 실제로 나올 수 있는 값은 66.666...뿐이라 이 값으로 검증한다.
  assert.equal(snap.per_pctile_in_sector, (2 / 3) * 100)

  const noPE = buildSnapshot(bars, funds({ forwardPE: null }), [10, 15, 20])!
  assert.equal(noPE.per_pctile_in_sector, null)
})
