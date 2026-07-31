import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SnapshotKind } from './types.ts'

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
