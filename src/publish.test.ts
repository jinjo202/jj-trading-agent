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
  picks: [], invalidation: ['조건'], disclaimer: 'd',
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
