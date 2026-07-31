import type { Ohlcv } from './types.ts'

const tail = (values: number[], n: number): number[] | null =>
  values.length < n ? null : values.slice(values.length - n)

export function sma(values: number[], period: number): number | null {
  const w = tail(values, period)
  return w === null ? null : w.reduce((a, b) => a + b, 0) / period
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null
  const k = 2 / (period + 1)
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (const v of values.slice(period)) e = v * k + e * (1 - k)
  return e
}

// Wilder 평활. 상승분/하락분의 지수평활 평균 비율.
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
  }
  if (loss === 0) return gain === 0 ? 50 : 100
  return 100 - 100 / (1 + gain / loss)
}

export function macd(values: number[]): { macd: number; signal: number; hist: number } | null {
  if (values.length < 35) return null
  const line: number[] = []
  for (let i = 26; i <= values.length; i++) {
    const slice = values.slice(0, i)
    line.push(ema(slice, 12)! - ema(slice, 26)!)
  }
  const signal = ema(line, 9)
  if (signal === null) return null
  const m = line[line.length - 1]
  return { macd: m, signal, hist: m - signal }
}

export function atr(bars: Ohlcv[], period = 14): number | null {
  if (bars.length < period + 1) return null
  const tr: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i]
    const prev = bars[i - 1].close
    tr.push(Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev)))
  }
  let a = tr.slice(0, period).reduce((x, y) => x + y, 0) / period
  for (const t of tr.slice(period)) a = (a * (period - 1) + t) / period
  return a
}

// 연율화 실현변동성. 일간 로그수익률 표준편차 * sqrt(252)
export function realizedVol(values: number[], period = 20): number | null {
  const w = tail(values, period + 1)
  if (w === null) return null
  const rets = w.slice(1).map((v, i) => Math.log(v / w[i]))
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length
  return Math.sqrt(variance) * Math.sqrt(252)
}

// 12개월 전(252봉) 대비 1개월 전(21봉) 수익률. 최근 1개월 반전 효과를 뺀 표준 정의.
export function momentum12_1(values: number[]): number | null {
  if (values.length < 253) return null
  const start = values[values.length - 253]
  const end = values[values.length - 22]
  return start === 0 ? null : end / start - 1
}

export function week52Position(bars: Ohlcv[]): number | null {
  const w = bars.slice(Math.max(0, bars.length - 252))
  if (w.length === 0) return null
  const high = Math.max(...w.map((b) => b.high))
  const low = Math.min(...w.map((b) => b.low))
  if (high === low) return null
  return (w[w.length - 1].close - low) / (high - low)
}

export function distFromSma(values: number[], period: number): number | null {
  const s = sma(values, period)
  if (s === null || s === 0) return null
  return values[values.length - 1] / s - 1
}

export function pctChange(values: number[], lookback: number): number | null {
  if (values.length < lookback + 1) return null
  const base = values[values.length - 1 - lookback]
  return base === 0 ? null : values[values.length - 1] / base - 1
}

const clean = (values: (number | null)[]): number[] =>
  values.filter((v): v is number => v !== null && Number.isFinite(v))

export function zscore(values: (number | null)[], value: number): number | null {
  const v = clean(values)
  if (v.length < 2) return null
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / v.length)
  return sd === 0 ? null : (value - mean) / sd
}

// 결측을 제외한 뒤 value보다 작은 값의 비율(0-100).
export function pctRank(values: (number | null)[], value: number): number | null {
  const v = clean(values)
  if (v.length < 2) return null
  const below = v.filter((x) => x < value).length
  return (below / (v.length - 1)) * 100
}
