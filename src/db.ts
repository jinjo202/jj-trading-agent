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

export async function upsertSnapshot(kind: SnapshotKind, date: string, payload: unknown): Promise<void> {
  const { error } = await db()
    .from('market_snapshots')
    .upsert({ date, kind, payload }, { onConflict: 'date,kind' })
  if (error) throw new Error(`market_snapshots upsert 실패 (${kind}): ${error.message}`)
}
