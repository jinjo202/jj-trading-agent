import type {
  AgentOutput, BundleA, BundleB, Candidate, CompanyReport, FeatureSet, MarketCode, NewsItem,
} from './types.ts'
import { SECTOR_BY_ETF } from './universe.ts'

const KNOWN_SECTORS = Object.values(SECTOR_BY_ETF)

// LLM이 어떤 대소문자로 섹터명을 내든 DB의 정식 표기(SECTOR_BY_ETF)로 맞춘다.
// 어휘에 없는 이름은 오타로 보고 여기서 크게 실패시킨다 — 빈 유니버스로 조용히 흘러가는 것보다 낫다.
function canonicalSector(raw: string): string {
  const match = KNOWN_SECTORS.find((s) => s.toLowerCase() === raw.toLowerCase())
  if (!match) throw new Error(`알 수 없는 섹터명: "${raw}" — country_sector agent의 출력을 확인하세요`)
  return match
}

export const DISCLAIMER =
  '이 문서는 공개 데이터를 정리·해석한 리서치 자료이며 투자자문이 아닙니다. ' +
  '작성자는 라이선스를 가진 투자자문업자가 아니며, 어떤 수익도 보장하지 않습니다. ' +
  '투자 판단과 그 결과에 대한 책임은 전적으로 투자자 본인에게 있습니다.'

export function buildBundleA(
  features: FeatureSet,
  indexNews: NewsItem[],
  krNews: NewsItem[],
  regionNews: Partial<Record<MarketCode, NewsItem[]>> = {},
): BundleA {
  return {
    date: features.date,
    features,
    news: { market: indexNews, korea: krNews, regions: regionNews },
    // 6개 데스크가 각각 5개 시장 전부에 코멘트를 남긴다. 시장×데스크로 30번 부르지 않고
    // 데스크당 1번씩 6번만 부른다 — 한 데스크가 5개 시장을 한 번에 보는 편이
    // 시장 간 비교(상대 배분의 본질)에도 맞다.
    agents_to_run: ['macro', 'technical', 'news', 'allocation', 'fundamental', 'sector'],
    disclaimer: DISCLAIMER,
  }
}

// sector 데스크는 섹터 스탠스를 evidence에 `label: 'sector:<Yahoo섹터명>', value: 'OW'`
// 형태로 남긴다. 스크리너가 자유 서술을 파싱하지 않아도 되게 만든 계약이다.
// 'country_sector'는 2026-08 데스크 개편 전 이름 — 과거 실행분을 다시 돌릴 때를 위해 받아준다.
export function owSectorsFrom(agents: AgentOutput[]): string[] {
  const cs = agents.find((a) => a.agent === 'sector' || a.agent === 'country_sector')
  if (!cs) return []
  return cs.evidence
    .filter((e) => e.label.startsWith('sector:') && e.value.trim().toUpperCase() === 'OW')
    .map((e) => e.label.slice('sector:'.length).trim())
    .filter((s) => s.length > 0)
    .map((s) => canonicalSector(s))
}

export function buildBundleB(
  bundleA: BundleA,
  agents: AgentOutput[],
  candidates: Candidate[],
  news: Record<string, NewsItem[]>,
  snapshots: Record<string, CompanyReport['snapshot']>,
  requested: { ticker: string; market: 'KR' | 'US' }[],
): BundleB {
  return {
    date: bundleA.date,
    features: bundleA.features,
    agents_a: agents,
    candidates,
    candidate_news: news,
    company_snapshots: snapshots,
    company_reports_for: requested,
    agents_to_run: ['counter', 'cio', 'company_report'],
    disclaimer: DISCLAIMER,
  }
}
