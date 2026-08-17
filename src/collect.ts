import {
  atr, correlation, distFromSma, logReturns, macd, momentum12_1, pctChange,
  pctRank, realizedVol, rsi, week52Position,
} from './indicators.ts'
import { fetchDaily, fetchDistYield, fetchRegionValuation } from './sources/yahoo.ts'
import { fetchForeignRatio, fetchNaverDaily } from './sources/naver.ts'
import { fetchFredSeries, hasFredKey } from './sources/fred.ts'
import { fetchDbnomicsSeries } from './sources/dbnomics.ts'
import { kstDate, readValuationHistory, upsertSnapshots } from './db.ts'
import { MARKET_CODES } from './types.ts'
import type {
  AssetFeature, DurationRead, FeatureSet, MacroBlock, MacroSeries, MarketCode, Ohlcv,
  RegionCorr, RegionMacro, RegionRelative, RegionValuation, RegionValuationRanked, SleeveAsset,
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

export const SECTOR_ETFS_US: Record<string, string> = {
  XLK: '기술', XLF: '금융', XLE: '에너지', XLV: '헬스케어',
  XLI: '산업재', XLY: '경기소비재', XLP: '필수소비재', XLU: '유틸리티',
  XLB: '소재', XLRE: '리츠', XLC: '커뮤니케이션',
}

/**
 * 한국 섹터 ETF. Yahoo에 밸류에이션이 아예 없다 — summaryDetail.trailingPE,
 * topHoldings 둘 다 undefined로 확인됨(quoteSummary 실측). 그래서 모멘텀만 실측이고
 * `sectorValuation`의 per/pbr/psr은 US·EU와 같은 경로를 태워도 전부 null로 채워진다.
 * 그래도 "코스피 대비 이 섹터가 오르는가"는 실측으로 답할 수 있다 — 이전엔 그것도 없었다.
 */
export const SECTOR_ETFS_KR: Record<string, string> = {
  '091160.KS': '반도체', '139270.KS': '금융', '227550.KS': '산업재',
  '091180.KS': '자동차', '143860.KS': '헬스케어', '139250.KS': '에너지화학',
  '305540.KS': '2차전지', '139290.KS': '경기소비재',
}

/**
 * 유럽 섹터 ETF(iShares STOXX Europe 600, ICB 슈퍼섹터 기준). 미국 GICS 11개와
 * 1:1로 안 맞는다 — 은행/금융서비스/보험이 나뉘어 있고 리츠에 해당하는 것이 없다.
 * 모멘텀·밸류에이션 둘 다 미국과 같은 경로로 실측된다(quoteSummary에 PER 포함 확인됨).
 */
export const SECTOR_ETFS_EU: Record<string, string> = {
  'EXV3.DE': '기술', 'EXV1.DE': '은행', 'EXH2.DE': '금융서비스', 'EXH5.DE': '보험',
  'EXH1.DE': '에너지', 'EXV4.DE': '헬스케어', 'EXH4.DE': '산업재', 'EXH9.DE': '유틸리티',
  'EXV6.DE': '소재', 'EXV2.DE': '통신', 'EXH7.DE': '경기소비재', 'EXH3.DE': '필수소비재',
}

export const SECTOR_ETFS: Record<string, string> = {
  ...SECTOR_ETFS_US, ...SECTOR_ETFS_KR, ...SECTOR_ETFS_EU,
}

/**
 * 채권 sleeve 후보. 전부 USD 표시 ETF다 — REGION_ETFS와 같은 이유다.
 *
 * **유럽 단독 소버린은 USD 표시 상품이 없다.** XETRA/암스테르담 상장분(IEGA·EUNH 등)은
 * 전부 EUR 표시라 여기 섞으면 환율 효과가 빠진 수익률을 비교하게 된다. 그래서
 * BWX(미국 외 선진국 국채, USD 무헤지)로 대신하고, 유럽 고유 금리는 이미 있는
 * `regionMacro.EU.bond10y`(분트 10년물)로 본다. BWX는 유럽 비중이 가장 크지만
 * 일본도 상당히 들어 있어 "유럽"이라고 부르면 안 된다.
 */
export const BOND_ETFS: { ticker: string; bucket: string; label: string }[] = [
  { ticker: 'SHY', bucket: 'sovereign', label: '미국 국채 1-3년' },
  { ticker: 'IEF', bucket: 'sovereign', label: '미국 국채 7-10년' },
  { ticker: 'TLT', bucket: 'sovereign', label: '미국 국채 20년+' },
  { ticker: 'BWX', bucket: 'sovereign', label: '선진국(미국 외) 국채, 무헤지' },
  { ticker: 'TIP', bucket: 'inflation', label: '미국 물가연동채' },
  { ticker: 'LQD', bucket: 'credit', label: '미국 IG 회사채' },
  { ticker: 'HYG', bucket: 'credit', label: '미국 HY 회사채' },
  { ticker: 'BKLN', bucket: 'credit', label: '시니어론(변동금리)' },
  { ticker: 'EMB', bucket: 'em', label: '이머징 소버린(USD)' },
  { ticker: 'EMLC', bucket: 'em', label: '이머징 로컬통화' },
]

/**
 * 대체자산 sleeve 후보. 전부 USD 표시 상장상품이다.
 *
 * PE·사모대출은 비상장이라 실측할 방법이 없어 **상장 대리지표**를 쓴다 —
 * PSP(상장 PE 운용사)와 BIZD(BDC)는 실제 사모 포트폴리오보다 변동성이 크고
 * 주식과 상관이 훨씬 높다. 분산 근거로 쓰기 전에 `corrToEquity60d`를 반드시 확인해야 한다.
 */
export const ALT_ETFS: { ticker: string; bucket: string; label: string }[] = [
  { ticker: 'GLD', bucket: 'precious', label: '금' },
  { ticker: 'SLV', bucket: 'precious', label: '은' },
  { ticker: 'DBB', bucket: 'industrial', label: '산업금속(비철)' },
  { ticker: 'DBC', bucket: 'industrial', label: '종합 원자재' },
  { ticker: 'PSP', bucket: 'private', label: '상장 PE(대리지표)' },
  { ticker: 'BIZD', bucket: 'private', label: 'BDC 사모대출(대리지표)' },
  { ticker: 'IGF', bucket: 'real', label: '글로벌 인프라' },
  { ticker: 'VNQ', bucket: 'real', label: '미국 리츠' },
  { ticker: 'REET', bucket: 'real', label: '글로벌 리츠' },
]

/** 채권 sleeve의 상대성과 기준. 미국 종합채권지수다. */
export const BOND_BENCHMARK = 'AGG'

/** 듀레이션 사다리. 짧은 것부터 긴 것까지 — 여기서 만기 축 판단이 나온다. */
export const DURATION_LADDER = { short: 'SHY', intermediate: 'IEF', long: 'TLT' } as const

const SLEEVE_TICKERS = [
  ...BOND_ETFS.map((b) => b.ticker),
  ...ALT_ETFS.map((a) => a.ticker),
  BOND_BENCHMARK,
]

/** 섹터 ETF의 소속 지역. rel3m을 어느 지역 벤치마크로 잴지, 프롬프트에 무엇으로 표기할지 정한다. */
export const SECTOR_REGION: Record<string, MarketCode> = {
  ...Object.fromEntries(Object.keys(SECTOR_ETFS_US).map((k) => [k, 'US' as const])),
  ...Object.fromEntries(Object.keys(SECTOR_ETFS_KR).map((k) => [k, 'KR' as const])),
  ...Object.fromEntries(Object.keys(SECTOR_ETFS_EU).map((k) => [k, 'EU' as const])),
}

// 한국 지수는 Yahoo가 실패하면 네이버로 폴백한다.
const KR_FALLBACK: Record<string, string> = { '^KS11': 'KOSPI', '^KQ11': 'KOSDAQ' }

const round4 = (n: number): number => Math.round(n * 10000) / 10000

export async function collectPrices(): Promise<Record<string, Ohlcv[]>> {
  const symbols = [...Object.keys(SYMBOLS), ...Object.keys(SECTOR_ETFS), ...SLEEVE_TICKERS]
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

/** 미국 2년물 대비 정책금리 차(%p). 둘 중 하나라도 null이면 null — 결측을 0으로 읽지 않는다. */
export function rateDiff(usDgs2: number | null, regionPolicy: number | null): number | null {
  return usDgs2 !== null && regionPolicy !== null ? usDgs2 - regionPolicy : null
}

// 월간 시리즈의 전년동월 대비 변화율
function yoy(obs: { value: number | null }[]): number | null {
  const v = obs.filter((o) => o.value !== null)
  if (v.length < 13) return null
  const now = v.at(-1)!.value!
  const yearAgo = v.at(-13)!.value!
  return yearAgo === 0 ? null : now / yearAgo - 1
}

type Obs = { date: string; value: number | null }

/** 결측을 버리고 최근 n개만, 소수 3자리로. 화면에 그릴 시계열이라 정밀도가 더 필요 없다. */
function toSeries(obs: Obs[] | null, n: number): { date: string; value: number }[] {
  if (!obs) return []
  return obs
    .filter((o): o is { date: string; value: number } => o.value !== null && Number.isFinite(o.value))
    .slice(-n)
    .map((o) => ({ date: o.date, value: Math.round(o.value * 1000) / 1000 }))
}

/** 두 시계열을 날짜로 맞춰 뺀다. 곡선(장기−단기)을 만드는 데 쓴다. */
function diffSeries(
  a: { date: string; value: number }[],
  b: { date: string; value: number }[],
): { date: string; value: number }[] {
  const bm = new Map(b.map((o) => [o.date, o.value]))
  return a.flatMap((o) => {
    const other = bm.get(o.date)
    return other === undefined ? [] : [{ date: o.date, value: Math.round((o.value - other) * 1000) / 1000 }]
  })
}

/** 월간 지수에서 전년동월비(%) 시계열. cpiYoY/coreCpiYoY가 이 형태다. */
function yoySeries(obs: Obs[] | null, n: number): { date: string; value: number }[] {
  const v = (obs ?? []).filter((o): o is { date: string; value: number } => o.value !== null)
  const out: { date: string; value: number }[] = []
  for (let i = 12; i < v.length; i++) {
    const prev = v[i - 12].value
    if (prev === 0) continue
    out.push({ date: v[i].date, value: Math.round((v[i].value / prev - 1) * 100000) / 1000 })
  }
  return out.slice(-n)
}

export async function collectMacro(): Promise<{ macro: MacroBlock; series: MacroSeries }> {
  const empty: MacroBlock = {
    available: false, dgs2: null, dgs10: null, dgs3mo: null,
    cpiYoY: null, coreCpiYoY: null, unrate: null, hySpread: null,
    igSpread: null, realYield10y: null, breakeven10y: null,
  }
  if (!hasFredKey()) {
    console.error('FRED_API_KEY 없음 — 매크로 블록을 건너뜁니다')
    return { macro: empty, series: {} }
  }
  const start = new Date(Date.now() - 800 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const [dgs2, dgs10, dgs3mo, cpi, core, unrate, hy, ig, real10, be10] = await Promise.allSettled([
    fetchFredSeries('DGS2', start),
    fetchFredSeries('DGS10', start),
    fetchFredSeries('DGS3MO', start),
    fetchFredSeries('CPIAUCSL', start),
    fetchFredSeries('CPILFESL', start),
    fetchFredSeries('UNRATE', start),
    fetchFredSeries('BAMLH0A0HYM2', start),
    fetchFredSeries('BAMLC0A0CM', start),
    fetchFredSeries('DFII10', start),
    fetchFredSeries('T10YIE', start),
  ])
  const results = [dgs2, dgs10, dgs3mo, cpi, core, unrate, hy, ig, real10, be10]
  for (const r of results) if (r.status === 'rejected') console.error(`FRED 시리즈 수집 실패: ${(r.reason as Error).message}`)
  const value = <T>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null)
  const anyOk = results.some((r) => r.status === 'fulfilled')
  const macro: MacroBlock = {
    available: anyOk,
    dgs2: last(value(dgs2) ?? []), dgs10: last(value(dgs10) ?? []), dgs3mo: last(value(dgs3mo) ?? []),
    cpiYoY: yoy(value(cpi) ?? []), coreCpiYoY: yoy(value(core) ?? []),
    unrate: last(value(unrate) ?? []), hySpread: last(value(hy) ?? []),
    igSpread: last(value(ig) ?? []),
    realYield10y: last(value(real10) ?? []), breakeven10y: last(value(be10) ?? []),
  }

  // 화면이 근거 경로(features.macro.X)로 바로 찾을 수 있게 키를 필드명과 맞춘다.
  // 일간 시리즈는 1년(260), 월간은 5년(60)이면 추이를 읽기에 충분하다.
  const D = 260, M = 60
  const s2 = toSeries(value(dgs2), D)
  const s10 = toSeries(value(dgs10), D)
  const s3m = toSeries(value(dgs3mo), D)
  const series: MacroSeries = {
    dgs2: s2,
    dgs10: s10,
    dgs3mo: s3m,
    curve2s10s: diffSeries(s10, s2),
    curve3m10y: diffSeries(s10, s3m),
    hySpread: toSeries(value(hy), D),
    igSpread: toSeries(value(ig), D),
    realYield10y: toSeries(value(real10), D),
    breakeven10y: toSeries(value(be10), D),
    unrate: toSeries(value(unrate), M),
    cpiYoY: yoySeries(value(cpi), M),
    coreCpiYoY: yoySeries(value(core), M),
  }
  return { macro, series }
}

/**
 * sleeve ETF의 분배수익률. 하나가 실패해도 나머지는 쓴다 —
 * 수익률이 없으면 그 자산은 모멘텀만으로 판단하게 되고, 그 사실이 null로 드러난다.
 */
export async function collectSleeveYields(): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {}
  for (const { ticker } of [...BOND_ETFS, ...ALT_ETFS]) {
    try {
      // Yahoo가 0.044699997처럼 부동소수점 noise를 섞어 준다. 반올림하지 않으면
      // 그대로 프롬프트에 실려 모델이 "4.4699997%"를 인용한다.
      const y = await fetchDistYield(ticker)
      out[ticker] = y === null ? null : round4(y)
    } catch (e) {
      console.error(`분배수익률 수집 실패 ${ticker}: ${(e as Error).message}`)
      out[ticker] = null
    }
  }
  return out
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

/**
 * 시장별 금리·물가. 시리즈 ID는 실측으로 골랐다 —
 * FRED에 존재해도 값이 안 오거나 반년씩 밀린 것들이 있어서 최근값이 실제로 오는 것만 남겼다.
 *
 * 유로존 10년물(IRLTLT01EZM156N)은 7개월 밀려 있어 독일 분트로 대체했다 — 유로존 벤치마크 금리다.
 * 일본·한국 CPI는 FRED에 최신 시리즈가 없어(각각 2021·2023년에 갱신 중단) DBnomics로 뺐다.
 */
const REGION_MACRO_SERIES: Record<MarketCode, {
  policy?: string; bond10y?: string; cpiIndex?: string; credit?: string
  /**
   * FRED로 못 구하는 CPI를 DBnomics에서 받는다.
   * `kind`가 'index'면 지수라 전년동월비를 직접 계산하고, 'percent'면 이미 전년동월비(%)다.
   * 이 필드를 잘못 쓰면 3%가 300%가 되므로 반드시 명시한다.
   */
  cpiDbnomics?: { code: string; kind: 'index' | 'percent' }
  proxyNote?: string
}> = {
  US: { policy: 'DFEDTARU', bond10y: 'DGS10', credit: 'BAMLH0A0HYM2' },
  EU: {
    policy: 'ECBDFR', bond10y: 'IRLTLT01DEM156N', cpiIndex: 'CP0000EZ19M086NEST',
    credit: 'BAMLHE00EHYIOAS',
    proxyNote: '10년물은 독일 분트(유로존 벤치마크), CPI는 유로존 HICP 지수에서 전년동월비 계산. '
      + '신용스프레드는 유로 하이일드 OAS(일간)',
  },
  JP: {
    policy: 'IRSTCI01JPM156N', bond10y: 'IRLTLT01JPM156N',
    // 일본 통계청(STATJP) 전국 종합 CPI 지수. FRED·OECD·IMF 미러가 전부 낡아서 여기로 왔다.
    cpiDbnomics: { code: 'STATJP/CPIm/001', kind: 'index' },
    // 일본 단독 신용스프레드는 FRED에 시리즈 자체가 없다(검색해도 무관한 EM 지수만 나온다).
    // 일본은 선진국이라 "EM 회사채" 계열의 대리조차 성립하지 않는다 — 진짜로 없는 데이터다.
    proxyNote: '정책금리는 단기금리 대리지표. CPI는 일본 통계청(STATJP) 지수에서 전년동월비 계산. '
      + '신용스프레드는 무료 소스에서 확보 실패(유료 벤더 필요, iTraxx Japan 등)',
  },
  KR: {
    policy: 'IR3TIB01KRM156N', bond10y: 'IRLTLT01KRM156N',
    // OECD 신규 물가 데이터플로우. 이미 전년동월비(%)로 온다.
    cpiDbnomics: { code: 'OECD/DSD_PRICES@DF_PRICES_ALL/KOR.M.N.CPI.PA._T.N.GY', kind: 'percent' },
    // 한국 단독 신용스프레드는 FRED에 없다. ICE BofA 아시아 EM 회사채 OAS로 대체한다 —
    // 한국·중국·인도네시아 등이 섞인 지역 지수라 한국 고유 리스크가 아니라
    // "아시아 신흥 신용 여건"을 보는 것이다. 그래도 없는 것보다는 방향 정보가 된다.
    credit: 'BAMLEMRACRPIASIAOAS',
    proxyNote: '정책금리는 3개월 은행간금리 대리지표. CPI는 OECD 조화지표(전년동월비). '
      + '신용스프레드는 한국 단독이 아니라 ICE BofA 아시아 신흥국 회사채 OAS(지역 종합)',
  },
  EM: {
    credit: 'BAMLEMCBPIOAS',
    proxyNote: 'EM은 단일 통화·금리 주체가 없어 정책금리를 수집하지 않는다. '
      + '신용스프레드는 EM 회사채 OAS(일간)로 리스크 국면만 본다',
  },
}

/**
 * CPI 관측치를 `cpiYoY` 필드의 단위(**비율**)로 맞춘다.
 *
 * 소스마다 형태가 다르다 — 일본 통계청은 지수(113.6), OECD 한국은 이미 전년동월비 퍼센트(3.14).
 * 이걸 헷갈리면 3%가 300%가 되고, 그 값이 그대로 매크로 판단에 들어간다.
 * 그래서 변환을 한 곳에 모으고 테스트로 고정한다.
 */
export function cpiFromObs(
  obs: { date: string; value: number | null }[],
  kind: 'index' | 'percent',
): { value: number | null; asOf: string | null } {
  if (kind === 'index') return { value: yoy(obs), asOf: lastWithDate(obs).asOf }
  const hit = lastWithDate(obs)
  return { value: hit.value === null ? null : hit.value / 100, asOf: hit.asOf }
}

/** 마지막 유효 관측값과 그 날짜를 함께 돌려준다. 날짜 없이 값만 쓰면 지연을 못 본다. */
function lastWithDate(
  obs: { date: string; value: number | null }[],
): { value: number | null; asOf: string | null } {
  const hit = [...obs].reverse().find((o) => o.value !== null)
  return { value: hit?.value ?? null, asOf: hit?.date ?? null }
}

export async function collectRegionMacro(): Promise<{
  macro: Partial<Record<MarketCode, RegionMacro>>
  series: MacroSeries
}> {
  const creditSeries: MacroSeries = {}
  const out: Partial<Record<MarketCode, RegionMacro>> = {}
  if (!hasFredKey()) {
    console.error('FRED_API_KEY 없음 — 지역 매크로를 건너뜁니다')
    return { macro: out, series: creditSeries }
  }
  const start = new Date(Date.now() - 800 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  // rateDiffToUs2y의 기준값. collectMacro()도 같은 시리즈(DGS2)를 따로 받는데, 두 함수가
  // runCollect()에서 Promise.all로 병렬 실행돼 서로의 결과를 못 본다 — 작은 시리즈 하나
  // 중복 호출이 함수 간 의존성을 만드는 것보다 싸다.
  let usDgs2: number | null = null
  try {
    usDgs2 = last(await fetchFredSeries('DGS2', start))
  } catch (e) {
    console.error(`rateDiffToUs2y용 미국 2년물 실패: ${(e as Error).message}`)
  }

  for (const [code, cfg] of Object.entries(REGION_MACRO_SERIES) as [MarketCode, typeof REGION_MACRO_SERIES[MarketCode]][]) {
    const get = async (id?: string) => {
      if (!id) return { value: null, asOf: null }
      try {
        return lastWithDate(await fetchFredSeries(id, start))
      } catch (e) {
        console.error(`지역 매크로 ${code}/${id} 실패: ${(e as Error).message}`)
        return { value: null, asOf: null }
      }
    }
    const policy = await get(cfg.policy)
    const bond = await get(cfg.bond10y)

    let cpi: { value: number | null; asOf: string | null } = { value: null, asOf: null }
    if (cfg.cpiIndex) {
      try {
        const obs = await fetchFredSeries(cfg.cpiIndex, start)
        cpi = { value: yoy(obs), asOf: lastWithDate(obs).asOf }
      } catch (e) {
        console.error(`지역 CPI ${code} 실패: ${(e as Error).message}`)
      }
    } else if (cfg.cpiDbnomics) {
      try {
        cpi = cpiFromObs(await fetchDbnomicsSeries(cfg.cpiDbnomics.code), cfg.cpiDbnomics.kind)
      } catch (e) {
        console.error(`지역 CPI ${code} (DBnomics) 실패: ${(e as Error).message}`)
      }
    }

    // 신용스프레드는 수준보다 방향이 신호다. 20거래일 변화를 함께 낸다.
    let credit: { value: number | null; asOf: string | null; chg20d: number | null } =
      { value: null, asOf: null, chg20d: null }
    if (cfg.credit) {
      try {
        const obs = (await fetchFredSeries(cfg.credit, start)).filter((o) => o.value !== null)
        // 근거가 지역 신용스프레드를 인용하면 그 스프레드 자신의 추이를 그려야 한다.
        // 시계열을 안 남기면 화면이 지역 ETF 가격을 대신 붙여 다른 값을 보여주게 된다.
        creditSeries[`regionMacro.${code}.creditSpread`] = toSeries(obs, 260)
        const last = obs.at(-1)
        const prev = obs.at(-21)
        credit = {
          value: last?.value ?? null,
          asOf: last?.date ?? null,
          chg20d: last?.value != null && prev?.value != null ? last.value - prev.value : null,
        }
      } catch (e) {
        console.error(`지역 신용스프레드 ${code} 실패: ${(e as Error).message}`)
      }
    }

    out[code] = {
      policyRate: policy.value, policyRateAsOf: policy.asOf,
      bond10y: bond.value, bond10yAsOf: bond.asOf,
      cpiYoY: cpi.value, cpiYoYAsOf: cpi.asOf,
      creditSpread: credit.value,
      creditSpreadAsOf: credit.asOf,
      creditSpread20dChg: credit.chg20d,
      rateDiffToUs2y: rateDiff(usDgs2, policy.value),
      proxyNote: cfg.proxyNote ?? null,
    }
  }
  return { macro: out, series: creditSeries }
}

/**
 * 백분위를 내주기 위한 최소 표본. 60거래일 = 약 3개월.
 *
 * 이보다 적으면 백분위가 정보가 아니라 소음이다 — 추세장에서 20일치로 재면
 * 거의 모든 값이 0 또는 100으로 나와 "역사적 고점"처럼 보이는 착시를 만든다.
 * 표본이 모자라면 숫자를 지어내지 않고 null을 주고, historyDays로 진행도를 알린다.
 */
export const MIN_VALUATION_HISTORY = 60

/**
 * 현재 밸류에이션에 자기 역사 대비 백분위를 붙인다.
 * 순수 함수 — DB 접근은 호출부가 한다.
 */
export function rankValuationVsHistory(
  current: Partial<Record<MarketCode, RegionValuation>>,
  history: { valuation: Partial<Record<MarketCode, RegionValuation>> }[],
): Partial<Record<MarketCode, RegionValuationRanked>> {
  const out: Partial<Record<MarketCode, RegionValuationRanked>> = {}
  for (const [code, v] of Object.entries(current) as [MarketCode, RegionValuation][]) {
    const past = history.map((h) => h.valuation[code]).filter((x): x is RegionValuation => !!x)
    const enough = past.length >= MIN_VALUATION_HISTORY
    const rank = (
      pick: (x: RegionValuation) => number | null,
      now: number | null,
    ): number | null => {
      if (!enough || now === null) return null
      return pctRank(past.map(pick), now)
    }
    out[code] = {
      ...v,
      perPctile: rank((x) => x.per, v.per),
      pbrPctile: rank((x) => x.pbr, v.pbr),
      historyDays: past.length,
    }
  }
  return out
}

/** 섹터 ETF 밸류에이션. 지역 ETF와 같은 경로를 쓴다 — 이미 있는 것을 다시 만들지 않는다. */
export async function collectSectorValuations(): Promise<Partial<Record<string, RegionValuation>>> {
  const out: Partial<Record<string, RegionValuation>> = {}
  for (const etf of Object.keys(SECTOR_ETFS)) {
    try {
      out[etf] = await fetchRegionValuation(etf)
    } catch (e) {
      console.error(`섹터 밸류에이션 실패 ${etf}: ${(e as Error).message}`)
    }
  }
  return out
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
  valuation: Partial<Record<MarketCode, RegionValuationRanked>> = {},
  regionMacro: Partial<Record<MarketCode, RegionMacro>> = {},
  sectorValuation: Partial<Record<string, RegionValuation>> = {},
  sleeveYields: Record<string, number | null> = {},
): FeatureSet {
  const missing: string[] = []
  const expected = [...Object.keys(SYMBOLS), ...Object.keys(SECTOR_ETFS), ...SLEEVE_TICKERS]
  for (const s of expected) if (!prices[s] || prices[s].length === 0) missing.push(s)
  for (const code of MARKET_CODES) if (!valuation[code]) missing.push(`valuation:${code}`)
  if (!macro.available) {
    missing.push('fred')
  } else {
    const macroFields: (keyof MacroBlock)[] = [
      'dgs2', 'dgs10', 'dgs3mo', 'cpiYoY', 'coreCpiYoY', 'unrate', 'hySpread',
      'igSpread', 'realYield10y', 'breakeven10y',
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

  // 섹터 rel3m은 자기 지역 벤치마크 대비다. US 섹터는 SPY 대비(기존과 동일),
  // KR·EU 섹터는 EWY·VGK 대비 — 전부 SPY와 비교하면 "코스피 대비 반도체"가 아니라
  // "미국 대비 반도체"가 되어 지역 내 로테이션 신호가 아니게 된다.
  const sectorRel = (etf: string): number | null => {
    const region = SECTOR_REGION[etf]
    const bench3m = assets[REGION_ETFS[region]]?.ret3m ?? null
    const r = assets[etf]?.ret3m
    return r === undefined || r === null || bench3m === null ? null : r - bench3m
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

  // 주식과의 상관. 대체자산이 실제로 분산되는지를 가르는 유일한 실측값이다 —
  // "금은 안전자산"류의 통념 대신 이 숫자로 판단하게 만드는 자리다.
  const spyRets = (() => {
    const c = closesOf(REGION_ETFS.US)
    return c ? logReturns(c).slice(-60) : null
  })()
  const corrToEquity = (ticker: string): number | null => {
    const c = closesOf(ticker)
    if (!c || !spyRets) return null
    return correlation(logReturns(c).slice(-60), spyRets)
  }

  const bondBench3m = assets[BOND_BENCHMARK]?.ret3m ?? null
  const sleeveOf = (
    spec: { ticker: string; bucket: string; label: string },
    group: 'bond' | 'alt',
  ): SleeveAsset => {
    const f = assets[spec.ticker]
    return {
      ticker: spec.ticker,
      group,
      bucket: spec.bucket,
      label: spec.label,
      distYield: sleeveYields[spec.ticker] ?? null,
      ret1m: f?.ret1m ?? null,
      ret3m: f?.ret3m ?? null,
      // 채권만 벤치마크(AGG) 대비로 잰다. 금을 채권지수와 비교하면 의미가 없다.
      rel3m: group === 'bond' ? diff(f?.ret3m, bondBench3m) : null,
      realizedVol20: f?.realizedVol20 ?? null,
      corrToEquity60d: corrToEquity(spec.ticker),
      distSma200: f?.distSma200 ?? null,
    }
  }
  const sleeves: SleeveAsset[] = [
    ...BOND_ETFS.map((b) => sleeveOf(b, 'bond')),
    ...ALT_ETFS.map((a) => sleeveOf(a, 'alt')),
  ]

  const duration: DurationRead = {
    shortYield: sleeveYields[DURATION_LADDER.short] ?? null,
    intermediateYield: sleeveYields[DURATION_LADDER.intermediate] ?? null,
    longYield: sleeveYields[DURATION_LADDER.long] ?? null,
    longMinusShort3m: diff(
      assets[DURATION_LADDER.long]?.ret3m,
      assets[DURATION_LADDER.short]?.ret3m ?? null,
    ),
    longVol20: assets[DURATION_LADDER.long]?.realizedVol20 ?? null,
    shortVol20: assets[DURATION_LADDER.short]?.realizedVol20 ?? null,
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
      sectors: Object.keys(SECTOR_ETFS).map((etf) => ({ etf, region: SECTOR_REGION[etf], rel3m: sectorRel(etf) })),
    },
    valuation,
    regionMacro,
    // 상관계수는 USD ETF 로그수익률 기준. 지역 비교와 같은 통화 기준이어야 의미가 맞는다.
    regionCorr: (() => {
      const rets = new Map<MarketCode, number[]>()
      for (const code of MARKET_CODES) {
        const c = closesOf(REGION_ETFS[code])
        if (c) rets.set(code, logReturns(c).slice(-60))
      }
      const pairs: RegionCorr[] = []
      for (let i = 0; i < MARKET_CODES.length; i++) {
        for (let j = i + 1; j < MARKET_CODES.length; j++) {
          const a = MARKET_CODES[i]
          const b = MARKET_CODES[j]
          const ra = rets.get(a)
          const rb = rets.get(b)
          pairs.push({ a, b, corr60d: ra && rb ? correlation(ra, rb) : null })
        }
      }
      return pairs
    })(),
    sectorValuation,
    sleeves,
    duration,
    foreignRatioSamsung,
    missing,
  }
}

/**
 * 근거 경로 → 그릴 심볼. `features.sleeves[7]`처럼 **인덱스로 된 경로**는
 * 배열 순서를 알아야 티커를 알 수 있는데, 화면은 features를 통째로 받지 않는다.
 * 그래서 수집 시점에 features에서 직접 만들어 스냅샷에 실어 보낸다 —
 * 순서를 웹에 복제하면 배열이 바뀔 때 조용히 엉뚱한 차트가 붙는다.
 *
 * 레짐 지표는 인덱스가 아니라 이름이지만, 어느 심볼이 그 값의 출처인지는
 * 여기 한 곳에만 적어 둔다.
 */
export function buildChartIndex(features: FeatureSet): Record<string, string> {
  const idx: Record<string, string> = {
    'features.regime.vixLevel': '^VIX',
    'features.regime.vixTerm': '^VIX3M',
    'features.regime.usdkrw': 'KRW=X',
    'features.regime.usdkrwChange20d': 'KRW=X',
    'features.regime.usdjpy': 'JPY=X',
    'features.regime.usdjpyChange20d': 'JPY=X',
    'features.regime.eurusd': 'EURUSD=X',
    'features.regime.eurusdChange20d': 'EURUSD=X',
    'features.regime.dxyChange20d': 'DX-Y.NYB',
    // breadth는 RSP/SPY 비율의 이격이라 어느 한 종목의 가격이 아니다. 넣지 않는다.
    'features.duration.shortYield': DURATION_LADDER.short,
    'features.duration.shortVol20': DURATION_LADDER.short,
    'features.duration.intermediateYield': DURATION_LADDER.intermediate,
    'features.duration.longYield': DURATION_LADDER.long,
    'features.duration.longVol20': DURATION_LADDER.long,
    'features.duration.longMinusShort3m': DURATION_LADDER.long,
  }
  features.sleeves.forEach((s, i) => { idx[`features.sleeves[${i}]`] = s.ticker })
  features.relative.sectors.forEach((s, i) => { idx[`features.relative.sectors[${i}]`] = s.etf })
  features.relative.regions.forEach((r, i) => { idx[`features.relative.regions[${i}]`] = r.etf })
  return idx
}

export async function runCollect(): Promise<void> {
  const date = kstDate()
  const [prices, macroResult, valuation, regionMacroResult, sectorValuation, sleeveYields] = await Promise.all([
    collectPrices(), collectMacro(), collectRegionValuations(),
    collectRegionMacro(), collectSectorValuations(), collectSleeveYields(),
  ])

  const macro = macroResult.macro
  const regionMacro = regionMacroResult.macro

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

  // 오늘 이전 스냅샷에서 밸류에이션 히스토리를 읽어 자기 역사 대비 위치를 계산한다.
  // 실패해도 수집 전체를 멈추지 않는다 — 백분위가 없을 뿐 나머지는 온전하다.
  let ranked: Partial<Record<MarketCode, RegionValuationRanked>>
  try {
    const history = await readValuationHistory(date)
    ranked = rankValuationVsHistory(valuation, history)
    const days = Object.values(ranked)[0]?.historyDays ?? 0
    console.log(
      days >= MIN_VALUATION_HISTORY
        ? `밸류에이션 히스토리 ${days}일 — 자기 역사 대비 백분위 계산됨`
        : `밸류에이션 히스토리 ${days}일 (백분위는 ${MIN_VALUATION_HISTORY}일부터)`,
    )
  } catch (e) {
    console.error(`밸류에이션 히스토리 실패: ${(e as Error).message}`)
    ranked = rankValuationVsHistory(valuation, [])
  }

  const features = buildFeatures(
    prices, macro, date, foreignRatio, ranked, regionMacro, sectorValuation, sleeveYields,
  )
  await upsertSnapshots([
    { kind: 'prices', date, payload: trimmed },
    // 스칼라만이 아니라 시계열도 함께 싣는다 — 화면이 "실질금리 2.39%"의 추이를 그릴 근거다.
    // 화면이 근거 옆에 차트를 그리는 데 필요한 것 전부가 여기 있다.
    // features는 비공개라 anon이 못 읽으므로, 그릴 수 있는 것만 골라 여기 싣는다.
    {
      kind: 'macro',
      date,
      payload: {
        ...macro,
        series: { ...macroResult.series, ...regionMacroResult.series },
        chartIndex: buildChartIndex(features),
        regionCorr: features.regionCorr,
      },
    },
    { kind: 'features', date, payload: features },
  ])

  console.log(
    `수집 완료 ${date}: 심볼 ${Object.keys(prices).length}개, 매크로 ${macro.available ? 'OK' : '없음'}, 결측 ${features.missing.length}건`,
  )
  if (features.missing.length > 0) console.log(`결측: ${features.missing.join(', ')}`)
}
