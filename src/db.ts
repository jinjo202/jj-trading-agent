import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AgentOutput, CompanyReport, DailyVerdict, MarketCode, MonthlyReport,
  RegionValuation, SnapshotKind, StandingTaa, UniverseRow,
} from './types.ts'

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다')
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}

// 수집 기준일은 항상 KST. 'sv-SE' 로케일이 YYYY-MM-DD를 준다.
export function kstDate(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

// 세 스냅샷(prices/macro/features)을 한 번의 upsert로 기록해 일부만 커밋되는 상태를 막는다.
export async function upsertSnapshots(
  rows: { kind: SnapshotKind; date: string; payload: unknown }[],
): Promise<void> {
  const { error } = await db()
    .from('market_snapshots')
    .upsert(rows, { onConflict: 'date,kind' })
  if (error) throw new Error(`market_snapshots upsert 실패: ${error.message}`)
}

export async function upsertUniverse(rows: UniverseRow[]): Promise<void> {
  // Supabase는 한 번에 큰 배열도 받지만 500행씩 끊어 타임아웃을 피한다.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db()
      .from('universe')
      .upsert(rows.slice(i, i + 500), { onConflict: 'ticker,market' })
    if (error) throw new Error(`universe upsert 실패: ${error.message}`)
  }
}

export async function readUniverse(sectors?: string[]): Promise<UniverseRow[]> {
  let q = db().from('universe').select('ticker,market,name,sector,active').eq('active', true)
  if (sectors && sectors.length > 0) q = q.in('sector', sectors)
  const { data, error } = await q
  if (error) throw new Error(`universe 읽기 실패: ${error.message}`)
  return (data ?? []) as UniverseRow[]
}

export async function readLatestSnapshot(
  kind: SnapshotKind,
): Promise<{ date: string; payload: unknown } | null> {
  const { data, error } = await db()
    .from('market_snapshots')
    .select('date,payload')
    .eq('kind', kind)
    .order('date', { ascending: false })
    .limit(1)
  if (error) throw new Error(`market_snapshots 읽기 실패 (${kind}): ${error.message}`)
  const row = data?.[0]
  return row ? { date: row.date as string, payload: row.payload } : null
}

/**
 * 과거 features 스냅샷에서 valuation 블록만 뽑아온다.
 *
 * `payload->valuation`으로 잘라 받는 이유: features 스냅샷 하나가 수십 KB인데
 * 밸류에이션 백분위에 필요한 건 그중 몇백 바이트뿐이다. 전체를 끌어오면
 * 400일치가 수십 MB가 된다.
 */
export async function readValuationHistory(
  beforeDate: string,
  limit = 400,
): Promise<{ date: string; valuation: Partial<Record<MarketCode, RegionValuation>> }[]> {
  const { data, error } = await db()
    .from('market_snapshots')
    .select('date,payload->valuation')
    .eq('kind', 'features')
    .lt('date', beforeDate)
    .order('date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`밸류에이션 히스토리 조회 실패: ${error.message}`)
  return (data ?? [])
    .map((r) => ({
      date: r.date as string,
      valuation: (r.valuation ?? {}) as Partial<Record<MarketCode, RegionValuation>>,
    }))
    // valuation 수집 이전(2026-08-07 이전) 스냅샷은 이 블록이 없다. 표본에서 뺀다.
    .filter((r) => Object.keys(r.valuation).length > 0)
}

export async function readOpenReportRequests(
  limit = 5,
): Promise<{ id: number; ticker: string; market: 'KR' | 'US' }[]> {
  const { data, error } = await db()
    .from('report_requests')
    .select('id,ticker,market')
    .is('fulfilled_at', null)
    .order('requested_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`report_requests 읽기 실패: ${error.message}`)
  return (data ?? []) as { id: number; ticker: string; market: 'KR' | 'US' }[]
}

export async function writeAgentReports(date: string, agents: AgentOutput[]): Promise<void> {
  if (agents.length === 0) return
  const rows = agents.map((a) => ({ date, agent: a.agent, output: a }))
  const { error } = await db().from('agent_reports').upsert(rows, { onConflict: 'date,agent' })
  if (error) throw new Error(`agent_reports 쓰기 실패: ${error.message}`)
}

// published는 false로 둔다. 사람이 확인한 뒤 공개하는 것이 기본값이다.
export async function writeDailyVerdict(verdict: DailyVerdict): Promise<void> {
  const { error } = await db()
    .from('daily_verdicts')
    .upsert({ date: verdict.date, verdict, published: false }, { onConflict: 'date' })
  if (error) throw new Error(`daily_verdicts 쓰기 실패: ${error.message}`)
}

/**
 * 발행된 판단을 공개로 바꾼다. anon RLS가 published=true인 행만 읽으므로
 * 이 플래그가 곧 "사이트에 뜨는가"다. 무인 실행에서 자동 공개할 때만 쓴다.
 */
export async function setPublished(date: string, published: boolean): Promise<void> {
  const { error } = await db().from('daily_verdicts').update({ published }).eq('date', date)
  if (error) throw new Error(`daily_verdicts 공개 상태 변경 실패 (${date}): ${error.message}`)
}

/**
 * 해당 날짜 이하에서 가장 최근 판단 하나. 월간 리포트가 "이 달의 마지막 판단"과
 * "전월의 마지막 판단"을 집어올 때 쓴다. 공개 여부와 무관하게 읽는다 —
 * 리포트는 서버에서 만들고, 공개는 리포트 자신의 published가 정한다.
 */
export async function readVerdictOnOrBefore(
  date: string,
): Promise<{ date: string; verdict: DailyVerdict } | null> {
  const { data, error } = await db()
    .from('daily_verdicts')
    .select('date,verdict')
    .lte('date', date)
    .order('date', { ascending: false })
    .limit(1)
  if (error) throw new Error(`daily_verdicts 조회 실패 (${date} 이전): ${error.message}`)
  const row = data?.[0]
  return row ? { date: row.date as string, verdict: row.verdict as DailyVerdict } : null
}

/**
 * 그 달의 가장 이른 판단 중 **비교 가능한 것**. 전월 리포트가 없는 첫 달의 기준으로 쓴다.
 *
 * `markets`가 있는 행만 고른다 — 2026-08 CIO 개편 이전 판단에는 시장별 비중도
 * 자산배분도 없어서, 그것과 비교하면 "변화 0건"이 나온다. 실제로 2026-08-04가
 * 그랬고 첫 리포트의 변화 절이 통째로 비었다.
 */
export async function readEarliestVerdictInMonth(
  month: string,
): Promise<{ date: string; verdict: DailyVerdict } | null> {
  const { data, error } = await db()
    .from('daily_verdicts')
    .select('date,verdict')
    .gte('date', `${month}-01`)
    .lte('date', `${month}-31`)
    .not('verdict->markets', 'is', null)
    .order('date', { ascending: true })
    .limit(1)
  if (error) throw new Error(`daily_verdicts 조회 실패 (${month} 첫 판단): ${error.message}`)
  const row = data?.[0]
  return row ? { date: row.date as string, verdict: row.verdict as DailyVerdict } : null
}

/**
 * 직전 확정 TAA. 최신 월간 리포트가 기준으로 삼은 일간 판단에서 배분만 뽑아온다.
 *
 * 리포트에 배분을 따로 저장하지 않고 as_of로 되짚는 이유: 확정 배분은 그 판단
 * **자체**라서 복사본을 두면 둘이 어긋날 수 있다. 출처를 하나로 둔다.
 * 공개 여부는 보지 않는다 — 이건 화면 노출이 아니라 의사결정 기록이다.
 */
export async function readStandingTaa(): Promise<StandingTaa | null> {
  const { data, error } = await db()
    .from('monthly_reports')
    .select('month,payload->>as_of')
    .order('month', { ascending: false })
    .limit(1)
  if (error) throw new Error(`월간 리포트 조회 실패: ${error.message}`)
  const row = data?.[0]
  const asOf = row?.as_of as string | undefined
  if (!row || !asOf) return null

  const anchor = await readVerdictOnOrBefore(asOf)
  // as_of와 정확히 같은 날이어야 한다. 그 판단이 지워졌다면 확정 배분도 없는 것이다.
  if (!anchor || anchor.date !== asOf) return null

  const v = anchor.verdict
  if (!v.asset_allocation || !v.markets) return null
  return {
    month: row.month as string,
    as_of: anchor.date,
    asset_allocation: v.asset_allocation,
    markets: v.markets.map((m) => ({ code: m.code, stance: m.stance, weight_pct: m.weight_pct })),
    invalidation: v.invalidation,
  }
}

/**
 * 그 달 리포트가 어느 판단일까지 반영했는지. 없으면 null.
 *
 * 존재 여부만 보면 안 되는 이유: 월중에 만든 리포트는 그 시점까지만 담고 있다.
 * 8/16에 만든 8월 리포트를 9/1에 "이미 있음"으로 건너뛰면 8/17~31이 영영 빠진다.
 * 그래서 저장된 as_of를 돌려주고, 호출부가 그 달 마지막 판단과 비교해 다시 만들지 정한다.
 */
export async function readMonthlyReportAsOf(month: string): Promise<string | null> {
  const { data, error } = await db()
    .from('monthly_reports')
    .select('payload->>as_of')
    .eq('month', month)
    .limit(1)
  if (error) throw new Error(`monthly_reports 확인 실패 (${month}): ${error.message}`)
  return (data?.[0]?.as_of as string | undefined) ?? null
}

// daily_verdicts와 같은 규칙 — published는 false로 두고 사람이 공개한다.
export async function writeMonthlyReport(report: MonthlyReport): Promise<void> {
  const { error } = await db()
    .from('monthly_reports')
    .upsert({ month: report.month, payload: report, published: false }, { onConflict: 'month' })
  if (error) throw new Error(`monthly_reports 쓰기 실패: ${error.message}`)
}

export async function setMonthlyPublished(month: string, published: boolean): Promise<void> {
  const { error } = await db().from('monthly_reports').update({ published }).eq('month', month)
  if (error) throw new Error(`monthly_reports 공개 상태 변경 실패 (${month}): ${error.message}`)
}

export async function writeCompanyReports(reports: CompanyReport[]): Promise<void> {
  if (reports.length === 0) return
  const rows = reports.map((r) => ({
    ticker: r.ticker,
    market: r.market,
    date: r.generated_at.slice(0, 10),
    payload: r,
  }))
  const { error } = await db()
    .from('company_reports')
    .upsert(rows, { onConflict: 'ticker,market,date' })
  if (error) throw new Error(`company_reports 쓰기 실패: ${error.message}`)
}

export async function markRequestsFulfilled(
  pairs: { ticker: string; market: string }[],
): Promise<void> {
  for (const p of pairs) {
    const { error } = await db()
      .from('report_requests')
      .update({ fulfilled_at: new Date().toISOString() })
      .eq('ticker', p.ticker)
      .eq('market', p.market)
      .is('fulfilled_at', null)
    if (error) throw new Error(`report_requests 갱신 실패 (${p.ticker}): ${error.message}`)
  }
}
