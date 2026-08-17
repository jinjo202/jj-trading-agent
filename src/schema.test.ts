import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateAgentOutput, validateCompanyReport, validateDailyVerdict, validateDeskOutput,
} from './schema.ts'

const goodAgent = {
  agent: 'macro',
  score: 62,
  confidence: 0.7,
  signal: 'bullish',
  headline: '금리 인하 기대가 완만한 확장 국면을 지지',
  reasoning: '2s10s가 정상화됐고 HY 스프레드는 축소 중이다. 실업률은 안정적이다.',
  evidence: [
    { label: '2s10s', value: '0.70%p', source: 'features.macro.curve2s10s' },
    { label: 'HY 스프레드', value: '3.2%', source: 'features.macro.hySpread' },
  ],
  flags: ['CPI 발표 대기'],
}

test('정상 AgentOutput은 통과하고 같은 객체를 돌려준다', () => {
  assert.deepEqual(validateAgentOutput(goodAgent), goodAgent)
})

test('score가 0-100 밖이면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, score: 120 }), /score/)
  assert.throws(() => validateAgentOutput({ ...goodAgent, score: -1 }), /score/)
})

test('confidence가 0-1 밖이면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, confidence: 70 }), /confidence/)
})

test('signal이 허용값 밖이면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, signal: 'very bullish' }), /signal/)
})

test('evidence가 비어 있으면 거부 — 근거 없는 판단은 받지 않는다', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, evidence: [] }), /evidence/)
})

test('evidence 항목에 source가 없으면 거부', () => {
  const noSource = [{ label: '2s10s', value: '0.70%p' }]
  assert.throws(() => validateAgentOutput({ ...goodAgent, evidence: noSource }), /source/)
})

test('숫자 필드에 숫자 모양 문자열이 오면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, score: '62' }), /score/)
})

test('객체가 아니면 거부', () => {
  assert.throws(() => validateAgentOutput(null), /object/)
  assert.throws(() => validateAgentOutput('{}'), /object/)
})

// 40 + 15*4 = 100. weight_pct 합 검증을 통과하는 최소 조합이다.
const deskMarkets = ['US', 'KR', 'JP', 'EU', 'EM'] as const

const goodVerdict = {
  date: '2026-07-31',
  equity_score: 68,
  signal: 'increase',
  suggested_equity_weight: [60, 70],
  conviction: 'medium',
  drivers: [{ agent: 'macro', direction: '+', weight: 0.3, point: '금리 정상화' }],
  counter_case: '밸류에이션이 이미 높고 브레드스가 좁다.',
  countries: [{ code: 'KR', stance: 'OW', rationale: '상대 밸류에이션 매력' }],
  sectors: [{ name: 'Technology', stance: 'OW', etf: 'XLK', rationale: '상대모멘텀 우위' }],
  picks: [{
    ticker: '005930.KS', name: '삼성전자', market: 'KR', sector: 'Technology',
    thesis: '메모리 사이클 회복', scores: { tech: 70, fund: 65, news: 60 }, risk: '수요 둔화',
  }],
  invalidation: ['HY 스프레드가 5%를 넘으면 이 논리는 깨진다'],
  disclaimer: '투자자문이 아닙니다.',
  regime: '확장 후반 — 신용 타이트, 디스인플레이션 둔화',
  horizon: '3-6개월 전술적',
  asset_allocation: {
    equity: [55, 65], bond: [20, 28], cash: [3, 8], alt: [5, 12],
    rationale: '신용 스프레드가 타이트해 주식 비중을 중립 위로 둔다',
    fixed_income: [
      { sleeve: '미국 국채 중기', ticker: 'IEF', weight_pct: 60, rationale: '캐리와 변동성 균형' },
      { sleeve: '미국 IG 회사채', ticker: 'LQD', weight_pct: 40, rationale: 'IG 스프레드가 타이트' },
    ],
    duration: { stance: 'neutral', rationale: '곡선 정상화 초기라 중립' },
    alternatives: [
      { sleeve: '금', ticker: 'GLD', weight_pct: 50, rationale: '실질금리 하락 국면' },
      { sleeve: '글로벌 리츠', ticker: 'REET', weight_pct: 50, rationale: '주식 상관이 낮다' },
    ],
  },
  dm_vs_em: { preference: 'DM', rationale: '달러 강세가 EM 수익률을 깎는다' },
  fx_view: {
    dxy: { direction: 'bullish', confidence: 'medium', rationale: 'rateDiffToUs2y가 확대되는 중이다' },
    usdkrw: { direction: 'bullish', confidence: 'low', rationale: '원달러 상승(원화 약세) 압력' },
  },
  markets: deskMarkets.map((code, i) => ({
    code,
    stance: i === 0 ? 'OW' : 'N',
    weight_pct: i === 0 ? 40 : 15,
    conviction: 'medium',
    headline: `${code} 한 줄 판단`,
    rationale: `${code} 근거`,
    key_risk: `${code} 리스크`,
    desk_reads: [{ desk: 'macro', stance: 'neutral', comment: `${code} 매크로 코멘트` }],
  })),
  trades: [{ action: 'add', instrument: 'XLV', market: 'US', rationale: '섹터 상대모멘텀 1위' }],
}

test('정상 DailyVerdict은 통과', () => {
  assert.deepEqual(validateDailyVerdict(goodVerdict), goodVerdict)
})

test('suggested_equity_weight는 [하한, 상한] 두 개여야 하고 하한 <= 상한', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, suggested_equity_weight: [70] }), /suggested_equity_weight/)
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, suggested_equity_weight: [70, 60] }), /suggested_equity_weight/)
})

test('invalidation이 비면 거부 — 반증 조건 없는 결론은 받지 않는다', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, invalidation: [] }), /invalidation/)
})

test('counter_case가 비면 거부 — 반대의견 단계는 필수다', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, counter_case: '   ' }), /counter_case/)
})

test('disclaimer가 없으면 거부', () => {
  const { disclaimer: _drop, ...noDisclaimer } = goodVerdict
  assert.throws(() => validateDailyVerdict(noDisclaimer), /disclaimer/)
})

test('date가 YYYY-MM-DD가 아니면 거부', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, date: '2026/07/31' }), /date/)
})

test('픽의 market이 KR/US가 아니면 거부', () => {
  const bad = { ...goodVerdict, picks: [{ ...goodVerdict.picks[0], market: 'JP' }] }
  assert.throws(() => validateDailyVerdict(bad), /market/)
})

test('picks가 비면 거부 — 빈 검증(zero-pick) verdict는 통과시키지 않는다', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, picks: [] }), /picks/)
})

// 합이 100이 아닌 배분표는 실행할 수 없다. 조용히 통과시키면 화면에 그대로 나간다.
test('시장 weight_pct 합이 100이 아니면 거부', () => {
  const skewed = goodVerdict.markets.map((m, i) => ({ ...m, weight_pct: i === 0 ? 50 : 15 }))
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, markets: skewed }), /weight_pct/)
})

test('5개 시장 중 하나라도 빠지면 거부', () => {
  const four = goodVerdict.markets.filter((m) => m.code !== 'JP')
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, markets: four }), /JP/)
})

test('자산배분 밴드 중앙값 합이 100에서 멀면 거부', () => {
  const bad = { ...goodVerdict.asset_allocation, equity: [10, 20] }
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, asset_allocation: bad }), /asset_allocation/)
})

test('fx_view의 direction은 bullish/neutral/bearish 중 하나여야 한다', () => {
  const bad = { ...goodVerdict.fx_view, dxy: { ...goodVerdict.fx_view!.dxy, direction: 'up' } }
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, fx_view: bad }), /direction/)
})

test('fx_view의 confidence는 low/medium/high 중 하나여야 한다', () => {
  const bad = { ...goodVerdict.fx_view, usdkrw: { ...goodVerdict.fx_view!.usdkrw, confidence: 90 } }
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, fx_view: bad }), /confidence/)
})

test('fx_view가 없으면 거부한다(dm_vs_em과 같은 정책 — 타입은 optional이지만 검증기는 강제)', () => {
  const { fx_view, ...withoutFx } = goodVerdict
  assert.throws(() => validateDailyVerdict(withoutFx), /fx_view/)
})

// sleeve 비중은 그 sleeve 안에서의 배분이라 합이 100이다. 전체 포트폴리오 비중으로
// 착각해 합 25 같은 값을 내면 배분표가 조용히 틀리므로 검증기가 막아야 한다.
test('채권 sleeve 내부 비중 합이 100이 아니면 거부', () => {
  const bad = {
    ...goodVerdict.asset_allocation,
    fixed_income: [
      { sleeve: '미국 국채 중기', ticker: 'IEF', weight_pct: 15, rationale: '전체 대비 비중으로 착각' },
      { sleeve: '미국 IG 회사채', ticker: 'LQD', weight_pct: 10, rationale: '합이 25다' },
    ],
  }
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, asset_allocation: bad }), /weight_pct 합이 100/)
})

test('대체자산 sleeve 내부 비중 합도 100을 강제한다', () => {
  const bad = {
    ...goodVerdict.asset_allocation,
    alternatives: [{ sleeve: '금', ticker: 'GLD', weight_pct: 40, rationale: '혼자 40' }],
  }
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, asset_allocation: bad }), /weight_pct 합이 100/)
})

test('듀레이션 스탠스는 short/neutral/long 중 하나여야 한다', () => {
  const bad = {
    ...goodVerdict.asset_allocation,
    duration: { stance: 'longer', rationale: '오타' },
  }
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, asset_allocation: bad }), /stance/)
})

test('데스크 출력은 5개 시장 코멘트를 전부 요구한다', () => {
  const full = {
    ...goodAgent,
    markets: deskMarkets.map((code) => ({ market: code, stance: 'neutral', comment: `${code} 코멘트` })),
  }
  assert.equal(validateDeskOutput(full).markets?.length, 5)
  const partial = { ...full, markets: full.markets.filter((m) => m.market !== 'EM') }
  assert.throws(() => validateDeskOutput(partial), /EM/)
  assert.throws(() => validateDeskOutput(goodAgent), /markets/)
})

const goodReport = {
  ticker: '005930.KS', name: '삼성전자', market: 'KR', sector: 'Technology',
  generated_at: '2026-07-31T00:00:00.000Z',
  snapshot: {
    price: 71000, change_1d: 0.012, change_1m: 0.05, change_12m: 0.32,
    market_cap: 4.2e14,
    per: 12.3, pbr: null, roe: 0.15,
    per_pctile_in_sector: 40, debt_to_equity: 25.1,
    week52: { high: 90000, low: 55000, position: 0.6 },
    revenue_trend: [{ period: '2026Q1', value: 1.1e14 }],
    op_margin_trend: [{ period: '2026Q1', value: 0.28 }],
  },
  business: '메모리·시스템반도체를 설계·제조해 판매한다.',
  thesis: ['메모리 사이클 회복', 'HBM 수요 확대', '파운드리 점유율 개선'],
  bear_points: ['중국 경쟁 심화', '설비투자 부담', '환율 노출'],
  catalysts: ['3분기 실적 발표'],
  technical_read: '52주 밴드 중반, 완만한 상승 추세.',
  news: [{ title: '삼성전자, HBM 공급 확대', url: 'http://e.com/a', date: '2026-07-30', takeaway: '수요 회복 시그널' }],
  verdict: { stance: 'positive', one_liner: '메모리 회복 국면 초입', confidence: 0.6 },
  invalidation: ['메모리 가격이 두 분기 연속 하락하면 이 논지는 깨진다'],
  disclaimer: '투자자문이 아닙니다.',
}

test('정상 CompanyReport는 통과하고 같은 객체를 돌려준다', () => {
  assert.deepEqual(validateCompanyReport(goodReport), goodReport)
})

test('invalidation이 비면 거부 — 반증 조건 없는 리포트는 받지 않는다', () => {
  assert.throws(() => validateCompanyReport({ ...goodReport, invalidation: [] }), /invalidation/)
})

test('thesis나 bear_points가 비면 거부', () => {
  assert.throws(() => validateCompanyReport({ ...goodReport, thesis: [] }), /thesis/)
  assert.throws(() => validateCompanyReport({ ...goodReport, bear_points: [] }), /bear_points/)
})

test('market이 KR/US가 아니면 거부', () => {
  assert.throws(() => validateCompanyReport({ ...goodReport, market: 'JP' }), /market/)
})

test('snapshot의 숫자 필드가 NaN이나 Infinity면 거부, null은 통과', () => {
  assert.throws(() => validateCompanyReport({
    ...goodReport, snapshot: { ...goodReport.snapshot, per: NaN },
  }), /per/)
  assert.throws(() => validateCompanyReport({
    ...goodReport, snapshot: { ...goodReport.snapshot, per: Infinity },
  }), /per/)
  assert.deepEqual(
    validateCompanyReport({ ...goodReport, snapshot: { ...goodReport.snapshot, per: null } }).snapshot.per,
    null,
  )
})

test('generated_at이 ISO 8601 날짜로 시작하지 않으면 거부', () => {
  assert.throws(() => validateCompanyReport({ ...goodReport, generated_at: 'not a date' }), /generated_at/)
})

test('week52.position이 0-1 밖이면 거부', () => {
  assert.throws(() => validateCompanyReport({
    ...goodReport, snapshot: { ...goodReport.snapshot, week52: { ...goodReport.snapshot.week52, position: 1.5 } },
  }), /position/)
})
