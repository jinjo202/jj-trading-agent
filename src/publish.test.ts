import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitOutputs } from './publish.ts'

const agent = {
  agent: 'fundamental', score: 60, confidence: 0.6, signal: 'bullish',
  headline: 'h', reasoning: 'r',
  evidence: [{ label: 'ROE', value: '18.9%', source: 'candidates[0].roe' }], flags: [],
}

const verdict = {
  date: '2026-07-31', equity_score: 68, signal: 'increase',
  suggested_equity_weight: [60, 70], conviction: 'medium',
  drivers: [{ agent: 'macro', direction: '+', weight: 0.3, point: 'p' }],
  counter_case: '반대 논거', countries: [{ code: 'KR', stance: 'OW', rationale: 'r' }],
  sectors: [{ name: 'Technology', stance: 'OW', etf: 'XLK', rationale: 'r' }],
  picks: [{
    ticker: 'AAPL', name: 'Apple', market: 'US', sector: 'Technology',
    thesis: 't', scores: { tech: 70, fund: 65, news: 60 }, risk: 'r',
  }],
  invalidation: ['조건'], disclaimer: 'd',
  regime: '확장 후반', horizon: '3-6개월 전술적',
  asset_allocation: {
    equity: [55, 65], bond: [20, 28], cash: [3, 8], alt: [5, 12], rationale: 'r',
    fixed_income: [{ sleeve: '미국 국채 중기', ticker: 'IEF', weight_pct: 100, rationale: 'r' }],
    duration: { stance: 'neutral', rationale: 'r' },
    alternatives: [{ sleeve: '금', ticker: 'GLD', weight_pct: 100, rationale: 'r' }],
  },
  dm_vs_em: { preference: 'DM', rationale: 'r' },
  fx_view: {
    dxy: { direction: 'neutral', confidence: 'medium', rationale: 'r' },
    usdkrw: { direction: 'neutral', confidence: 'medium', rationale: 'r' },
  },
  // 40 + 15*4 = 100
  markets: (['US', 'KR', 'JP', 'EU', 'EM'] as const).map((code, i) => ({
    code, stance: i === 0 ? 'OW' : 'N', weight_pct: i === 0 ? 40 : 15,
    conviction: 'medium', headline: 'h', rationale: 'r', key_risk: 'k',
    desk_reads: [{ desk: 'macro', stance: 'neutral', comment: 'c' }],
  })),
  trades: [{ action: 'add', instrument: 'XLV', market: 'US', rationale: 'r' }],
}

test('splitOutputs는 세 종류를 나눠 담는다', () => {
  const out = splitOutputs({ agents: [agent], verdict, company_reports: [] })
  assert.equal(out.agents.length, 1)
  assert.equal(out.verdict.equity_score, 68)
  assert.equal(out.reports.length, 0)
})

test('splitOutputs는 verdict가 없으면 거부', () => {
  assert.throws(() => splitOutputs({ agents: [agent], company_reports: [] }), /verdict/)
})

test('splitOutputs는 agent 하나가 깨져도 조용히 넘기지 않는다', () => {
  const broken = { ...agent, evidence: [] }
  assert.throws(() => splitOutputs({ agents: [agent, broken], verdict, company_reports: [] }), /evidence/)
})

test('splitOutputs는 최상위가 객체가 아니면 거부', () => {
  assert.throws(() => splitOutputs([agent]), /object/)
})

test('splitOutputs는 company_reports가 없으면 빈 배열로 둔다', () => {
  assert.deepEqual(splitOutputs({ agents: [agent], verdict }).reports, [])
})

test('splitOutputs는 agents가 배열이 아니면 거부', () => {
  assert.throws(() => splitOutputs({ agents: {}, verdict }), /agents/)
})

test('splitOutputs는 company_reports가 배열이 아니면 거부', () => {
  assert.throws(() => splitOutputs({ agents: [agent], verdict, company_reports: {} }), /company_reports/)
})
