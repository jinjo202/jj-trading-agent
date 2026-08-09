/**
 * DBnomics — 각국 통계청·국제기구 시계열을 **키 없이** 미러하는 공개 API.
 *
 * 여기에 온 이유: 일본·한국 CPI를 FRED에서 못 구한다. FRED가 OECD에서 받아오던
 * 시리즈가 일본은 2021년, 한국은 2023년에 갱신이 끊겼고, OECD SDMX 직접 호출은 500을 낸다.
 * 각국 공식 API(일본 e-Stat, 한국 ECOS)는 앱키가 필수라 무인 실행에 넣기 어렵다.
 *
 * 다만 DBnomics도 미러마다 최신성이 제각각이다 — IMF 미러는 13개월 밀려 있었다.
 * 그래서 쓸 시리즈는 전부 최신 관측일을 실측으로 확인하고 골랐다.
 */
export type DbnomicsObs = { date: string; value: number | null }

export async function fetchDbnomicsSeries(code: string): Promise<DbnomicsObs[]> {
  const url = `https://api.db.nomics.world/v22/series/${code}?observations=1`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`DBnomics ${code} HTTP ${res.status}`)
  const json = (await res.json()) as {
    series?: { docs?: { period?: string[]; value?: (number | string | null)[] }[] }
  }
  const doc = json.series?.docs?.[0]
  if (!doc?.period || !doc.value) throw new Error(`DBnomics ${code}: 관측치 없음`)

  return doc.period.map((date, i) => {
    const raw = doc.value![i]
    // DBnomics는 결측을 null 또는 문자열 'NA'로 준다. 둘 다 결측으로 취급한다.
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
    return { date, value }
  })
}
