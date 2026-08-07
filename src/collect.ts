import {
  atr, distFromSma, macd, momentum12_1, pctChange,
  realizedVol, rsi, week52Position,
} from './indicators.ts'
import { fetchDaily, fetchRegionValuation } from './sources/yahoo.ts'
import { fetchForeignRatio, fetchNaverDaily } from './sources/naver.ts'
import { fetchFredSeries, hasFredKey } from './sources/fred.ts'
import { kstDate, upsertSnapshots } from './db.ts'
import { MARKET_CODES } from './types.ts'
import type {
  AssetFeature, FeatureSet, MacroBlock, MarketCode, Ohlcv, RegionRelative, RegionValuation,
} from './types.ts'

export const SYMBOLS: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': '나스닥 종합',
  '^KS11': 'KOSPI',
  '^KQ11': 'KOSDAQ',
  '^N225': '닛케이225',
  '^STOXX50E': '유로스톡스50',
  SPY: 'S&P 500 ETF',
  RSP: 'S&P 500 동일가중 ETF',
  EWY: '한국 ETF (USD)',
  EWJ: '일본 ETF (USD)',
  VGK: '유럽 ETF (USD)',
  EEM: '이머징 ETF (USD)',
  EFA: '선진국 ex-미국·캐나다 ETF (USD)',
  ACWI: '전세계 ETF (USD)',
  '^VIX': 'VIX',
  '^VIX3M': 'VIX 3M',
  'KRW=X': '원달러',
  'JPY=X': '달러엔',
  'EURUSD=X': '유로달러',
  'DX-Y.NYB': '달러인덱스',
  'CL=F': 'WTI',
}

/**
 * 시장별 대표 ETF. 전부 USD 표시다 — 현지통화 지수로 지역을 비교하면
 * 환율 효과가 빠져서 "달러로 벌었나"라는 실제 질문에 답하지 못한다.
 */
export const REGION_ETFS: Record<MarketCode, string> = {
  US: 'SPY', KR: 'EWY', JP: 'EWJ', EU: 'VGK', EM: 'EEM',
}

/** 지역 상대성과의 기준 지수. */
export const REGION_BENCHMARK = 'ACWI'

export const SECTOR_ETFS: Record<string, string> = {
  XLK: '기술', XLF: '금융', XLE: '에너지', XLV: '헬스케어',
  XLI: '산업재', XLY: '경기소비재', XLP: '필수소비재', XLU: '유틸리티',
  XLB: '소재', XLRE: '리츠', XLC: '커뮤니케이션',
}

// 한국 지수는 Yahoo가 실패하면 네이버로 폴백한다.
const KR_FALLBACK: Record<string, string> = { '^KS11': 'KOSPI', '^KQ11': 'KOSDAQ' }

const round4 = (n: number): number => Math.round(n * 10000) / 10000

export async function collectPrices(): Promise<Record<string, Ohlcv[]>> {
  const symbols = [...Object.keys(SYMBOLS), ...Object.keys(SECTOR_ETFS)]
  const out: Record<string, Ohlcv[]> = {}
  // 순차 수집. rate limit 회피가 속도보다 중요하다.
  for (const s of symbols) {
    try {
      const bars = await fetchDaily(s)
      if (bars.length > 0) out[s] = bars
      else throw new Error('빈 시계열')
    } catch (e) {
      const fallback = KR_FALLBACK[s]
      if (!fallback) {
        console.error(`price fetch 실패 ${s}: ${(e as Error).message}`)
        continue
      }
      try {
        const bars = await fetchNaverDaily(fallback)
        if (bars.length > 0) {
          out[s] = bars
          console.error(`${s}는 네이버 폴백 사용`)
        } else {
          console.error(`price fetch 실패 ${s} (폴백도 빈 시계열)`)
        }
      } catch (e2) {
        console.error(`price fetch 실패 ${s} (폴백도 실패): ${(e2 as Error).message}`)
      }
    }
  }
  return out
}

const last = (obs: { value: number | null }[]): number | null =>
  [...obs].reverse().find((o) => o.value !== null)?.value ?? null

// 월간 시리즈의 전년동월 대비 변화율
function yoy(obs: { value: number | null }[]): number | null {
  const v = obs.filter((o) => o.value !== null)
  if (v.length < 13) return null
  const now = v.at(-1)!.value!
  const yearAgo = v.at(-13)!.value!
  return yearAgo === 0 ? null : now / yearAgo - 1
}

export async function collectMacro(): Promise<MacroBlock> {
  const empty: MacroBlock = {
    available: false, dgs2: null, dgs10: null, dgs3mo: null,
    cpiYoY: null, coreCpiYoY: null, unrate: null, hySpread: null,
  }
  if (!hasFredKey()) {
    console.error('FRED_API_KEY 없음 — 매크로 블록을 건너뜁니다')
    return empty
  }
  const start = new Date(Date.now() - 800 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const [dgs2, dgs10, dgs3mo, cpi, core, unrate, hy] = await Promise.allSettled([
    fetchFredSeries('DGS2', start),
    fetchFredSeries('DGS10', start),
    fetchFredSeries('DGS3MO', start),
    fetchFredSeries('CPIAUCSL', start),
    fetchFredSeries('CPILFESL', start),
    fetchFredSeries('UNRATE', start),
    fetchFredSeries('BAMLH0A0HYM2', start),
  ])
  const results = [dgs2, dgs10, dgs3mo, cpi, core, unrate, hy]
  for (const r of results) if (r.status === 'rejected') console.error(`FRED 시리즈 수집 실패: ${(r.reason as Error).message}`)
  const value = <T>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null)
  const anyOk = results.some((r) => r.status === 'fulfilled')
  return {
    available: anyOk,
    dgs2: last(value(dgs2) ?? []), dgs10: last(value(dgs10) ?? []), dgs3mo: last(value(dgs3mo) ?? []),
    cpiYoY: yoy(value(cpi) ?? []), coreCpiYoY: yoy(value(core) ?? []),
    unrate: last(value(unrate) ?? []), hySpread: last(value(hy) ?? []),
  }
}

function assetFeature(symbol: string, bars: Ohlcv[]): AssetFeature {
  const closes = bars.map((b) => b.close)
  const m = macd(closes)
  return {
    symbol,
    close: closes[closes.length - 1],
    distSma20: distFromSma(closes, 20),
    distSma60: distFromSma(closes, 60),
    distSma200: distFromSma(closes, 200),
    rsi14: rsi(closes, 14),
    macdHist: m ? m.hist : null,
    atr14: atr(bars, 14),
    realizedVol20: realizedVol(closes, 20),
    mom12_1: momentum12_1(closes),
    week52Position: week52Position(bars),
    ret1m: pctChange(closes, 21),
    ret3m: pctChange(closes, 63),
  }
}

/** 지역 ETF 밸류에이션. 하나가 실패해도 나머지는 쓴다 — 없는 것은 빠진 채로 둔다. */
export async function collectRegionValuations(): Promise<Partial<Record<MarketCode, RegionValuation>>> {
  const out: Partial<Record<MarketCode, RegionValuation>> = {}
  for (const [code, etf] of Object.entries(REGION_ETFS) as [MarketCode, string][]) {
    try {
      out[code] = await fetchRegionValuation(etf)
    } catch (e) {
      console.error(`밸류에이션 수집 실패 ${code}(${etf}): ${(e as Error).message}`)
    }
  }
  return out
}

export function buildFeatures(
  prices: Record<string, Ohlcv[]>,
  macro: MacroBlock,
  date = kstDate(),
  foreignRatioSamsung: number | null = null,
  valuation: Partial<Record<MarketCode, RegionValuation>> = {},
): FeatureSet {
  const missing: string[] = []
  const expected = [...Object.keys(SYMBOLS), ...Object.keys(SECTOR_ETFS)]
  for (const s of expected) if (!prices[s] || prices[s].length === 0) missing.push(s)
  for (const code of MARKET_CODES) if (!valuation[code]) missing.push(`valuation:${code}`)
  if (!macro.available) {
    missing.push('fred')
  } else {
    const macroFields: (keyof MacroBlock)[] = [
      'dgs2', 'dgs10', 'dgs3mo', 'cpiYoY', 'coreCpiYoY', 'unrate', 'hySpread',
    ]
    for (const field of macroFields) if (macro[field] === null) missing.push(`fred:${field}`)
  }
  if (foreignRatioSamsung === null) missing.push('naver:foreignRatio')

  const assets: Record<string, AssetFeature> = {}
  for (const [symbol, bars] of Object.entries(prices)) {
    if (bars.length > 0) assets[symbol] = assetFeature(symbol, bars)
  }

  const closesOf = (s: string): number[] | null => {
    const bars = prices[s]
    return bars && bars.length > 0 ? bars.map((b) => b.close) : null
  }
  const lastOf = (s: string): number | null => closesOf(s)?.at(-1) ?? null

  // 브레드스: RSP/SPY 비율이 자신의 60일 평균 대비 어디인가.
  // 500종목을 매일 긁는 대신 쓰는 의도적 근사다.
  let breadth: number | null = null
  const rsp = closesOf('RSP')
  const spy = closesOf('SPY')
  if (rsp && spy) {
    const n = Math.min(rsp.length, spy.length)
    const ratio = Array.from({ length: n }, (_, i) => rsp[rsp.length - n + i] / spy[spy.length - n + i])
    breadth = distFromSma(ratio, 60)
  }

  const vix = lastOf('^VIX')
  const vix3m = lastOf('^VIX3M')
  const usdkrwCloses = closesOf('KRW=X')
  const usdjpyCloses = closesOf('JPY=X')
  const eurusdCloses = closesOf('EURUSD=X')
  const dxyCloses = closesOf('DX-Y.NYB')

  const spy3m = assets['SPY']?.ret3m ?? null
  const rel = (etf: string): number | null => {
    const r = assets[etf]?.ret3m
    return r === undefined || r === null || spy3m === null ? null : r - spy3m
  }

  // 지역 비교의 기준은 SPY가 아니라 ACWI다. SPY 기준으로 재면
  // "미국 대비"가 되어 미국 자신의 상대성과가 항상 0이 되고 비교가 성립하지 않는다.
  const bench1m = assets[REGION_BENCHMARK]?.ret1m ?? null
  const bench3m = assets[REGION_BENCHMARK]?.ret3m ?? null
  const diff = (a: number | null | undefined, b: number | null): number | null =>
    a === undefined || a === null || b === null ? null : a - b

  const regions: RegionRelative[] = MARKET_CODES.map((code) => {
    const etf = REGION_ETFS[code]
    const f = assets[etf]
    return {
      code,
      etf,
      ret1m: f?.ret1m ?? null,
      ret3m: f?.ret3m ?? null,
      rel1m: diff(f?.ret1m, bench1m),
      rel3m: diff(f?.ret3m, bench3m),
    }
  })

  return {
    date,
    assets,
    macro: {
      ...macro,
      curve2s10s: macro.dgs10 !== null && macro.dgs2 !== null ? macro.dgs10 - macro.dgs2 : null,
      curve3m10y: macro.dgs10 !== null && macro.dgs3mo !== null ? macro.dgs10 - macro.dgs3mo : null,
    },
    regime: {
      vixLevel: vix,
      vixTerm: vix !== null && vix3m !== null && vix3m !== 0 ? vix / vix3m : null,
      breadth,
      usdkrw: usdkrwCloses?.at(-1) ?? null,
      usdkrwChange20d: usdkrwCloses ? pctChange(usdkrwCloses, 20) : null,
      usdjpy: usdjpyCloses?.at(-1) ?? null,
      usdjpyChange20d: usdjpyCloses ? pctChange(usdjpyCloses, 20) : null,
      eurusd: eurusdCloses?.at(-1) ?? null,
      eurusdChange20d: eurusdCloses ? pctChange(eurusdCloses, 20) : null,
      dxyChange20d: dxyCloses ? pctChange(dxyCloses, 20) : null,
    },
    relative: {
      krVsUs3m: rel('EWY'),
      benchmark: REGION_BENCHMARK,
      regions,
      emVsDmExUs3m: diff(assets['EEM']?.ret3m, assets['EFA']?.ret3m ?? null),
      emVsAcwi3m: diff(assets['EEM']?.ret3m, bench3m),
      sectors: Object.keys(SECTOR_ETFS).map((etf) => ({ etf, rel3m: rel(etf) })),
    },
    valuation,
    foreignRatioSamsung,
    missing,
  }
}

export async function runCollect(): Promise<void> {
  const date = kstDate()
  const [prices, macro, valuation] = await Promise.all([
    collectPrices(), collectMacro(), collectRegionValuations(),
  ])

  let foreignRatio: number | null = null
  try {
    foreignRatio = await fetchForeignRatio('005930')
  } catch (e) {
    console.error(`외국인소진율 수집 실패: ${(e as Error).message}`)
  }

  // 저장용 시계열은 마지막 260봉만 남기고 OHLC를 소수 4자리로 반올림한다.
  // 260봉은 수집분의 대부분이라 트림만으로는 약 10%만 줄고(903,548B -> 816,556B 실측),
  // 반올림이 지수 종가의 거짓 정밀도(예: 7437.6298828125)를 없애 564,707B까지 추가로 줄인다.
  // 리텐션/프루닝은 의도적으로 만들지 않았다 — 500MB 무료 티어까지 아직 여유가 있다.
  // buildFeatures는 이 트림/반올림과 무관하게 원본 정밀도의 전체 시계열을 그대로 받는다.
  const trimmed = Object.fromEntries(
    Object.entries(prices).map(([s, bars]) => [
      s,
      bars.slice(-260).map((b) => ({
        ...b,
        open: round4(b.open), high: round4(b.high), low: round4(b.low), close: round4(b.close),
      })),
    ]),
  )

  const features = buildFeatures(prices, macro, date, foreignRatio, valuation)
  await upsertSnapshots([
    { kind: 'prices', date, payload: trimmed },
    { kind: 'macro', date, payload: macro },
    { kind: 'features', date, payload: features },
  ])

  console.log(
    `수집 완료 ${date}: 심볼 ${Object.keys(prices).length}개, 매크로 ${macro.available ? 'OK' : '없음'}, 결측 ${features.missing.length}건`,
  )
  if (features.missing.length > 0) console.log(`결측: ${features.missing.join(', ')}`)
}
