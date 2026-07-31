export type Ohlcv = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export type Fundamentals = {
  symbol: string
  name: string | null
  sector: string | null
  price: number | null
  marketCap: number | null
  forwardPE: number | null
  priceToBook: number | null
  roe: number | null
  debtToEquity: number | null
  revenueGrowth: number | null
  operatingMargin: number | null
}

export type SnapshotKind = 'prices' | 'macro' | 'features'

export type MacroBlock = {
  available: boolean
  dgs2: number | null
  dgs10: number | null
  dgs3mo: number | null
  cpiYoY: number | null
  coreCpiYoY: number | null
  unrate: number | null
  hySpread: number | null
}

export type AssetFeature = {
  symbol: string
  close: number
  distSma20: number | null
  distSma60: number | null
  distSma200: number | null
  rsi14: number | null
  macdHist: number | null
  atr14: number | null
  realizedVol20: number | null
  mom12_1: number | null
  week52Position: number | null
  ret1m: number | null
  ret3m: number | null
}

export type FeatureSet = {
  date: string
  assets: Record<string, AssetFeature>
  macro: MacroBlock & { curve2s10s: number | null; curve3m10y: number | null }
  regime: {
    vixLevel: number | null
    vixTerm: number | null        // ^VIX / ^VIX3M. 1 초과 = 백워데이션(스트레스)
    breadth: number | null        // RSP/SPY 비율의 60일 SMA 대비 이격
    usdkrw: number | null
    usdkrwChange20d: number | null
  }
  relative: {
    krVsUs3m: number | null       // EWY 3개월 수익률 - SPY 3개월 수익률
    sectors: { etf: string; rel3m: number | null }[]  // 각 섹터 ETF 3개월 수익률 - SPY
  }
  foreignRatioSamsung: number | null
  missing: string[]               // 수집 실패한 심볼/시리즈. 다운스트림 agent가 flag로 쓴다
}

export type NewsItem = {
  title: string
  url: string
  date: string | null   // ISO. pubDate 파싱 실패 시 null
  source: string        // 'yahoo:AAPL', 'yonhap' 등 출처 식별자
}

export type UniverseRow = {
  ticker: string
  market: 'KR' | 'US'
  name: string
  sector: string | null
  active: boolean
}

export type QuoteRow = {
  symbol: string
  price: number | null
  marketCap: number | null
  avgVolume3m: number | null
  yearChangePct: number | null
  currency: string | null
}

export type Candidate = {
  ticker: string
  name: string
  market: 'KR' | 'US'
  sector: string | null
  turnover: number | null        // price * avgVolume3m, 현지통화
  yearChangePct: number | null
  roe: number | null
  operatingMargin: number | null
  forwardPE: number | null
  priceToBook: number | null
  score: number                  // 모멘텀 z + 퀄리티 z 합
  tech: CandidateTech | null     // 후보 확정 후 일봉으로 계산해 채운다
}

export type CandidateTech = {
  distSma200: number | null
  distSma60: number | null
  rsi14: number | null
  macdHist: number | null
  week52Position: number | null
  realizedVol20: number | null
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
  sectors: { name: string; stance: 'OW' | 'N' | 'UW'; etf: string; rationale: string }[]
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

export type BundleA = {
  date: string
  features: FeatureSet
  news: { market: NewsItem[]; korea: NewsItem[] }
  agents_to_run: string[]
  disclaimer: string
}

export type BundleB = {
  date: string
  features: FeatureSet
  agents_a: AgentOutput[]
  candidates: Candidate[]
  candidate_news: Record<string, NewsItem[]>
  company_reports_for: { ticker: string; market: 'KR' | 'US' }[]
  agents_to_run: string[]
  disclaimer: string
}
