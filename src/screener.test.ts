import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTech, filterByLiquidity, rankByMomentum, scoreCandidates } from './screener.ts'
import type { Fundamentals, QuoteRow, UniverseRow } from './types.ts'

const u = (ticker: string, market: 'KR' | 'US'): UniverseRow => ({
  ticker, market, name: ticker, sector: 'Technology', active: true,
})

const q = (
  symbol: string, price: number, vol: number, chg: number, currency: string,
): QuoteRow => ({
  symbol, price, marketCap: price * 1e6, avgVolume3m: vol,
  yearChangePct: chg, currency,
})

const f = (roe: number | null, margin: number | null): Fundamentals => ({
  symbol: 'x', name: null, sector: null, price: null, marketCap: null,
  forwardPE: 10, priceToBook: 1, roe, debtToEquity: null,
  revenueGrowth: null, operatingMargin: margin,
})

test('유동성 필터는 시장별로 따로 자른다', () => {
  // 전역 정렬로 자르면 상위 2개가 둘 다 KR이 된다. 시장별로 잘라야 KR 1 + US 1이 남는다.
  const rows = [u('A.KS', 'KR'), u('B.KS', 'KR'), u('C', 'US'), u('D', 'US')]
  const quotes = [
    q('A.KS', 100000, 1_000_000, 10, 'KRW'),  // 1e11
    q('B.KS', 50000, 1_000_000, 10, 'KRW'),   // 5e10  ← C보다 크다
    q('C', 300, 50_000_000, 10, 'USD'),       // 1.5e10
    q('D', 20, 100_000, 10, 'USD'),           // 2e6
  ]
  const kept = filterByLiquidity(rows, quotes, 0.5).map((p) => p.row.ticker)
  assert.deepEqual(kept.sort(), ['A.KS', 'C'], '시장별 상위 절반이 남아야 한다')
})

test('유동성 필터는 가격이나 거래량이 null이면 제외한다', () => {
  const rows = [u('A', 'US'), u('B', 'US')]
  const quotes = [
    q('A', 10, 1000, 5, 'USD'),
    { ...q('B', 10, 1000, 5, 'USD'), avgVolume3m: null },
  ]
  assert.deepEqual(filterByLiquidity(rows, quotes, 1).map((p) => p.row.ticker), ['A'])
})

test('유동성 필터는 시세가 아예 없는 종목을 조용히 버리지 않고 제외한다', () => {
  const kept = filterByLiquidity([u('A', 'US'), u('GHOST', 'US')], [q('A', 10, 1000, 5, 'USD')], 1)
  assert.deepEqual(kept.map((p) => p.row.ticker), ['A'])
})

test('모멘텀 랭킹은 52주 수익률 내림차순 상위 N', () => {
  const rows = [u('A', 'US'), u('B', 'US'), u('C', 'US')]
  const quotes = [q('A', 10, 1e6, 5, 'USD'), q('B', 10, 1e6, 90, 'USD'), q('C', 10, 1e6, 40, 'USD')]
  const pairs = filterByLiquidity(rows, quotes, 1)
  assert.deepEqual(rankByMomentum(pairs, 2).map((p) => p.row.ticker), ['B', 'C'])
})

test('모멘텀이 null인 종목은 랭킹에서 빠진다', () => {
  const rows = [u('A', 'US'), u('B', 'US')]
  const quotes = [{ ...q('A', 10, 1e6, 5, 'USD'), yearChangePct: null }, q('B', 10, 1e6, 1, 'USD')]
  const pairs = filterByLiquidity(rows, quotes, 1)
  assert.deepEqual(rankByMomentum(pairs, 5).map((p) => p.row.ticker), ['B'])
})

test('스코어는 모멘텀과 퀄리티를 합치고, 퀄리티 결측은 그 항만 0으로 둔다', () => {
  const rows = [u('A', 'US'), u('B', 'US'), u('C', 'US')]
  const quotes = [q('A', 10, 1e6, 10, 'USD'), q('B', 10, 1e6, 50, 'USD'), q('C', 10, 1e6, 90, 'USD')]
  const pairs = rankByMomentum(filterByLiquidity(rows, quotes, 1), 3)
  const funds = new Map<string, Fundamentals>([
    ['A', f(0.30, 0.30)],
    ['B', f(0.05, 0.05)],
    ['C', f(null, null)],   // 결측: 퀄리티 항 없이 모멘텀만으로 평가
  ])
  const out = scoreCandidates(pairs, funds, 3)
  assert.equal(out.length, 3)
  assert.ok(out[0].score >= out[1].score && out[1].score >= out[2].score, '점수 내림차순')
  const c = out.find((x) => x.ticker === 'C')!
  assert.equal(c.roe, null, '결측은 null로 남고 0으로 채우지 않는다')
  assert.ok(Number.isFinite(c.score), '퀄리티 결측이 점수를 NaN으로 만들지 않는다')
})

test('scoreCandidates는 turnover를 현지통화 그대로 싣고 tech는 아직 null', () => {
  const pairs = filterByLiquidity([u('A.KS', 'KR')], [q('A.KS', 100000, 1000, 10, 'KRW')], 1)
  const out = scoreCandidates(pairs, new Map(), 1)
  assert.equal(out[0].turnover, 100000 * 1000)
  assert.equal(out[0].tech, null, 'tech는 후보 확정 뒤 일봉으로 따로 채운다')
})

test('computeTech는 상승 추세에서 이동평균 위, RSI 100', () => {
  // high/low를 종가와 같게 둬야 52주 밴드가 종가 범위와 일치한다 (P1에서 같은 함정을 겪었다)
  const bars = Array.from({ length: 300 }, (_, i) => {
    const c = 100 + i * 0.1
    return { date: `d${i}`, open: c, high: c, low: c, close: c, volume: 1000 }
  })
  const t = computeTech(bars)
  assert.ok(t.distSma200! > 0)
  assert.equal(t.rsi14, 100)
  assert.equal(t.week52Position, 1)
})

test('computeTech는 데이터가 짧으면 각 항을 null로 둔다', () => {
  const bars = Array.from({ length: 5 }, (_, i) => ({
    date: `d${i}`, open: 100, high: 100, low: 100, close: 100, volume: 1000,
  }))
  const t = computeTech(bars)
  assert.equal(t.distSma200, null)
  assert.equal(t.week52Position, null)
})
