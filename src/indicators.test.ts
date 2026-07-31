import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sma, ema, rsi, macd, atr, realizedVol, momentum12_1,
  week52Position, distFromSma, pctChange, zscore, pctRank,
} from './indicators.ts'
import type { Ohlcv } from './types.ts'

const bar = (close: number, high = close, low = close): Ohlcv => ({
  date: '2026-01-01', open: close, high, low, close, volume: 1000,
})

test('sma는 마지막 period개의 평균', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 3), 4)
  assert.equal(sma([1, 2], 3), null, '데이터가 부족하면 null')
})

test('ema는 SMA로 시드한 뒤 k=2/(n+1)로 갱신', () => {
  // seed = sma([1,2],2) = 1.5, k = 2/3 -> 3*(2/3) + 1.5*(1/3) = 2.5
  assert.equal(ema([1, 2, 3], 2), 2.5)
})

test('rsi: 계속 오르면 100, 계속 내리면 0, 손계산 케이스와 일치', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i)
  const down = Array.from({ length: 30 }, (_, i) => 100 - i)
  assert.equal(rsi(up, 14), 100)
  assert.equal(rsi(down, 14), 0)

  // period=2, [10,11,10,11]: 시드 gain=loss=0.5 -> 마지막 +1로 gain=0.75, loss=0.25 -> RS=3 -> 75
  assert.ok(Math.abs(rsi([10, 11, 10, 11], 2)! - 75) < 1e-9)
})

test('rsi는 period+1개 미만이면 null', () => {
  assert.equal(rsi([1, 2, 3], 14), null)
})

test('macd hist = macd - signal', () => {
  const values = Array.from({ length: 120 }, (_, i) => 100 + i * 0.5)
  const m = macd(values)!
  assert.ok(Math.abs(m.hist - (m.macd - m.signal)) < 1e-9)
  assert.ok(m.macd > 0, '상승 추세에서 MACD는 양수')
})

test('atr: 레인지가 일정하면 ATR은 그 레인지', () => {
  const bars = Array.from({ length: 30 }, () => bar(100, 102, 98))
  assert.ok(Math.abs(atr(bars, 14)! - 4) < 1e-9)
})

test('realizedVol: 가격이 일정하면 0', () => {
  const flat = Array.from({ length: 40 }, () => 100)
  assert.equal(realizedVol(flat, 20), 0)
})

test('momentum12_1은 t-252 대비 t-21 수익률', () => {
  // length 253이면 t = index 252. t-252 = index 0, t-21 = index 231.
  const values = Array.from({ length: 253 }, (_, i) => (i === 0 ? 100 : i === 231 ? 150 : 1))
  assert.ok(Math.abs(momentum12_1(values)! - 0.5) < 1e-9)
  assert.equal(momentum12_1([1, 2, 3]), null)
})

test('week52Position: 고가 = 1, 저가 = 0', () => {
  // 최소 200봉 가드를 만족시키기 위해 저가 1봉 + 고가 199봉으로 구성.
  const bars = [bar(50, 50, 50), ...Array.from({ length: 199 }, () => bar(150, 150, 150))]
  assert.equal(week52Position(bars), 1)
})

test('week52Position: 200봉 미만이면 null', () => {
  // high !== low로 구성해, 가드가 없다면 high===low null 분기가 아니라
  // 실제 포지션 값이 계산되어 버릴 짧은 시계열.
  const bars = Array.from({ length: 10 }, (_, i) => bar(100 + i, 100 + i, 100 + i))
  assert.equal(week52Position(bars), null)
})

test('distFromSma는 SMA 대비 퍼센트', () => {
  assert.ok(Math.abs(distFromSma([10, 10, 10, 20], 4)! - 0.6) < 1e-9) // 20 / 12.5 - 1
})

test('pctChange는 lookback봉 전 대비 수익률', () => {
  assert.ok(Math.abs(pctChange([100, 110], 1)! - 0.1) < 1e-9)
  assert.equal(pctChange([100], 5), null)
})

test('zscore는 모집단 표준편차 기준', () => {
  assert.ok(Math.abs(zscore([1, 2, 3, 4, 5], 5)! - Math.SQRT2) < 1e-9)
  assert.equal(zscore([2, 2, 2], 2), null, '표준편차 0이면 null')
})

test('pctRank는 null을 제외하고 0-100 백분위', () => {
  assert.equal(pctRank([10, 20, 30, 40, 50], 30), 50)
  assert.equal(pctRank([10, null, 30, null, 50], 50), 100)
  assert.equal(pctRank([null, null], 5), null)
})

test('pctRank는 value가 분포 밖이어도 0-100으로 클램프된다', () => {
  assert.equal(pctRank([10, 20, 30], 40), 100)
  assert.equal(pctRank([10, 20, 30], 5), 0)
})
