export function hasFredKey(): boolean {
  return Boolean(process.env.FRED_API_KEY)
}

export async function fetchFredSeries(
  id: string,
  start: string,
): Promise<{ date: string; value: number | null }[]> {
  const key = process.env.FRED_API_KEY
  if (!key) throw new Error('FRED_API_KEY 없음')
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&observation_start=${start}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED ${id} HTTP ${res.status}`)
  const json = (await res.json()) as { observations: { date: string; value: string }[] }
  // FRED는 결측을 '.'로 표기한다.
  return json.observations.map((o) => ({
    date: o.date,
    value: o.value === '.' ? null : Number(o.value),
  }))
}
