import type { Ohlcv } from '../types.ts'

type Row = [string, number, number, number, number, number, number]

async function fetchRows(code: string, days: number): Promise<Row[]> {
  const end = new Date()
  const start = new Date(Date.now() - days * 24 * 3600 * 1000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${fmt(start)}&endTime=${fmt(end)}&timeframe=day`
  const res = await fetch(url, { headers: { referer: 'https://finance.naver.com/' } })
  if (!res.ok) throw new Error(`Naver ${code} HTTP ${res.status}`)
  const rows = JSON.parse((await res.text()).replace(/'/g, '"')) as unknown[][]
  return rows.slice(1) as Row[]
}

export async function fetchNaverDaily(code: string, days = 420): Promise<Ohlcv[]> {
  const rows = await fetchRows(code, days)
  return rows.map((r) => ({
    date: `${r[0].slice(0, 4)}-${r[0].slice(4, 6)}-${r[0].slice(6, 8)}`,
    open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5],
  }))
}

// 외국인소진율(%). Yahoo에 없는 한국 수급 지표.
export async function fetchForeignRatio(code: string): Promise<number | null> {
  const rows = await fetchRows(code, 10)
  const last = rows.at(-1)
  const v = last?.[6]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
