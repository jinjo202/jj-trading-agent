import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTech, filterByLiquidity, rankByMomentum, scoreCandidates } from './screener.ts'
import type { Fundamentals, QuoteRow, UniverseRow } from './types.ts'

const u = (ticker: string, market: 'KR' | 'US'): UniverseRow => ({
  ticker, market, name: ticker, sector: 'Technology', active: true,
})

/** 섹터를 지정해야 하는 테스트용. 섹터 쿼터 동작을 보려면 섹터가 갈려야 한다. */
const us = (ticker: string, sector: string | null): UniverseRow => ({
  ticker, market: 'US', name: ticker, sector, active: true,
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

// 한 섹터가 상위를 독식하면 후보군이 사실상 한 테마가 된다.
// 실측에서 OW 섹터 3개에 후보 24종목이 전부 반도체로 나온 적이 있다.
test('모멘텀 랭킹은 한 섹터가 상위를 독식하지 못하게 섹터를 번갈아 뽑는다', () => {
  const rows = [
    us('T1', 'Technology'), us('T2', 'Technology'), us('T3', 'Technology'),
    us('H1', 'Healthcare'), us('H2', 'Healthcare'),
  ]
  const quotes = [
    q('T1', 10, 1e6, 99, 'USD'), q('T2', 10, 1e6, 98, 'USD'), q('T3', 10, 1e6, 97, 'USD'),
    q('H1', 10, 1e6, 50, 'USD'), q('H2', 10, 1e6, 40, 'USD'),
  ]
  const pairs = filterByLiquidity(rows, quotes, 1)
  // 단순 정렬이면 T1,T2,T3 — 기술 독식. 라운드로빈이면 섹터가 번갈아 나온다.
  assert.deepEqual(rankByMomentum(pairs, 4).map((p) => p.row.ticker), ['T1', 'H1', 'T2', 'H2'])
})

// 고정 쿼터였다면 남는 자리가 그대로 비지만, 라운드로빈은 자연히 재분배된다.
test('종목이 모자란 섹터의 자리는 다른 섹터가 가져간다', () => {
  const rows = [
    us('T1', 'Technology'), us('T2', 'Technology'), us('T3', 'Technology'),
    us('H1', 'Healthcare'),
  ]
  const quotes = [
    q('T1', 10, 1e6, 99, 'USD'), q('T2', 10, 1e6, 98, 'USD'), q('T3', 10, 1e6, 97, 'USD'),
    q('H1', 10, 1e6, 50, 'USD'),
  ]
  const pairs = filterByLiquidity(rows, quotes, 1)
  assert.deepEqual(rankByMomentum(pairs, 4).map((p) => p.row.ticker), ['T1', 'H1', 'T2', 'T3'])
})

test('섹터 순서는 각 섹터 1위의 모멘텀을 따른다', () => {
  const rows = [us('T1', 'Technology'), us('H1', 'Healthcare')]
  const quotes = [q('T1', 10, 1e6, 10, 'USD'), q('H1', 10, 1e6, 80, 'USD')]
  const pairs = filterByLiquidity(rows, quotes, 1)
  assert.deepEqual(rankByMomentum(pairs, 2).map((p) => p.row.ticker), ['H1', 'T1'])
})

test('sector가 null인 종목들은 하나의 버킷으로 묶인다', () => {
  const rows = [us('N1', null), us('N2', null), us('T1', 'Technology')]
  const quotes = [
    q('N1', 10, 1e6, 99, 'USD'), q('N2', 10, 1e6, 98, 'USD'), q('T1', 10, 1e6, 50, 'USD'),
  ]
  const pairs = filterByLiquidity(rows, quotes, 1)
  // 미분류가 각자 버킷이었다면 N1,N2가 연달아 먼저 나온다. 한 통이면 T1이 두 번째다.
  assert.deepEqual(rankByMomentum(pairs, 3).map((p) => p.row.ticker), ['N1', 'T1', 'N2'])
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

// 24종목 단계에서만 균형을 잡으면 최종 12에서 강한 섹터가 다시 올라온다.
// 실측에서 그렇게 12종목 중 8개가 기술주로 돌아왔다.
test('scoreCandidates도 섹터를 번갈아 뽑는다', () => {
  const rows = [
    us('T1', 'Technology'), us('T2', 'Technology'), us('T3', 'Technology'),
    us('H1', 'Healthcare'), us('H2', 'Healthcare'),
  ]
  // 기술주가 모멘텀·퀄리티 모두 상위라 점수만으로 자르면 T가 독식한다.
  const quotes = [
    q('T1', 10, 1e6, 99, 'USD'), q('T2', 10, 1e6, 98, 'USD'), q('T3', 10, 1e6, 97, 'USD'),
    q('H1', 10, 1e6, 20, 'USD'), q('H2', 10, 1e6, 10, 'USD'),
  ]
  const funds = new Map<string, Fundamentals>([
    ['T1', f(0.9, 0.9)], ['T2', f(0.8, 0.8)], ['T3', f(0.7, 0.7)],
    ['H1', f(0.1, 0.1)], ['H2', f(0.05, 0.05)],
  ])
  const pairs = filterByLiquidity(rows, quotes, 1)
  const out = scoreCandidates(pairs, funds, 4).map((c) => c.ticker)
  assert.deepEqual(out, ['T1', 'H1', 'T2', 'H2'])
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
