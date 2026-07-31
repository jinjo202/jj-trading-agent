import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBundleA, buildBundleB, owSectorsFrom } from './prepare.ts'
import type { AgentOutput, Candidate, FeatureSet, NewsItem } from './types.ts'

const features = {
  date: '2026-07-31',
  assets: {},
  macro: {
    available: true, dgs2: 3.5, dgs10: 4.2, dgs3mo: 4.5,
    cpiYoY: 0.025, coreCpiYoY: 0.03, unrate: 4.1, hySpread: 3.2,
    curve2s10s: 0.7, curve3m10y: -0.3,
  },
  regime: { vixLevel: 18, vixTerm: 0.9, breadth: 0.01, usdkrw: 1350, usdkrwChange20d: 0.01 },
  relative: { krVsUs3m: 0.04, sectors: [{ etf: 'XLK', rel3m: 0.06 }] },
  foreignRatioSamsung: 52.1,
  missing: [],
} as unknown as FeatureSet

const news = (t: string): NewsItem => ({ title: t, url: 'http://e.com/' + t, date: null, source: 's' })

const agent = (name: string, extra: Partial<AgentOutput> = {}): AgentOutput => ({
  agent: name, score: 60, confidence: 0.6, signal: 'bullish',
  headline: 'h', reasoning: 'r',
  evidence: [{ label: 'l', value: 'v', source: 'features.x' }],
  flags: [], ...extra,
})

const candidate = (ticker: string): Candidate => ({
  ticker, name: ticker, market: 'US', sector: 'Technology',
  turnover: 1e9, yearChangePct: 30, roe: 0.2, operatingMargin: 0.25,
  forwardPE: 20, priceToBook: 5, score: 1.2, tech: null,
})

test('buildBundleA는 features와 뉴스를 담고 실행할 agent 5개를 명시한다', () => {
  const b = buildBundleA(features, [news('us')], [news('kr')])
  assert.equal(b.date, '2026-07-31')
  assert.equal(b.news.market.length, 1)
  assert.equal(b.news.korea.length, 1)
  assert.deepEqual(b.agents_to_run, ['macro', 'allocation', 'country_sector', 'technical', 'news'])
  assert.ok(b.disclaimer.length > 0)
})

test('owSectorsFrom은 country_sector의 evidence에서 OW 섹터를 뽑는다', () => {
  const cs = agent('country_sector', {
    evidence: [
      { label: 'sector:Technology', value: 'OW', source: 'features.relative.sectors' },
      { label: 'sector:Utilities', value: 'UW', source: 'features.relative.sectors' },
      { label: 'sector:Energy', value: 'OW', source: 'features.relative.sectors' },
      { label: 'country:US', value: 'OW', source: 'features.relative.krVsUs3m' },
    ],
  })
  assert.deepEqual(owSectorsFrom([agent('macro'), cs]), ['Technology', 'Energy'])
})

test('owSectorsFrom은 대소문자와 공백을 허용한다', () => {
  const cs = agent('country_sector', {
    evidence: [
      { label: 'sector:Technology', value: 'ow', source: 'features.relative.sectors' },
      { label: 'sector: Energy', value: 'OW ', source: 'features.relative.sectors' },
      { label: 'sector:Utilities', value: 'Ow', source: 'features.relative.sectors' },
    ],
  })
  assert.deepEqual(owSectorsFrom([cs]), ['Technology', 'Energy', 'Utilities'])
})

test('owSectorsFrom은 섹터명을 대소문자 구분 없이 정규화한다', () => {
  const cs = agent('country_sector', {
    evidence: [{ label: 'sector:technology', value: 'OW', source: 's' }],
  })
  assert.deepEqual(owSectorsFrom([cs]), ['Technology'])
})

test('owSectorsFrom은 알 수 없는 섹터명이면 던진다', () => {
  const cs = agent('country_sector', {
    evidence: [{ label: 'sector:Widgets', value: 'OW', source: 's' }],
  })
  assert.throws(() => owSectorsFrom([cs]), /Widgets/)
})

test('owSectorsFrom은 country_sector가 없거나 OW가 없으면 빈 배열', () => {
  assert.deepEqual(owSectorsFrom([agent('macro')]), [])
  assert.deepEqual(owSectorsFrom([agent('country_sector', { evidence: [{ label: 'sector:X', value: 'UW', source: 's' }] })]), [])
})

test('buildBundleB는 A단계 결과와 후보를 싣고 B단계 agent를 명시한다', () => {
  const a = buildBundleA(features, [], [])
  const b = buildBundleB(a, [agent('macro')], [candidate('AAPL')], { AAPL: [news('x')] }, {}, [])
  assert.equal(b.date, a.date)
  assert.equal(b.candidates.length, 1)
  assert.equal(b.candidate_news.AAPL.length, 1)
  assert.deepEqual(b.agents_to_run, ['fundamental', 'counter', 'synthesizer', 'company_report'])
})

test('buildBundleB의 company_reports_for는 요청 큐를 그대로 싣는다', () => {
  const a = buildBundleA(features, [], [])
  const req = [{ ticker: 'MSFT', market: 'US' as const }]
  const b = buildBundleB(a, [agent('macro')], [candidate('AAPL')], {}, {}, req)
  assert.deepEqual(b.company_reports_for, req)
})
