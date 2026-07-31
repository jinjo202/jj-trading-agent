import {
  atr, distFromSma, macd, momentum12_1, pctChange,
  realizedVol, rsi, week52Position,
} from './indicators.ts'
import { fetchDaily } from './sources/yahoo.ts'
import { fetchForeignRatio, fetchNaverDaily } from './sources/naver.ts'
import { fetchFredSeries, hasFredKey } from './sources/fred.ts'
import { kstDate, upsertSnapshot } from './db.ts'
import type { AssetFeature, FeatureSet, MacroBlock, Ohlcv } from './types.ts'

export const SYMBOLS: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': '나스닥 종합',
  '^KS11': 'KOSPI',
  '^KQ11': 'KOSDAQ',
  SPY: 'S&P 500 ETF',
  RSP: 'S&P 500 동일가중 ETF',
  EWY: '한국 ETF (USD)',
  '^VIX': 'VIX',
  '^VIX3M': 'VIX 3M',
  'KRW=X': '원달러',
  'DX-Y.NYB': '달러인덱스',
  'CL=F': 'WTI',
}

export const SECTOR_ETFS: Record<string, string> = {
  XLK: '기술', XLF: '금융', XLE: '에너지', XLV: '헬스케어',
  XLI: '산업재', XLY: '경기소비재', XLP: '필수소비재', XLU: '유틸리티',
  XLB: '소재', XLRE: '리츠', XLC: '커뮤니케이션',
}

// 한국 지수는 Yahoo가 실패하면 네이버로 폴백한다.
const KR_FALLBACK: Record<string, string> = { '^KS11': 'KOSPI', '^KQ11': 'KOSDAQ' }

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
        out[s] = await fetchNaverDaily(fallback)
        console.error(`${s}는 네이버 폴백 사용`)
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
  try {
    const [dgs2, dgs10, dgs3mo, cpi, core, unrate, hy] = await Promise.all([
      fetchFredSeries('DGS2', start),
      fetchFredSeries('DGS10', start),
      fetchFredSeries('DGS3MO', start),
      fetchFredSeries('CPIAUCSL', start),
      fetchFredSeries('CPILFESL', start),
      fetchFredSeries('UNRATE', start),
      fetchFredSeries('BAMLH0A0HYM2', start),
    ])
    return {
      available: true,
      dgs2: last(dgs2), dgs10: last(dgs10), dgs3mo: last(dgs3mo),
      cpiYoY: yoy(cpi), coreCpiYoY: yoy(core),
      unrate: last(unrate), hySpread: last(hy),
    }
  } catch (e) {
    console.error(`FRED 수집 실패: ${(e as Error).message}`)
    return empty
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

export function buildFeatures(
  prices: Record<string, Ohlcv[]>,
  macro: MacroBlock,
  date = kstDate(),
  foreignRatioSamsung: number | null = null,
): FeatureSet {
  const missing: string[] = []
  const expected = [...Object.keys(SYMBOLS), ...Object.keys(SECTOR_ETFS)]
  for (const s of expected) if (!prices[s] || prices[s].length === 0) missing.push(s)
  if (!macro.available) missing.push('fred')
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

  const spy3m = assets['SPY']?.ret3m ?? null
  const rel = (etf: string): number | null => {
    const r = assets[etf]?.ret3m
    return r === undefined || r === null || spy3m === null ? null : r - spy3m
  }

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
    },
    relative: {
      krVsUs3m: rel('EWY'),
      sectors: Object.keys(SECTOR_ETFS).map((etf) => ({ etf, rel3m: rel(etf) })),
    },
    foreignRatioSamsung,
    missing,
  }
}

export async function runCollect(): Promise<void> {
  const date = kstDate()
  const [prices, macro] = await Promise.all([collectPrices(), collectMacro()])

  let foreignRatio: number | null = null
  try {
    foreignRatio = await fetchForeignRatio('005930')
  } catch (e) {
    console.error(`외국인소진율 수집 실패: ${(e as Error).message}`)
  }

  // 원시 시계열은 마지막 260봉만 저장한다. 200일선 계산에 충분하고 payload가 작다.
  const trimmed = Object.fromEntries(
    Object.entries(prices).map(([s, bars]) => [s, bars.slice(-260)]),
  )
  await upsertSnapshot('prices', date, trimmed)
  await upsertSnapshot('macro', date, macro)

  const features = buildFeatures(prices, macro, date, foreignRatio)
  await upsertSnapshot('features', date, features)

  console.log(
    `수집 완료 ${date}: 심볼 ${Object.keys(prices).length}개, 매크로 ${macro.available ? 'OK' : '없음'}, 결측 ${features.missing.length}건`,
  )
  if (features.missing.length > 0) console.log(`결측: ${features.missing.join(', ')}`)
}
