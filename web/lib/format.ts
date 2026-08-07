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

const DM_EM_LABELS = {
  DM: '선진국 선호', EM: '신흥국 선호', neutral: '중립',
} as const

export function dmEmLabel(pref: 'DM' | 'EM' | 'neutral'): string {
  return DM_EM_LABELS[pref]
}
