import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SnapshotKind, UniverseRow } from './types.ts'

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
