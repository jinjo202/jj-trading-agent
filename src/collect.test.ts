import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFeatures, rateDiff, SECTOR_ETFS_EU, SECTOR_ETFS_KR } from './collect.ts'
import type { MacroBlock, Ohlcv } from './types.ts'

// 100에서 시작해 매일 +0.1씩 오르는 300봉. 상승 추세.
// high/low를 종가와 같게 두어야 52주 밴드가 종가 범위와 일치하고
// 상승 추세의 마지막 봉이 정확히 52주 고점(position 1)이 된다.
function series(start: number, step: number, n = 300): Ohlcv[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + step * i
    return { date: `d${i}`, open: c, high: c, low: c, close: c, volume: 1000 }
  })
}

const macro: MacroBlock = {
  available: true, dgs2: 3.5, dgs10: 4.2, dgs3mo: 4.5,
  cpiYoY: 0.025, coreCpiYoY: 0.03, unrate: 4.1, hySpread: 3.2,
  igSpread: 0.85, realYield10y: 2.1, breakeven10y: 2.3,
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
    igSpread: null, realYield10y: null, breakeven10y: null,
  }
  const f = buildFeatures({ '^GSPC': series(100, 0.1) }, empty)
  assert.equal(f.macro.curve2s10s, null)
  assert.ok(f.missing.includes('fred'))
})

test('macro가 일부만 채워지면 해당 필드만 missing에 fred:field로 기록된다', () => {
  const partial: MacroBlock = { ...macro, dgs2: null }
  const f = buildFeatures({ '^GSPC': series(100, 0.1) }, partial)
  assert.ok(f.missing.includes('fred:dgs2'))
  assert.ok(!f.missing.includes('fred'))
  assert.equal(f.macro.curve2s10s, null)
  assert.ok(f.macro.curve3m10y !== null)
})

test('VIX 기간구조는 VIX/VIX3M 비율', () => {
  const f = buildFeatures(
    { '^VIX': series(20, 0), '^VIX3M': series(25, 0) },
    macro,
  )
  assert.ok(Math.abs(f.regime.vixTerm! - 0.8) < 1e-9)
})

test('섹터 rel3m은 자기 지역 벤치마크 대비다 — US는 SPY, KR은 EWY, EU는 VGK', () => {
  const krEtf = Object.keys(SECTOR_ETFS_KR)[0]
  const euEtf = Object.keys(SECTOR_ETFS_EU)[0]
  const f = buildFeatures({
    SPY: series(100, 0.2),     // 3개월 초과수익 큼
    EWY: series(100, 0.05),    // KR 벤치마크는 완만한 상승
    VGK: series(100, -0.05),   // EU 벤치마크는 하락
    XLK: series(100, 0.2),     // US 섹터: SPY와 동일 추세 -> rel3m ~ 0
    [krEtf]: series(100, 0.5), // KR 섹터: EWY보다 훨씬 강함 -> rel3m 양수 큼
    [euEtf]: series(100, -0.05), // EU 섹터: VGK와 동일 추세 -> rel3m ~ 0
  }, macro)

  const byEtf = Object.fromEntries(f.relative.sectors.map((s) => [s.etf, s]))
  assert.equal(byEtf['XLK'].region, 'US')
  assert.equal(byEtf[krEtf].region, 'KR')
  assert.equal(byEtf[euEtf].region, 'EU')

  assert.ok(Math.abs(byEtf['XLK'].rel3m!) < 1e-9)
  assert.ok(byEtf[krEtf].rel3m! > 0.1)       // KR 섹터가 EWY를 크게 앞섬
  assert.ok(Math.abs(byEtf[euEtf].rel3m!) < 1e-9) // EU 섹터가 VGK와 같은 추세
})

test('채권 sleeve는 AGG 대비 rel3m을 갖고 대체자산은 벤치마크가 없어 null이다', () => {
  const f = buildFeatures({
    SPY: series(100, 0.1),
    AGG: series(100, 0.02),
    TLT: series(100, 0.2),   // AGG보다 강함 -> rel3m 양수
    GLD: series(100, 0.2),
  }, macro)

  const tlt = f.sleeves.find((s) => s.ticker === 'TLT')!
  const gld = f.sleeves.find((s) => s.ticker === 'GLD')!
  assert.equal(tlt.group, 'bond')
  assert.equal(gld.group, 'alt')
  assert.ok(tlt.rel3m! > 0, 'AGG를 앞선 채권은 rel3m이 양수여야 한다')
  assert.equal(gld.rel3m, null, '대체자산은 채권 벤치마크로 재지 않는다')
})

test('sleeve의 corrToEquity60d는 SPY와의 상관이다 — 같이 움직이면 1에 가깝다', () => {
  // GLD를 SPY와 동일한 궤적으로 두면 상관이 1이어야 한다.
  const f = buildFeatures({
    SPY: series(100, 0.1),
    GLD: series(100, 0.1),
  }, macro)
  const gld = f.sleeves.find((s) => s.ticker === 'GLD')!
  assert.ok(Math.abs(gld.corrToEquity60d! - 1) < 1e-6, '동일 궤적이면 상관 1')
})

test('duration은 사다리 수익률과 TLT-SHY 3개월 차를 싣는다', () => {
  const f = buildFeatures({
    SHY: series(100, 0.01),
    IEF: series(100, 0.05),
    TLT: series(100, 0.2),   // 단기물보다 크게 오름 -> longMinusShort3m 양수
  }, macro, undefined, null, {}, {}, {},
    { SHY: 0.0365, IEF: 0.0396, TLT: 0.0475 })

  assert.equal(f.duration.shortYield, 0.0365)
  assert.equal(f.duration.intermediateYield, 0.0396)
  assert.equal(f.duration.longYield, 0.0475)
  assert.ok(f.duration.longMinusShort3m! > 0, '장기물이 이기면 양수')
})

test('KR 섹터 밸류에이션은 Yahoo에 없으므로 sectorValuation에서 항상 null이어야 한다(문서화된 한계)', () => {
  // collectSectorValuations는 네트워크 호출이라 여기서 직접 부르지 않는다 —
  // fetchRegionValuation이 KR 섹터 ETF에 대해 항상 {per:null,pbr:null,psr:null}을 반환한다는
  // 사실은 실측으로 확인했다(quoteSummary에 topHoldings/summaryDetail.trailingPE 둘 다 없음).
  // 여기서는 buildFeatures가 주어진 sectorValuation을 그대로 통과시키는지만 확인한다.
  const krEtf = Object.keys(SECTOR_ETFS_KR)[0]
  const f = buildFeatures(
    { [krEtf]: series(100, 0.1) }, macro, undefined, null, {}, {},
    { [krEtf]: { symbol: krEtf, per: null, pbr: null, psr: null } },
  )
  assert.deepEqual(f.sectorValuation[krEtf], { symbol: krEtf, per: null, pbr: null, psr: null })
})

test('rateDiff는 미국 2년물에서 지역 정책금리를 뺀다 — 양수면 미국이 높다', () => {
  assert.equal(rateDiff(4.5, 2.5), 2)
  assert.equal(rateDiff(2.5, 4.5), -2)
})

test('rateDiff는 결측을 0으로 읽지 않고 null을 낸다', () => {
  assert.equal(rateDiff(null, 2.5), null)
  assert.equal(rateDiff(4.5, null), null)
  assert.equal(rateDiff(null, null), null)
})
