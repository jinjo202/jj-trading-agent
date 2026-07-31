import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAgentOutput, validateCompanyReport, validateDailyVerdict } from './schema.ts'

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
