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

export type SnapshotKind = 'prices' | 'macro' | 'features' | 'holdings'

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
/**
 * 지역별 금리·물가. 미국 외는 FRED 월간 시리즈라 관측일이 1-2개월 늦다.
 * 그래서 값마다 `*AsOf`를 함께 싣는다 — agent가 오늘 값으로 오해하면
 * 정책 전환 시점 판단이 통째로 틀어진다.
 */
export type RegionMacro = {
  policyRate: number | null
  policyRateAsOf: string | null
  bond10y: number | null
  bond10yAsOf: string | null
  cpiYoY: number | null
  cpiYoYAsOf: string | null
  /**
   * 지역 하이일드/회사채 옵션조정스프레드(%p)와 20거래일 변화.
   * 금리·물가와 달리 **일간이고 당일에 가깝다** — 미국 외 매크로에서 유일하게 시차가 없는 값이라
   * 정책금리의 두 달 지연을 메우는 자리다. 신용은 주식보다 먼저 움직인다.
   * 확대(양수 변화)가 스트레스 신호다.
   */
  creditSpread: number | null
  creditSpreadAsOf: string | null
  creditSpread20dChg: number | null
  /**
   * 미국 2년물 − 이 시장 정책금리(%p). 양수면 미국이 높다.
   * FX 방향(특히 캐리)의 핵심 축을 코드가 미리 계산해 둔다 — LLM이 번들 여기저기 흩어진
   * 두 숫자를 직접 빼게 하면 부호를 틀리는 사고가 난다(이 코드베이스가 이미 여러 번 겪음).
   * `policyRateAsOf`와 같은 지연을 그대로 물려받는다(미국 외는 1-2개월 늦다).
   */
  rateDiffToUs2y: number | null
  /** 대리지표를 쓴 경우 무엇으로 대체했는지. 없으면 null. */
  proxyNote: string | null
}

/** 두 시장 간 일간수익률 상관계수(최근 60거래일). 분산 효과의 실측 근거다. */
export type RegionCorr = { a: MarketCode; b: MarketCode; corr60d: number | null }

/** 지역 대표 ETF의 밸류에이션 측정값. Yahoo에서 받은 그대로다. */
export type RegionValuation = {
  symbol: string
  per: number | null
  pbr: number | null
  psr: number | null
}

/**
 * 측정값 + **자기 역사 대비 위치**. 스냅샷에 저장되는 형태다.
 *
 * 횡단면 비교("미국이 한국보다 비싸다")만으로는 배분 판단이 안 된다 —
 * 지역 간 배수 차이의 상당 부분은 섹터 구성 차이라서 원래 다르기 때문이다.
 * "그 시장 자신의 과거 대비 지금 어디인가"가 진짜 신호이고, 그게 이 필드다.
 */
export type RegionValuationRanked = RegionValuation & {
  /** 과거 관측치 중 현재값보다 낮은 것의 비율(0-100). 표본 부족이면 null. */
  perPctile: number | null
  pbrPctile: number | null
  /** 백분위 계산에 쓴 과거 관측일 수. 작으면 백분위를 신뢰하면 안 된다. */
  historyDays: number
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
  /**
   * 미국 IG 회사채 OAS(%p). hySpread와 짝을 이룬다 —
   * 둘의 격차가 신용 사이클에서 IG와 HY 중 무엇을 살지 가르는 값이다.
   */
  igSpread: number | null
  /**
   * 10년 TIPS 실질금리(%, FRED DFII10). 금과 장기채의 공통 할인율이며
   * 명목금리만 보면 놓치는 값이다 — 명목이 올라도 기대인플레가 더 오르면 실질은 내린다.
   */
  realYield10y: number | null
  /** 10년 기대인플레(%, FRED T10YIE). 명목 = 실질 + 기대인플레 */
  breakeven10y: number | null
}

/**
 * 매크로 지표의 시계열. 키는 `MacroBlock`의 필드명과 같다 —
 * 화면이 `features.macro.realYield10y` 같은 근거 경로에서 곧바로 찾아 쓸 수 있게 맞춘 것이다.
 *
 * 스칼라만 저장하면 "실질금리 2.39%"가 높은지 낮은지 화면에서 알 방법이 없다.
 * 값 하나로는 수준을 판단할 수 없어서 추이를 함께 싣는다.
 */
export type MacroSeries = Record<string, { date: string; value: number }[]>

/** 섹터 ETF 상위 보유종목 하나. 섹터를 눌렀을 때 화면에 펼쳐지는 내용이다. */
export type SectorHolding = {
  ticker: string
  name: string
  /** ETF 내 비중(%) */
  weightPct: number | null
  currency: string | null
  /** 현지통화 시가총액 */
  marketCap: number | null
  /** 원화환산 시가총액. 환율을 못 구했으면 null이다 */
  marketCapKrw: number | null
  /** 12개월 선행 PER */
  forwardPe: number | null
  /** 연간 3개년. 오래된 것부터 */
  annual: { period: string; revenue: number | null; operatingIncome: number | null }[]
  /** 최근 분기들(오래된 것부터). 전년 동기 비교를 위해 6분기를 담는다 */
  quarterly: { period: string; revenue: number | null; operatingIncome: number | null }[]
  /**
   * `operatingIncome` 자리에 실제로 무엇이 들어 있는지.
   * **은행은 영업이익을 보고하지 않아** 세전이익으로 대체한다(JPM·KB 모두 null 확인).
   * 라벨 없이 섞으면 다른 지표를 같은 이름으로 비교하게 되므로 반드시 화면에 표기한다.
   */
  incomeBasis: 'operatingIncome' | 'pretaxIncome' | null
}

export type SectorHoldings = {
  etf: string
  asOf: string
  holdings: SectorHolding[]
  /** 데이터 출처·한계 안내. 없으면 null */
  note: string | null
}

/** 채권·대체자산 sleeve. 자산군 안에서 무엇을 살지 고르는 단위다. */
export type SleeveGroup = 'bond' | 'alt'

/**
 * sleeve 후보 하나. **전부 USD 표시 ETF다** — 지역 ETF와 같은 이유로,
 * 현지통화 상품을 섞으면 "달러로 벌었나"라는 실제 질문에 답하지 못한다.
 */
export type SleeveAsset = {
  ticker: string
  group: SleeveGroup
  /** bond: sovereign/credit/em/inflation · alt: precious/industrial/private/real */
  bucket: string
  label: string
  /**
   * 분배수익률(연율 비율). **만기수익률(YTM)이 아니라 최근 12개월 분배 기준이다.**
   * TIPS(TIP)는 물가연동 원금상승분이 분배에 섞여 실질금리와 전혀 다른 숫자가 나온다 —
   * 실질금리는 `macro.realYield10y`를 봐야 한다.
   */
  distYield: number | null
  ret1m: number | null
  ret3m: number | null
  /** bond는 AGG 대비 3개월 초과수익. alt는 벤치마크가 없어 null이다. */
  rel3m: number | null
  realizedVol20: number | null
  /**
   * SPY와의 60일 로그수익률 상관. 분산 기여의 유일한 실측 근거다 —
   * "대체자산이니 분산된다"는 통념 대신 이 숫자로 판단한다.
   */
  corrToEquity60d: number | null
  distSma200: number | null
}

/**
 * 듀레이션 포지셔닝의 실측 근거. 국채 사다리(1-3y / 7-10y / 20y+)를 나란히 둔다.
 * 곡선(`macro.curve2s10s`)이 "지금 어떤 모양인가"라면 이건 "그래서 어느 만기를 살까"다.
 */
export type DurationRead = {
  /** 사다리별 분배수익률(연율 비율). 캐리의 크기다. */
  shortYield: number | null
  intermediateYield: number | null
  longYield: number | null
  /** TLT − SHY 3개월 수익률(비율). 양수면 장기물이 이기고 있는 국면 */
  longMinusShort3m: number | null
  /** TLT 20일 실현변동성. 장기물은 같은 방향이어도 변동성이 몇 배다 */
  longVol20: number | null
  /** SHY 20일 실현변동성 */
  shortVol20: number | null
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
    sectors: { etf: string; region: MarketCode; rel3m: number | null }[]  // 섹터 ETF 3개월 수익률 - 자기 지역 벤치마크
  }
  /** 시장별 밸류에이션. 지역 배분에서 "싼가 비싼가"의 유일한 실측 근거다. */
  valuation: Partial<Record<MarketCode, RegionValuationRanked>>
  /** 시장별 금리·물가. 미국 외 매크로 판단이 환율 한 경로에만 의존하지 않게 한다. */
  regionMacro: Partial<Record<MarketCode, RegionMacro>>
  /** 시장 쌍별 상관계수. 개별 변동성만으로 잡은 비중이 실제로 분산됐는지 확인한다. */
  regionCorr: RegionCorr[]
  /** 섹터 ETF 밸류에이션(키는 ETF 티커). 섹터 판단이 모멘텀 단독이 되지 않게 한다. */
  sectorValuation: Partial<Record<string, RegionValuation>>
  /** 채권·대체자산 후보. 주식 밖의 배분을 숫자로 판단하게 하는 근거다. */
  sleeves: SleeveAsset[]
  /** 듀레이션 사다리. 채권 배분에서 "만기를 얼마나 길게" 답을 낸다. */
  duration: DurationRead
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

/** sleeve 내부 배분 한 줄. `weight_pct`는 그 sleeve 안에서의 비중이다(합 100). */
export type SleeveSplit = {
  /** 사람이 읽는 이름. 예: "미국 국채 중기", "금" */
  sleeve: string
  /** 실제 티커. 실행 가능해야 하므로 반드시 features.sleeves에 있는 것이어야 한다. */
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
    /** 대체자산 밴드. 2026-08 확장에서 추가돼 그 이전 행에는 없다. */
    alt?: [number, number]
    rationale: string
    /**
     * 채권 sleeve **내부** 배분(%). 합이 100이다 —
     * 전체 포트폴리오가 아니라 `bond` 밴드 안을 어떻게 쪼갤지를 말한다.
     */
    fixed_income?: SleeveSplit[]
    /** 듀레이션 스탠스. 채권 배분에서 만기 축을 따로 답한다. */
    duration?: { stance: 'short' | 'neutral' | 'long'; rationale: string }
    /** 대체자산 sleeve **내부** 배분(%). 합이 100이다. */
    alternatives?: SleeveSplit[]
  }
  /** 선진국 대 신흥국 선호 */
  dm_vs_em?: { preference: 'DM' | 'EM' | 'neutral'; rationale: string }
  /**
   * 달러·원달러 방향. 이미 `dm_vs_em`·GLD·EMLC 비중 근거로 흩어져 쓰이던 달러 판단을
   * 하나의 감사 가능한 필드로 모은 것이다 — 가격 목표는 내지 않는다(정성적 방향뿐).
   * `direction`은 `MarketRead.stance`와 같은 어휘(bullish/neutral/bearish)를 재사용한다.
   * `usdkrw`의 bullish는 "원달러 상승(원화 약세)"를 뜻한다 — 화면 라벨에서 번역한다.
   */
  fx_view?: {
    dxy: { direction: 'bullish' | 'neutral' | 'bearish'; confidence: 'low' | 'medium' | 'high'; rationale: string }
    usdkrw: { direction: 'bullish' | 'neutral' | 'bearish'; confidence: 'low' | 'medium' | 'high'; rationale: string }
  }
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

/** 포지셔닝 표 한 줄. 스탠스와 전월 대비 이동은 전부 코드가 계산한다. */
export type PositioningRow = {
  /** '자산군' | '주식 · 지역' | '채권' | '대체자산' */
  group: string
  name: string
  stance: 'OW' | 'N' | 'UW'
  weight_pct: number
  /** 비교할 전월 값이 없으면 null */
  prev_weight_pct: number | null
  /** 전월 대비 스탠스 이동. 'new'는 지난달에 없던 항목 */
  change: 'up' | 'down' | 'same' | 'new'
  rationale: string
}

/** Neutral / Tactical / Relative 표 한 줄. relative = tactical − neutral */
export type ImplementationRow = {
  name: string
  ticker: string
  neutral_pct: number
  tactical_pct: number
  relative_pct: number
}

/**
 * 전월 대비 변화 한 건. `from`/`to`/`area`는 코드가 계산하고
 * `reason`만 모델이 채운다 — 그래야 없는 변화를 지어내지 못한다.
 */
export type MonthlyChange = {
  area: string
  from: string
  to: string
  reason: string
  /**
   * 눈에 띄게 표시할 만큼 큰 변화인가. 문턱은 `src/saa.ts`의 MATERIAL이며
   * 일간 잡음 실측치를 근거로 정했다 — 스탠스 전환만으로는 material이 아니다.
   */
  material: boolean
}

/**
 * 월간 리포트. 일간 판단(DailyVerdict)이 "오늘 무엇을 할까"라면
 * 이건 "이번 달 우리 뷰는 무엇이고 지난달과 어디가 달라졌나"다.
 */
export type MonthlyReport = {
  /** 'YYYY-MM' */
  month: string
  generated_at: string
  /** 이 달의 기준이 된 일간 판단 날짜 */
  as_of: string
  /** 비교 대상 판단 날짜. 비교할 것이 아무것도 없으면 null */
  prev_as_of: string | null
  /**
   * 무엇과 비교했는지. 첫 리포트는 전월이 없어 그 달 첫 판단과 비교하는데,
   * 그걸 "전월 대비"로 표시하면 거짓말이 되므로 화면이 구분해 쓸 수 있게 남긴다.
   */
  prev_basis: 'previous-month' | 'month-start' | null
  outlook: string
  /** 이 달의 포지셔닝을 이끈 테마. 이름을 붙여 3개 내외 */
  themes: { title: string; body: string }[]
  positioning: PositioningRow[]
  changes: MonthlyChange[]
  implementation: {
    sleeve: 'equity' | 'bond' | 'alt'
    label: string
    rows: ImplementationRow[]
  }[]
  key_risks: string[]
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

/**
 * 직전에 **확정된** 전술 배분. 월간 리포트가 결정한 것이고, 일간 CIO는 이것을
 * 출발점으로 삼는다.
 *
 * 왜 필요한가: 이게 없으면 CIO가 매일 백지에서 다시 정한다. 실측에서
 * 시장 스탠스의 52%가 하루 만에 뒤집혔는데 신호와 점수는 그대로였다 —
 * 바뀐 것은 시장이 아니라 모델의 표현이었다.
 */
export type StandingTaa = {
  /** 이 배분을 확정한 월간 리포트 */
  month: string
  /** 그 리포트가 기준으로 삼은 일간 판단 날짜 */
  as_of: string
  asset_allocation: DailyVerdict['asset_allocation']
  markets: { code: MarketCode; stance: 'OW' | 'N' | 'UW'; weight_pct: number }[]
  /** 확정 당시의 무효화 조건. 오늘 이게 깨졌는지가 배분을 바꿀 정당한 사유다. */
  invalidation: string[]
}

export type BundleB = {
  date: string
  features: FeatureSet
  agents_a: AgentOutput[]
  /** 직전 확정 TAA. 아직 월간 리포트가 없으면 null이다. */
  standing_taa: StandingTaa | null
  candidates: Candidate[]
  candidate_news: Record<string, NewsItem[]>
  company_snapshots: Record<string, CompanyReport['snapshot']>
  company_reports_for: { ticker: string; market: 'KR' | 'US' }[]
  agents_to_run: string[]
  disclaimer: string
}
