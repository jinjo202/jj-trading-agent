import type { AgentOutput, BundleA, BundleB, Candidate, FeatureSet, NewsItem } from './types.ts'

export const DISCLAIMER =
  '이 문서는 공개 데이터를 정리·해석한 리서치 자료이며 투자자문이 아닙니다. ' +
  '작성자는 라이선스를 가진 투자자문업자가 아니며, 어떤 수익도 보장하지 않습니다. ' +
  '투자 판단과 그 결과에 대한 책임은 전적으로 투자자 본인에게 있습니다.'

export function buildBundleA(
  features: FeatureSet,
  indexNews: NewsItem[],
  krNews: NewsItem[],
): BundleA {
  return {
    date: features.date,
    features,
    news: { market: indexNews, korea: krNews },
    agents_to_run: ['macro', 'allocation', 'country_sector', 'technical', 'news'],
    disclaimer: DISCLAIMER,
  }
}

// country_sector agent는 섹터 스탠스를 evidence에 `label: 'sector:<Yahoo섹터명>', value: 'OW'`
// 형태로 남긴다. 스크리너가 자유 서술을 파싱하지 않아도 되게 만든 계약이다.
export function owSectorsFrom(agents: AgentOutput[]): string[] {
  const cs = agents.find((a) => a.agent === 'country_sector')
  if (!cs) return []
  return cs.evidence
    .filter((e) => e.label.startsWith('sector:') && e.value.trim().toUpperCase() === 'OW')
    .map((e) => e.label.slice('sector:'.length).trim())
    .filter((s) => s.length > 0)
}

export function buildBundleB(
  bundleA: BundleA,
  agents: AgentOutput[],
  candidates: Candidate[],
  news: Record<string, NewsItem[]>,
  requested: { ticker: string; market: 'KR' | 'US' }[],
): BundleB {
  return {
    date: bundleA.date,
    features: bundleA.features,
    agents_a: agents,
    candidates,
    candidate_news: news,
    company_reports_for: requested,
    agents_to_run: ['fundamental', 'counter', 'synthesizer', 'company_report'],
    disclaimer: DISCLAIMER,
  }
}
