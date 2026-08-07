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

/** 커버하는 5개 시장. 배분 판단의 단위다. */
export type MarketCode = 'US' | 'KR' | 'JP' | 'EU' | 'EM'

export const MARKET_CODES: MarketCode[] = ['US', 'KR', 'JP', 'EU', 'EM']

export const MARKET_NAMES: Record<MarketCode, string> = {
  US: '미국', KR: '한국', JP: '일본', EU: '유럽', EM: '이머징',
}

/** 리서치 데스크 6개. 각 데스크가 5개 시장 전부에 코멘트를 남긴다. */
export type Desk = 'macro' | 'technical' | 'news' | 'allocation' | 'fundamental' | 'sector'

export const DESKS: Desk[] = ['macro', 'technical', 'news', 'allocation', 'fundamental', 'sector']

export const DESK_NAMES: Record<Desk, string> = {
  macro: '매크로 애널리스트',
  technical: '차트 애널리스트',
  news: '뉴스플로우 애널리스트',
  allocation: '자산배분 애널리스트',
  fundamental: '펀더멘털 애널리스트',
  sector: '섹터 애널리스트',
}

/** 한 데스크가 한 시장에 남기는 코멘트. */
export type MarketRead = {
  market: MarketCode
  stance: 'bullish' | 'neutral' | 'bearish'
  comment: string
}

/**
 * 지역별 상대 성과. 전부 USD 표시 ETF로 계산한다 —
 * 현지통화 지수로 비교하면 환율 효과가 빠져 배분 판단이 틀어진다.
 */
/** 지역 대표 ETF의 밸류에이션. 지역 간 상대 밸류 비교의 근거다. */
export type RegionValuation = {
  symbol: string
  per: number | null
  pbr: number | null
  psr: number | null
}

export type RegionRelative = {
  code: MarketCode
  etf: string
  ret1m: number | null
  ret3m: number | null
  rel1m: number | null   // vs ACWI(전세계)
  rel3m: number | null
}

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
    usdjpy: number | null
    usdjpyChange20d: number | null
    eurusd: number | null
    eurusdChange20d: number | null
    dxyChange20d: number | null   // 달러인덱스 20일 변화. 신흥국 주식의 역풍/순풍 지표
  }
  relative: {
    krVsUs3m: number | null       // EWY 3개월 수익률 - SPY 3개월 수익률
    benchmark: string             // 지역 상대성과의 기준. 'ACWI'
    regions: RegionRelative[]     // 5개 시장의 USD 기준 상대성과
    emVsDmExUs3m: number | null   // EEM - EFA. EFA는 미국·캐나다 제외 선진국이다
    emVsAcwi3m: number | null     // EEM - ACWI
    sectors: { etf: string; rel3m: number | null }[]  // 각 섹터 ETF 3개월 수익률 - SPY
  }
  /** 시장별 밸류에이션. 지역 배분에서 "싼가 비싼가"의 유일한 실측 근거다. */
  valuation: Partial<Record<MarketCode, RegionValuation>>
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
  /**
   * 시장별 코멘트. 데스크 agent(6개)는 반드시 채운다.
   * counter처럼 시장을 나누지 않는 agent는 비운다 — 그래서 optional이다.
   */
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

  // --- CIO 하우스뷰. 2026-08 개편에서 추가됐다. ---
  // 웹은 이 필드들이 없는 과거 행도 렌더해야 하므로 optional이지만,
  // 발행 검증(schema.ts)은 신규 출력에 대해 전부 필수로 강제한다.

  /** 현재 국면 한 줄. 예: "확장 후반 — 디스인플레이션 둔화, 신용 타이트" */
  regime?: string
  /** 이 판단이 유효한 기간. 예: "3-6개월 전술적" */
  horizon?: string
  /** 자산군 배분 밴드(%). 합이 100 근처가 되도록 CIO가 낸다. */
  asset_allocation?: {
    equity: [number, number]
    bond: [number, number]
    cash: [number, number]
    rationale: string
  }
  /** 선진국 대 신흥국 선호 */
  dm_vs_em?: { preference: 'DM' | 'EM' | 'neutral'; rationale: string }
  /** 시장별 하우스뷰. weight_pct의 합은 100(주식 슬리브 내 배분)이어야 한다. */
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
  /** 실행 가능한 형태로 표현한 트레이드. instrument는 실제 티커여야 한다. */
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

export type BundleA = {
  date: string
  features: FeatureSet
  news: {
    market: NewsItem[]
    korea: NewsItem[]
    /** 지역 ETF별 뉴스. 키는 MarketCode — 일본·유럽·이머징 코멘트의 근거가 된다. */
    regions: Partial<Record<MarketCode, NewsItem[]>>
  }
  agents_to_run: string[]
  disclaimer: string
}

export type BundleB = {
  date: string
  features: FeatureSet
  agents_a: AgentOutput[]
  candidates: Candidate[]
  candidate_news: Record<string, NewsItem[]>
  company_snapshots: Record<string, CompanyReport['snapshot']>
  company_reports_for: { ticker: string; market: 'KR' | 'US' }[]
  agents_to_run: string[]
  disclaimer: string
}
