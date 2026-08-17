import { getSupabase } from './supabase.ts'
import type { AgentOutput, CompanyReport, DailyVerdict, MonthlyReport, SectorHoldings } from './types.ts'

export async function getLatestPublishedVerdict(): Promise<{ date: string; verdict: DailyVerdict } | null> {
  const supabase = getSupabase()
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
  const supabase = getSupabase()
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
  const supabase = getSupabase()
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
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('agent_reports')
    .select('agent,output')
    .eq('date', date)
    .order('agent', { ascending: true })
  if (error) throw new Error(`agent_reports 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => ({ agent: r.agent as string, output: r.output as AgentOutput }))
}

/**
 * 최근 시세 시계열(자산별 종가만). market_snapshots(kind='prices')는 한 행에 심볼당
 * 1년 가까운 OHLCV가 통째로 들어 있으므로 최신 행 하나만 읽으면 된다.
 * 근거 카드 옆 미니 차트용이라 실패해도 페이지 전체를 죽이지 않는다 — 빈 객체를 반환하고
 * EvidenceChart 쪽에서 "그릴 게 없으면 안 그린다"로 처리한다.
 */
export async function getPriceHistory(days = 260): Promise<Record<string, { date: string; close: number }[]>> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('market_snapshots')
      .select('payload')
      .eq('kind', 'prices')
      .order('date', { ascending: false })
      .limit(1)
    if (error) throw error
    const payload = (data?.[0]?.payload ?? {}) as Record<string, { date: string; close: number }[]>
    const out: Record<string, { date: string; close: number }[]> = {}
    for (const [symbol, bars] of Object.entries(payload)) {
      out[symbol] = bars.slice(-days).map((b) => ({ date: b.date, close: b.close }))
    }
    return out
  } catch (e) {
    console.error(`market_snapshots(prices) 조회 실패: ${(e as Error).message}`)
    return {}
  }
}

/**
 * 매크로 지표 시계열. 키는 `features.macro.<필드>`의 필드명과 같아서
 * 근거 경로에서 바로 찾아 쓸 수 있다. 실패해도 페이지를 죽이지 않는다 —
 * 차트는 부가 정보라 없으면 안 그리면 그만이다.
 */
export type ChartData = {
  /** 지표 시계열. 키는 `features.macro.<필드>`의 필드명, 지역 신용은 `regionMacro.<코드>.creditSpread`. */
  series: Record<string, { date: string; value: number }[]>
  /** 근거 경로 → 그릴 심볼. 인덱스로 된 경로(`features.sleeves[7]`)를 티커로 푼다. */
  chartIndex: Record<string, string>
  /** 시장 쌍별 60일 상관. 상관 표를 그리는 데 쓴다. */
  regionCorr: { a: string; b: string; corr60d: number | null }[]
}

/**
 * 근거 옆에 차트를 그리는 데 필요한 것 전부. 실패해도 페이지를 죽이지 않는다 —
 * 차트는 부가 정보라 없으면 안 그리면 그만이다.
 */
export async function getChartData(): Promise<ChartData> {
  const empty: ChartData = { series: {}, chartIndex: {}, regionCorr: [] }
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('market_snapshots')
      .select('payload')
      .eq('kind', 'macro')
      .order('date', { ascending: false })
      .limit(1)
    if (error) throw error
    const p = data?.[0]?.payload as Partial<ChartData> | undefined
    if (!p) return empty
    return {
      series: p.series ?? {},
      chartIndex: p.chartIndex ?? {},
      regionCorr: p.regionCorr ?? [],
    }
  } catch (e) {
    console.error(`market_snapshots(macro) 조회 실패: ${(e as Error).message}`)
    return empty
  }
}

/**
 * 섹터 ETF 상위 보유종목. CIO가 그날 스탠스를 낸 섹터만 있다 —
 * 전 섹터를 매일 수집하지 않으므로 클릭한 섹터에 데이터가 없을 수 있고,
 * 화면은 그 경우를 "구성종목 데이터 없음"으로 정직하게 보여준다.
 */
export async function getSectorHoldings(): Promise<Record<string, SectorHoldings>> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('market_snapshots')
      .select('payload')
      .eq('kind', 'holdings')
      .order('date', { ascending: false })
      .limit(1)
    if (error) throw error
    return (data?.[0]?.payload ?? {}) as Record<string, SectorHoldings>
  } catch (e) {
    console.error(`market_snapshots(holdings) 조회 실패: ${(e as Error).message}`)
    return {}
  }
}

/** 공개된 월간 리포트 중 최신 하나. RLS가 published=true만 내보낸다. */
export async function getLatestMonthlyReport(): Promise<MonthlyReport | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('payload')
    .order('month', { ascending: false })
    .limit(1)
  if (error) throw new Error(`monthly_reports 조회 실패: ${error.message}`)
  return (data?.[0]?.payload as MonthlyReport) ?? null
}

export async function getMonthlyReport(month: string): Promise<MonthlyReport | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('payload')
    .eq('month', month)
    .limit(1)
  if (error) throw new Error(`monthly_reports 조회 실패 (${month}): ${error.message}`)
  return (data?.[0]?.payload as MonthlyReport) ?? null
}

export async function getMonthlyReportMonths(limit = 24): Promise<string[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('month')
    .order('month', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`monthly_reports 목록 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => r.month as string)
}

export async function getLatestCompanyReport(
  ticker: string,
  market: 'KR' | 'US',
): Promise<CompanyReport | null> {
  const supabase = getSupabase()
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
