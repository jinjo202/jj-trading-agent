import { validateAgentOutput, validateCompanyReport, validateDailyVerdict } from './schema.ts'
import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

export function splitOutputs(raw: unknown): {
  agents: AgentOutput[]
  verdict: DailyVerdict
  reports: CompanyReport[]
} {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('LLM 출력: 최상위가 object가 아님')
  }
  const o = raw as Record<string, unknown>
  if (o.verdict === undefined) throw new Error('LLM 출력: verdict가 없음')
  const agentsRaw = Array.isArray(o.agents) ? o.agents : []
  const reportsRaw = Array.isArray(o.company_reports) ? o.company_reports : []
  return {
    agents: agentsRaw.map(validateAgentOutput),
    verdict: validateDailyVerdict(o.verdict),
    reports: reportsRaw.map(validateCompanyReport),
  }
}
