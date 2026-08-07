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
    rationale: string
  }
  dm_vs_em?: { preference: 'DM' | 'EM' | 'neutral'; rationale: string }
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
