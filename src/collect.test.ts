import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFeatures } from './collect.ts'
import type { MacroBlock, Ohlcv } from './types.ts'

// 100에서 시작해 매일 +0.1씩 오르는 300봉. 상승 추세.
function series(start: number, step: number, n = 300): Ohlcv[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + step * i
    return { date: `d${i}`, open: c, high: c, low: c, close: c, volume: 1000 }
  })
}

const macro: MacroBlock = {
  available: true, dgs2: 3.5, dgs10: 4.2, dgs3mo: 4.5,
  cpiYoY: 0.025, coreCpiYoY: 0.03, unrate: 4.1, hySpread: 3.2,
}

test('buildFeatures는 금리차를 계산한다', () => {
  const f = buildFeatures({ '^GSPC': series(100, 0.1) }, macro)
  assert.ok(Math.abs(f.macro.curve2s10s! - 0.7) < 1e-9)
  assert.ok(Math.abs(f.macro.curve3m10y! - -0.3) < 1e-9)
})

test('상승 추세 자산은 이동평균 위, RSI 100', () => {
  const f = buildFeatures({ '^GSPC': series(100, 0.1) }, macro)
  const a = f.assets['^GSPC']
  assert.ok(a.distSma200! > 0)
  assert.equal(a.rsi14, 100)
  assert.equal(a.week52Position, 1)
})

test('빠진 심볼은 missing에 기록되고 관련 feature는 null', () => {
  const f = buildFeatures({ '^GSPC': series(100, 0.1) }, macro)
  assert.ok(f.missing.includes('^VIX'))
  assert.equal(f.regime.vixLevel, null)
  assert.equal(f.regime.breadth, null)
})

test('macro가 없으면 곡선도 null이고 missing에 남는다', () => {
  const empty: MacroBlock = {
    available: false, dgs2: null, dgs10: null, dgs3mo: null,
    cpiYoY: null, coreCpiYoY: null, unrate: null, hySpread: null,
  }
  const f = buildFeatures({ '^GSPC': series(100, 0.1) }, empty)
  assert.equal(f.macro.curve2s10s, null)
  assert.ok(f.missing.includes('fred'))
})

test('VIX 기간구조는 VIX/VIX3M 비율', () => {
  const f = buildFeatures(
    { '^VIX': series(20, 0), '^VIX3M': series(25, 0) },
    macro,
  )
  assert.ok(Math.abs(f.regime.vixTerm! - 0.8) < 1e-9)
})
