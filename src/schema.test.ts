import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAgentOutput, validateDailyVerdict } from './schema.ts'

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
