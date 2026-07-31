import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

// 지연 import: 모듈 로드 시점에 env var를 요구하지 않기 위해서다.
// historyPoint는 순수 함수라 이 파일을 import해도 실제 DB 함수를 호출하지 않는 한
// 네트워크/자격증명이 전혀 필요 없어야 한다 (queries.test.ts가 정확히 이 경우).
async function client() {
  const { supabase } = await import('./supabase.ts')
  return supabase
}

export async function getLatestPublishedVerdict(): Promise<{ date: string; verdict: DailyVerdict } | null> {
  const supabase = await client()
  const { data, error } = await supabase
    .from('daily_verdicts')
    .select('date,verdict')
    .order('date', { ascending: false })
    .limit(1)
  if (error) throw new Error(`daily_verdicts 조회 실패: ${error.message}`)
  const row = data?.[0]
  return row ? { date: row.date as string, verdict: row.verdict as DailyVerdict } : null
}

export async function getVerdictHistory(
  limit = 90,
): Promise<{ date: string; verdict: DailyVerdict }[]> {
  const supabase = await client()
  const { data, error } = await supabase
    .from('daily_verdicts')
    .select('date,verdict')
    .order('date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`daily_verdicts 히스토리 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => ({ date: r.date as string, verdict: r.verdict as DailyVerdict }))
}

export function historyPoint(row: { date: string; verdict: DailyVerdict }): { date: string; score: number } {
  return { date: row.date, score: row.verdict.equity_score }
}

// agent_reports는 RLS가 이미 전체 SELECT를 허용하므로, "발행 여부" 판단은
// daily_verdicts를 따로 조회해 앱 레벨에서 화면 노출을 결정한다.
export async function isPublished(date: string): Promise<boolean> {
  const supabase = await client()
  const { data, error } = await supabase
    .from('daily_verdicts')
    .select('date')
    .eq('date', date)
    .limit(1)
  if (error) throw new Error(`발행 여부 확인 실패: ${error.message}`)
  return (data?.length ?? 0) > 0
}

export async function getAgentReports(
  date: string,
): Promise<{ agent: string; output: AgentOutput }[]> {
  const supabase = await client()
  const { data, error } = await supabase
    .from('agent_reports')
    .select('agent,output')
    .eq('date', date)
    .order('agent', { ascending: true })
  if (error) throw new Error(`agent_reports 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => ({ agent: r.agent as string, output: r.output as AgentOutput }))
}

export async function getLatestCompanyReport(
  ticker: string,
  market: 'KR' | 'US',
): Promise<CompanyReport | null> {
  const supabase = await client()
  const { data, error } = await supabase
    .from('company_reports')
    .select('payload')
    .eq('ticker', ticker)
    .eq('market', market)
    .order('date', { ascending: false })
    .limit(1)
  if (error) throw new Error(`company_reports 조회 실패 (${ticker}): ${error.message}`)
  const row = data?.[0]
  return row ? (row.payload as CompanyReport) : null
}
