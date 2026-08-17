import type { DailyVerdict, MarketCode, MonthlyReport } from './types.ts'

/** 서버 src/saa.ts의 MATERIAL과 같은 값. 두 곳에 있으므로 바꾸면 같이 바꾼다. */
const MATERIAL_MARKET_PP = 5
const MATERIAL_ASSET_PP = 5

const MARKET_NAMES: Record<MarketCode, string> = {
  US: '미국', KR: '한국', JP: '일본', EU: '유럽', EM: '이머징',
}

export type DriftRow = {
  area: string
  /** 이번 달 확정 TAA */
  standing: string
  /** 오늘의 일간 판단 */
  today: string
  /** 이탈 폭(%p). 스탠스만 바뀐 경우 등 크기를 잴 수 없으면 null */
  gapPp: number | null
  material: boolean
}

const mid = (b: [number, number]): number => (b[0] + b[1]) / 2

/**
 * 확정 TAA(월간) 대비 오늘의 일간 판단이 얼마나 벗어났는지.
 *
 * 일간 판단은 **배분을 교체하는 것이 아니라 관측**이다. 실측에서 시장 스탠스의 52%가
 * 하루 만에 뒤집혔는데 신호와 점수는 그대로였다 — 매일 바뀌는 것은 시장이 아니라
 * 모델의 표현이다. 그래서 일간은 "확정 배분에서 얼마나 벗어났나"로만 읽고,
 * 그 이탈이 문턱을 넘을 때만 배분 재검토 신호로 본다.
 */
export function computeDrift(today: DailyVerdict, standing: MonthlyReport): DriftRow[] {
  const rows: DriftRow[] = []

  // 자산군: 월간 포지셔닝 표의 '자산군' 그룹이 확정 TAA의 밴드 중앙값이다.
  const standingAsset = new Map(
    standing.positioning.filter((p) => p.group === '자산군').map((p) => [p.name, p.weight_pct]),
  )
  const alloc = today.asset_allocation
  if (alloc) {
    const bands: [string, [number, number] | undefined][] = [
      ['주식', alloc.equity], ['채권', alloc.bond], ['대체자산', alloc.alt], ['현금', alloc.cash],
    ]
    for (const [name, band] of bands) {
      if (!band) continue
      const s = standingAsset.get(name)
      if (s === undefined) continue
      const t = mid(band)
      const gap = t - s
      rows.push({
        area: `자산군 · ${name}`,
        standing: `${s}%`,
        today: `${band[0]}-${band[1]}%`,
        gapPp: Math.round(gap * 10) / 10,
        material: Math.abs(gap) >= MATERIAL_ASSET_PP,
      })
    }
  }

  // 주식 지역
  const standingMkt = new Map(
    standing.positioning
      .filter((p) => p.group === '주식 · 지역')
      .map((p) => [p.name, { w: p.weight_pct, stance: p.stance }]),
  )
  for (const m of today.markets ?? []) {
    const s = standingMkt.get(MARKET_NAMES[m.code])
    if (!s) continue
    const gap = m.weight_pct - s.w
    rows.push({
      area: `주식 · ${MARKET_NAMES[m.code]}`,
      standing: `${s.stance} ${s.w}%`,
      today: `${m.stance} ${m.weight_pct}%`,
      gapPp: gap,
      material: Math.abs(gap) >= MATERIAL_MARKET_PP,
    })
  }

  return rows
}
