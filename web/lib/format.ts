import type { DailyVerdict } from './types.ts'

export function equityWeightLabel([lo, hi]: [number, number]): string {
  return lo === hi ? `${lo}%` : `${lo}-${hi}%`
}

const SIGNAL_LABELS: Record<DailyVerdict['signal'], { text: string; className: string }> = {
  increase: { text: '비중 확대', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  hold: { text: '유지', className: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300' },
  reduce: { text: '비중 축소', className: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

export function signalLabel(signal: DailyVerdict['signal']) {
  return SIGNAL_LABELS[signal]
}

const STANCE_CLASSES: Record<'OW' | 'N' | 'UW', string> = {
  OW: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  N: 'bg-neutral-500/20 text-neutral-600 dark:text-neutral-300',
  UW: 'bg-rose-500/20 text-rose-700 dark:text-rose-300',
}

export function stanceClassName(stance: 'OW' | 'N' | 'UW'): string {
  return STANCE_CLASSES[stance]
}

// 50이 중립. 낮을수록 붉게, 높을수록 푸르게.
export function scoreGaugeColor(score: number): string {
  return score >= 50 ? '#059669' : '#e11d48'
}

// 결측은 "-"로 둔다. 0으로 채우면 실제 0%와 구별할 수 없고,
// 없는 데이터를 있는 것처럼 보이게 만든다.
function isMissing(v: number | null | undefined): v is null | undefined {
  return v === null || v === undefined || Number.isNaN(v)
}

/**
 * 비율을 퍼센트 문자열로 만든다.
 * @param scale 입력이 소수 비율(0.12)이면 100, 이미 퍼센트(12.3)면 1
 */
export function pctLabel(
  value: number | null | undefined,
  { scale = 100, sign = true, digits = 1 }: { scale?: number; sign?: boolean; digits?: number } = {},
): string {
  if (isMissing(value)) return '-'
  const pct = value * scale
  const prefix = sign && pct >= 0 ? '+' : ''
  return `${prefix}${pct.toFixed(digits)}%`
}

export function numLabel(value: number | null | undefined, digits = 0): string {
  if (isMissing(value)) return '-'
  return value.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function priceLabel(value: number | null | undefined, market: 'KR' | 'US'): string {
  if (isMissing(value)) return '-'
  return market === 'KR'
    ? `${value.toLocaleString('ko-KR')}원`
    : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// 시가총액은 자릿수가 커서 천단위 구분만으로는 읽히지 않는다. 시장 관행대로 압축한다.
// 매출 추이에도 쓰이므로 음수(적자 분기)가 들어온다. 크기 판정은 절대값으로 하고
// 부호는 따로 붙인다 — 그러지 않으면 음수가 압축을 건너뛰고 원본 자릿수로 새어 나온다.
export function marketCapLabel(value: number | null | undefined, market: 'KR' | 'US'): string {
  if (isMissing(value)) return '-'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (market === 'KR') {
    if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}조`
    if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(0)}억`
    return `${sign}${abs.toLocaleString('ko-KR')}`
  }
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`
  return `${sign}$${(abs / 1e6).toFixed(0)}M`
}

const COMPANY_STANCE_LABELS = {
  positive: { text: '긍정적', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  neutral: { text: '중립', className: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300' },
  cautious: { text: '신중', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
} as const

export function companyStanceLabel(stance: 'positive' | 'neutral' | 'cautious') {
  return COMPANY_STANCE_LABELS[stance]
}

const DESK_STANCE_LABELS = {
  bullish: { text: '강세', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  neutral: { text: '중립', className: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300' },
  bearish: { text: '약세', className: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
} as const

export function deskStanceLabel(stance: 'bullish' | 'neutral' | 'bearish') {
  return DESK_STANCE_LABELS[stance]
}

/** 자산배분 밴드를 "55-70%"로. 하한==상한이면 단일 숫자. */
export function bandLabel([lo, hi]: [number, number]): string {
  return lo === hi ? `${lo}%` : `${lo}-${hi}%`
}

const CCY_SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' }

/**
 * 보유종목의 현지통화 금액. `currency`가 `GBp`(펜스 호가)로 와도 저장된 값 자체는
 * 이미 파운드 단위다(Yahoo의 marketCap 필드 관행 — 가격만 펜스, 시총은 파운드) —
 * 그래서 여기서는 GBp를 GBP로 표기만 바꾸고 100으로 나누지 않는다.
 */
export function holdingAmountLabel(value: number | null | undefined, currency: string | null): string {
  if (isMissing(value) || !currency) return '-'
  if (currency === 'KRW') return marketCapLabel(value, 'KR')
  const ccy = currency === 'GBp' ? 'GBP' : currency
  const sym = CCY_SYMBOL[ccy] ?? `${ccy} `
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(0)}M`
  return `${sign}${sym}${abs.toLocaleString()}`
}

const DM_EM_LABELS = {
  DM: '선진국 선호', EM: '신흥국 선호', neutral: '중립',
} as const

export function dmEmLabel(pref: 'DM' | 'EM' | 'neutral'): string {
  return DM_EM_LABELS[pref]
}

/**
 * fx_view의 방향을 화면 문구로 번역한다. 스키마는 두 통화 다 같은
 * bullish/neutral/bearish를 쓰지만 뜻은 다르다 — usdkrw의 bullish는 원화가 아니라
 * 달러 편(원달러 상승 = 원화 약세)이라 종목처럼 그대로 "강세/약세"라고만 쓰면 헷갈린다.
 * 색상(className)은 `deskStanceLabel`과 같은 팔레트를 그대로 쓴다.
 */
const FX_DIRECTION_TEXT = {
  dxy: { bullish: '달러 강세', neutral: '중립', bearish: '달러 약세' },
  usdkrw: { bullish: '원달러 상승(원화 약세)', neutral: '중립', bearish: '원달러 하락(원화 강세)' },
} as const

export function fxDirectionLabel(
  direction: 'bullish' | 'neutral' | 'bearish',
  instrument: 'dxy' | 'usdkrw',
): { text: string; className: string } {
  return { text: FX_DIRECTION_TEXT[instrument][direction], className: DESK_STANCE_LABELS[direction].className }
}

const CONVICTION_LABELS = { low: '낮음', medium: '보통', high: '높음' } as const

export function convictionLabel(c: 'low' | 'medium' | 'high'): string {
  return CONVICTION_LABELS[c]
}

const DURATION_LABELS = {
  short: '짧게(단기물 우위)', neutral: '중립', long: '길게(장기물 우위)',
} as const

export function durationLabel(stance: 'short' | 'neutral' | 'long'): string {
  return DURATION_LABELS[stance]
}

// src/collect.ts의 REGION_ETFS와 MARKET_CODES를 복제한다 — 웹은 서버 파이프라인 코드를
// import할 수 없어 값만 맞춰 둔다. 바뀌면 여기도 같이 바꿔야 한다.
const REGION_ETFS: Record<string, string> = { US: 'SPY', KR: 'EWY', JP: 'EWJ', EU: 'VGK', EM: 'EEM' }
const REGION_ORDER = ['US', 'KR', 'JP', 'EU', 'EM']

/** 시장 코드의 대표 ETF 티커. 시장 카드에 그 시장 자체의 가격 차트를 붙일 때 쓴다. */
export function regionEtf(code: string): string | null {
  return REGION_ETFS[code] ?? null
}

/**
 * 매크로 지표의 화면 이름과 단위. `features.macro.<필드>`를 인용한 근거 옆에
 * 그 지표 자신의 추이를 그리기 위한 표다. 여기 없는 필드는 차트를 안 그린다 —
 * 저장된 시계열이 없는 값을 그릴 수는 없다.
 */
const MACRO_LABELS: Record<string, { label: string; unit: string }> = {
  realYield10y: { label: '10년 실질금리', unit: '%' },
  breakeven10y: { label: '10년 기대인플레', unit: '%' },
  hySpread: { label: '미국 HY 스프레드', unit: '%p' },
  igSpread: { label: '미국 IG 스프레드', unit: '%p' },
  dgs10: { label: '미국 10년물', unit: '%' },
  dgs2: { label: '미국 2년물', unit: '%' },
  dgs3mo: { label: '미국 3개월물', unit: '%' },
  curve2s10s: { label: '2s10s 금리차', unit: '%p' },
  curve3m10y: { label: '3m10y 금리차', unit: '%p' },
  unrate: { label: '실업률', unit: '%' },
  cpiYoY: { label: '헤드라인 CPI', unit: '%' },
  coreCpiYoY: { label: '코어 CPI', unit: '%' },
}

/**
 * 근거 경로가 매크로 지표를 가리키면 그 지표의 이름·단위·시계열 키를 돌려준다.
 * 예: `features.macro.realYield10y` → 10년 실질금리.
 */
export function extractMacroField(
  source: string,
): { key: string; label: string; unit: string } | null {
  const m = source.match(/features\.macro\.([A-Za-z0-9_]+)/)
  if (!m) return null
  const meta = MACRO_LABELS[m[1]]
  return meta ? { key: m[1], ...meta } : null
}

/**
 * evidence.source(예: "features.assets['SPY'].rsi14", "features.valuation.US.per")에서
 * 가격 차트로 그릴 티커를 뽑는다. 매크로 곡선·상관계수처럼 단일 자산으로 설명 안 되는
 * 근거는 null을 낸다 — 모든 근거가 차트로 안 그려지는 게 정상이다.
 */
export function extractChartSymbol(source: string, known?: Iterable<string>): string | null {
  const bracket = source.match(/features\.(?:assets|sectorValuation)\[['"]([^'"]+)['"]\]/)
  if (bracket) return bracket[1]

  const dotted = source.match(/features\.(?:assets|sectorValuation)\.(.+)/)
  if (dotted) {
    const segs = dotted[1].split('.')
    // 티커에 점이 있다(EXV1.DE, 091160.KS). 첫 조각만 잘라내면 EXV1이 되어 못 찾는다.
    // 실제로 존재하는 심볼 중 가장 긴 것을 고른다.
    if (known) {
      const set = known instanceof Set ? known : new Set(known)
      for (let n = segs.length - 1; n >= 1; n--) {
        const cand = segs.slice(0, n).join('.')
        if (set.has(cand)) return cand
      }
    }
    // 알려진 목록이 없으면 점 없는 단순 티커로 가정한다.
    return segs[0]
  }

  const region = source.match(/features\.(?:valuation|regionMacro)\.([A-Z]{2})\b/)
  if (region && REGION_ETFS[region[1]]) return REGION_ETFS[region[1]]

  const regionIndex = source.match(/features\.relative\.regions\[(\d+)\]/)
  if (regionIndex) {
    const code = REGION_ORDER[Number(regionIndex[1])]
    if (code) return REGION_ETFS[code]
  }

  return null
}
