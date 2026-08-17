export type MarketCode = 'US' | 'KR' | 'JP' | 'EU' | 'EM'

export const MARKET_NAMES: Record<MarketCode, string> = {
  US: '미국', KR: '한국', JP: '일본', EU: '유럽', EM: '이머징',
}

export type Desk = 'macro' | 'technical' | 'news' | 'allocation' | 'fundamental' | 'sector'

export const DESK_NAMES: Record<Desk, string> = {
  macro: '매크로 애널리스트',
  technical: '차트 애널리스트',
  news: '뉴스플로우 애널리스트',
  allocation: '자산배분 애널리스트',
  fundamental: '펀더멘털 애널리스트',
  sector: '섹터 애널리스트',
}

export type MarketRead = {
  market: MarketCode
  stance: 'bullish' | 'neutral' | 'bearish'
  comment: string
}

export type AgentOutput = {
  agent: string
  score: number
  confidence: number
  signal: 'bullish' | 'neutral' | 'bearish'
  headline: string
  reasoning: string
  evidence: { label: string; value: string; source: string }[]
  flags: string[]
  markets?: MarketRead[]
}

/** sleeve 내부 배분 한 줄. weight_pct는 그 sleeve 안에서의 비중이다(합 100). */
export type SleeveSplit = {
  sleeve: string
  ticker: string
  weight_pct: number
  rationale: string
}

export type DailyVerdict = {
  date: string
  equity_score: number
  signal: 'increase' | 'hold' | 'reduce'
  suggested_equity_weight: [number, number]
  conviction: 'low' | 'medium' | 'high'
  drivers: { agent: string; direction: '+' | '-'; weight: number; point: string }[]
  counter_case: string
  countries: { code: 'KR' | 'US'; stance: 'OW' | 'N' | 'UW'; rationale: string }[]
  sectors: {
    name: string; stance: 'OW' | 'N' | 'UW'; etf: string; rationale: string
    region?: MarketCode | 'GLOBAL'
  }[]

  // CIO 하우스뷰. 2026-08 개편 이전에 발행된 행에는 없으므로 전부 optional이다.
  regime?: string
  horizon?: string
  asset_allocation?: {
    equity: [number, number]
    bond: [number, number]
    cash: [number, number]
    /** 대체자산 밴드. 2026-08 확장 이전 행에는 없다. */
    alt?: [number, number]
    rationale: string
    /** 채권 밴드 안에서의 배분(합 100) */
    fixed_income?: SleeveSplit[]
    duration?: { stance: 'short' | 'neutral' | 'long'; rationale: string }
    /** 대체자산 밴드 안에서의 배분(합 100) */
    alternatives?: SleeveSplit[]
  }
  dm_vs_em?: { preference: 'DM' | 'EM' | 'neutral'; rationale: string }
  /** 달러·원달러 방향. usdkrw의 bullish는 원달러 상승(원화 약세)을 뜻한다 — 화면에서 번역한다. */
  fx_view?: {
    dxy: { direction: 'bullish' | 'neutral' | 'bearish'; confidence: 'low' | 'medium' | 'high'; rationale: string }
    usdkrw: { direction: 'bullish' | 'neutral' | 'bearish'; confidence: 'low' | 'medium' | 'high'; rationale: string }
  }
  markets?: {
    code: MarketCode
    stance: 'OW' | 'N' | 'UW'
    weight_pct: number
    conviction: 'low' | 'medium' | 'high'
    headline: string
    rationale: string
    key_risk: string
    desk_reads: { desk: Desk; stance: 'bullish' | 'neutral' | 'bearish'; comment: string }[]
  }[]
  trades?: {
    action: 'add' | 'trim'
    instrument: string
    market: MarketCode | 'GLOBAL'
    rationale: string
  }[]
  picks: {
    ticker: string; name: string; market: 'KR' | 'US'; sector: string
    thesis: string
    scores: { tech: number; fund: number; news: number }
    risk: string
  }[]
  invalidation: string[]
  disclaimer: string
}

export type PositioningRow = {
  group: string
  name: string
  stance: 'OW' | 'N' | 'UW'
  weight_pct: number
  prev_weight_pct: number | null
  change: 'up' | 'down' | 'same' | 'new'
  rationale: string
}

export type ImplementationRow = {
  name: string
  ticker: string
  neutral_pct: number
  tactical_pct: number
  relative_pct: number
}

export type MonthlyChange = {
  area: string; from: string; to: string; reason: string
  /** 크게 변한 것인가. 문턱은 서버의 src/saa.ts MATERIAL. 과거 행에는 없다. */
  material?: boolean
}

export type MonthlyReport = {
  month: string
  generated_at: string
  as_of: string
  prev_as_of: string | null
  /** 무엇과 비교했는지. 'month-start'는 전월이 없어 그 달 첫 판단과 비교했다는 뜻이다. */
  prev_basis: 'previous-month' | 'month-start' | null
  outlook: string
  themes: { title: string; body: string }[]
  positioning: PositioningRow[]
  changes: MonthlyChange[]
  implementation: { sleeve: 'equity' | 'bond' | 'alt'; label: string; rows: ImplementationRow[] }[]
  key_risks: string[]
  disclaimer: string
}

export type SectorHolding = {
  ticker: string
  name: string
  weightPct: number | null
  currency: string | null
  marketCap: number | null
  marketCapKrw: number | null
  forwardPe: number | null
  annual: { period: string; revenue: number | null; operatingIncome: number | null }[]
  quarterly: { period: string; revenue: number | null; operatingIncome: number | null }[]
  /** operatingIncome 자리에 실제로 무엇이 들어 있는지. 은행은 세전이익으로 대체된다. */
  incomeBasis: 'operatingIncome' | 'pretaxIncome' | null
}

export type SectorHoldings = {
  etf: string
  asOf: string
  holdings: SectorHolding[]
  note: string | null
}

export type CompanyReport = {
  ticker: string; name: string; market: 'KR' | 'US'; sector: string
  generated_at: string
  snapshot: {
    price: number; change_1d: number; change_1m: number; change_12m: number
    market_cap: number
    per: number | null; pbr: number | null; roe: number | null
    per_pctile_in_sector: number | null
    debt_to_equity: number | null
    week52: { high: number; low: number; position: number }
    revenue_trend: { period: string; value: number }[]
    op_margin_trend: { period: string; value: number }[]
  }
  business: string
  thesis: string[]
  bear_points: string[]
  catalysts: string[]
  technical_read: string
  news: { title: string; url: string; date: string; takeaway: string }[]
  verdict: { stance: 'positive' | 'neutral' | 'cautious'; one_liner: string; confidence: number }
  invalidation: string[]
  disclaimer: string
}
