export type QuarterlyYoy = {
  period: string
  operatingIncome: number | null
  priorPeriod: string | null
  priorOperatingIncome: number | null
  /** null이면 전년 동기가 없거나 전년 동기가 적자/0이라 증가율이 뜻을 갖지 못한다. */
  yoyPct: number | null
}

/**
 * 최근 두 분기와 그 1년 전 같은 분기를 짝지어 YoY를 낸다.
 * 배열은 오래된 것부터 정렬돼 있다고 가정한다(수집부가 그렇게 저장한다) — 최대 6분기라
 * 최근 두 분기(n-1, n-2) 각각의 4분기 전(n-5, n-6)이 정확히 배열 양 끝에 걸린다.
 */
export function lastTwoQuartersYoy(
  quarterly: { period: string; operatingIncome: number | null }[],
): QuarterlyYoy[] {
  const n = quarterly.length
  const out: QuarterlyYoy[] = []
  for (const idx of [n - 2, n - 1]) {
    if (idx < 0) continue
    const cur = quarterly[idx]
    const prior = idx - 4 >= 0 ? quarterly[idx - 4] : null
    // 전년 동기가 적자(≤0)면 "증가율"이 부호를 왜곡한다(적자 축소가 음수%로 나오는 등).
    // 뜻이 분명한 경우에만 계산한다.
    const yoy =
      cur.operatingIncome !== null && prior?.operatingIncome && prior.operatingIncome > 0
        ? ((cur.operatingIncome / prior.operatingIncome - 1) * 100)
        : null
    out.push({
      period: cur.period,
      operatingIncome: cur.operatingIncome,
      priorPeriod: prior?.period ?? null,
      priorOperatingIncome: prior?.operatingIncome ?? null,
      yoyPct: yoy,
    })
  }
  return out
}
