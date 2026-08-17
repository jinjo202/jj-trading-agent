import { MARKET_CODES, MARKET_NAMES } from './types.ts'
import { MATERIAL, SAA_ALT, SAA_BOND, SAA_EQUITY } from './saa.ts'
import type {
  DailyVerdict, ImplementationRow, MonthlyChange, PositioningRow, SleeveSplit,
} from './types.ts'

// 중립 = SAA다. 기준선은 src/saa.ts 한 곳에서만 정의한다 — 두 군데 두면
// 한쪽만 고쳐졌을 때 ± 열이 조용히 틀린다.
export const NEUTRAL_EQUITY = SAA_EQUITY
export const NEUTRAL_BOND = SAA_BOND
export const NEUTRAL_ALT = SAA_ALT

/**
 * Tactical이 Neutral에서 이만큼(%p) 벗어나면 OW/UW로 부른다.
 * 반올림 노이즈를 스탠스로 승격시키지 않으려는 문턱이다.
 */
const STANCE_BAND = 2

export function stanceFromRelative(relative: number): 'OW' | 'N' | 'UW' {
  if (relative > STANCE_BAND) return 'OW'
  if (relative < -STANCE_BAND) return 'UW'
  return 'N'
}

const STANCE_RANK = { UW: -1, N: 0, OW: 1 } as const

/** 스탠스가 전월 대비 어느 쪽으로 움직였나. 없던 항목은 'new'다. */
export function stanceMove(
  prev: 'OW' | 'N' | 'UW' | undefined,
  now: 'OW' | 'N' | 'UW',
): PositioningRow['change'] {
  if (prev === undefined) return 'new'
  const d = STANCE_RANK[now] - STANCE_RANK[prev]
  return d > 0 ? 'up' : d < 0 ? 'down' : 'same'
}

const mid = (b: [number, number]): number => (b[0] + b[1]) / 2

const round1 = (n: number): number => Math.round(n * 10) / 10

/** sleeve 배분을 티커→비중 맵으로. 같은 티커가 두 줄이면 합친다. */
function byTicker(rows: SleeveSplit[] | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows ?? []) out[r.ticker] = (out[r.ticker] ?? 0) + r.weight_pct
  return out
}

/**
 * Neutral / Tactical / Relative 표 한 덩어리.
 * 전술 배분에 없는 티커도 중립에 있으면 0%로 실어야 "뺐다"가 보인다 —
 * 빠진 줄은 화면에서 사라져 버려서 가장 중요한 정보(제외했다는 사실)를 잃는다.
 */
export function buildImplementation(
  neutral: Record<string, number>,
  tactical: Record<string, number>,
  labels: Record<string, string>,
): ImplementationRow[] {
  const tickers = [...new Set([...Object.keys(neutral), ...Object.keys(tactical)])]
  return tickers
    .map((ticker) => {
      const n = neutral[ticker] ?? 0
      const t = tactical[ticker] ?? 0
      return {
        name: labels[ticker] ?? ticker,
        ticker,
        neutral_pct: round1(n),
        tactical_pct: round1(t),
        relative_pct: round1(t - n),
      }
    })
    .sort((a, b) => b.tactical_pct - a.tactical_pct || a.ticker.localeCompare(b.ticker))
}

/** 주식 지역 배분을 Neutral/Tactical/Relative로. 지역은 티커가 아니라 시장 코드가 키다. */
export function buildEquityImplementation(v: DailyVerdict): ImplementationRow[] {
  const tactical: Record<string, number> = {}
  for (const m of v.markets ?? []) tactical[m.code] = m.weight_pct
  return MARKET_CODES.map((code) => {
    const n = NEUTRAL_EQUITY[code]
    const t = tactical[code] ?? 0
    return {
      name: MARKET_NAMES[code],
      ticker: code,
      neutral_pct: round1(n),
      tactical_pct: round1(t),
      relative_pct: round1(t - n),
    }
  }).sort((a, b) => b.tactical_pct - a.tactical_pct)
}

/**
 * 포지셔닝 표. 자산군·주식지역·채권·대체자산·듀레이션을 한 축으로 세우고
 * 전월 대비 이동을 붙인다. 스탠스와 이동은 전부 코드가 계산한다 —
 * 모델이 "지난달보다 늘렸다"를 지어내지 못하게 하려는 것이 이 함수의 존재 이유다.
 */
export function buildPositioning(now: DailyVerdict, prev: DailyVerdict | null): PositioningRow[] {
  const rows: PositioningRow[] = []

  // 1. 자산군. 밴드 중앙값이 전월 대비 어디로 갔는지가 스탠스보다 직접적이다.
  const alloc = now.asset_allocation
  const prevAlloc = prev?.asset_allocation
  if (alloc) {
    const bands: [string, [number, number] | undefined, [number, number] | undefined][] = [
      ['주식', alloc.equity, prevAlloc?.equity],
      ['채권', alloc.bond, prevAlloc?.bond],
      ['대체자산', alloc.alt, prevAlloc?.alt],
      ['현금', alloc.cash, prevAlloc?.cash],
    ]
    for (const [name, band, prevBand] of bands) {
      if (!band) continue
      const m = mid(band)
      const pm = prevBand ? mid(prevBand) : null
      rows.push({
        group: '자산군',
        name,
        stance: 'N', // 자산군은 중립 기준선이 없다. 밴드 자체가 판단이다.
        weight_pct: round1(m),
        prev_weight_pct: pm === null ? null : round1(pm),
        change: pm === null ? 'new' : m > pm + 0.5 ? 'up' : m < pm - 0.5 ? 'down' : 'same',
        rationale: '',
      })
    }
  }

  // 2. 주식 지역. CIO가 낸 stance를 그대로 쓴다 — 여기는 이미 판단이 들어 있다.
  const prevMarket = new Map((prev?.markets ?? []).map((m) => [m.code, m]))
  for (const m of now.markets ?? []) {
    const p = prevMarket.get(m.code)
    rows.push({
      group: '주식 · 지역',
      name: MARKET_NAMES[m.code],
      stance: m.stance,
      weight_pct: m.weight_pct,
      prev_weight_pct: p?.weight_pct ?? null,
      change: stanceMove(p?.stance, m.stance),
      rationale: m.headline,
    })
  }

  // 3. 채권·대체자산. 스탠스가 없으므로 중립 대비로 만든다.
  const sleeveRows = (
    group: string,
    neutral: Record<string, number>,
    nowSplit: SleeveSplit[] | undefined,
    prevSplit: SleeveSplit[] | undefined,
    labels: Record<string, string>,
  ) => {
    const nowW = byTicker(nowSplit)
    const prevW = byTicker(prevSplit)
    const hadPrev = (prevSplit ?? []).length > 0
    for (const ticker of Object.keys(neutral)) {
      const t = nowW[ticker] ?? 0
      const rel = t - neutral[ticker]
      const stance = stanceFromRelative(rel)
      const prevStance = hadPrev
        ? stanceFromRelative((prevW[ticker] ?? 0) - neutral[ticker])
        : undefined
      rows.push({
        group,
        name: labels[ticker] ?? ticker,
        stance,
        weight_pct: round1(t),
        prev_weight_pct: hadPrev ? round1(prevW[ticker] ?? 0) : null,
        change: stanceMove(prevStance, stance),
        rationale: (nowSplit ?? []).find((r) => r.ticker === ticker)?.rationale ?? '',
      })
    }
  }
  sleeveRows('채권', NEUTRAL_BOND, alloc?.fixed_income, prevAlloc?.fixed_income, BOND_LABELS)
  sleeveRows('대체자산', NEUTRAL_ALT, alloc?.alternatives, prevAlloc?.alternatives, ALT_LABELS)

  return rows
}

/** 화면·리포트에 쓰는 한글 이름. features의 label과 같은 문구를 유지한다. */
export const BOND_LABELS: Record<string, string> = {
  SHY: '미국 국채 1-3년', IEF: '미국 국채 7-10년', TLT: '미국 국채 20년+',
  BWX: '선진국(미국 외) 국채', TIP: '미국 물가연동채',
  LQD: '미국 IG 회사채', HYG: '미국 HY 회사채', BKLN: '시니어론(변동금리)',
  EMB: '이머징 소버린(USD)', EMLC: '이머징 로컬통화',
}

export const ALT_LABELS: Record<string, string> = {
  GLD: '금', SLV: '은', DBB: '산업금속(비철)', DBC: '종합 원자재',
  PSP: '상장 PE', BIZD: 'BDC 사모대출', IGF: '글로벌 인프라',
  VNQ: '미국 리츠', REET: '글로벌 리츠',
}

/**
 * 전월 대비 실제로 바뀐 것만 뽑는다. **`reason`은 비워서 낸다** —
 * 무엇이 바뀌었는지는 코드가 알지만 왜 바뀌었는지는 모델이 채운다.
 * 이 분리가 "지난달 대비 늘렸다"류의 환각을 원천적으로 막는다.
 */
export function diffVerdicts(now: DailyVerdict, prev: DailyVerdict | null): MonthlyChange[] {
  if (!prev) return []
  const out: MonthlyChange[] = []

  const alloc = now.asset_allocation
  const prevAlloc = prev.asset_allocation
  if (alloc && prevAlloc) {
    const bands: [string, [number, number] | undefined, [number, number] | undefined][] = [
      ['자산군 · 주식', alloc.equity, prevAlloc.equity],
      ['자산군 · 채권', alloc.bond, prevAlloc.bond],
      ['자산군 · 대체자산', alloc.alt, prevAlloc.alt],
      ['자산군 · 현금', alloc.cash, prevAlloc.cash],
    ]
    for (const [area, band, prevBand] of bands) {
      if (!band || !prevBand) continue
      // 감지 문턱(1%p)과 강조 문턱(MATERIAL)은 다르다. 작아도 잡아서 보여주되,
      // 눈에 띄게 표시하는 것은 일간 잡음의 두 배를 넘을 때만이다.
      const move = Math.abs(mid(band) - mid(prevBand))
      if (move < 1) continue
      out.push({
        area,
        from: `${prevBand[0]}-${prevBand[1]}%`,
        to: `${band[0]}-${band[1]}%`,
        reason: '',
        material: move >= MATERIAL.assetClassPp,
      })
    }

    if (alloc.duration && prevAlloc.duration && alloc.duration.stance !== prevAlloc.duration.stance) {
      out.push({
        area: '듀레이션',
        from: prevAlloc.duration.stance,
        to: alloc.duration.stance,
        reason: '',
        // 듀레이션 전환은 드물고 채권 sleeve 전체 성격을 바꾼다. 크기와 무관하게 강조.
        material: true,
      })
    }

    const sleeveDiff = (group: string, a?: SleeveSplit[], b?: SleeveSplit[], labels: Record<string, string> = {}) => {
      const nowW = byTicker(a)
      const prevW = byTicker(b)
      if (Object.keys(prevW).length === 0) return
      for (const ticker of new Set([...Object.keys(nowW), ...Object.keys(prevW)])) {
        const t = nowW[ticker] ?? 0
        const p = prevW[ticker] ?? 0
        // sleeve 내부 비중이라 3%p 미만은 구성 미세조정으로 보고 넘긴다.
        const move = Math.abs(t - p)
        if (move < 3) continue
        out.push({
          area: `${group} · ${labels[ticker] ?? ticker}`,
          from: `${round1(p)}%`,
          to: `${round1(t)}%`,
          reason: '',
          material: move >= MATERIAL.sleeveWeightPp,
        })
      }
    }
    sleeveDiff('채권', alloc.fixed_income, prevAlloc.fixed_income, BOND_LABELS)
    sleeveDiff('대체자산', alloc.alternatives, prevAlloc.alternatives, ALT_LABELS)
  }

  const prevMarket = new Map((prev.markets ?? []).map((m) => [m.code, m]))
  for (const m of now.markets ?? []) {
    const p = prevMarket.get(m.code)
    if (!p) continue
    // 스탠스 전환은 감지하되 그것만으로 강조하지 않는다 — 일간 실측에서
    // 시장-일의 52%가 스탠스를 바꿨다. 강조는 비중 이동 크기로 판단한다.
    const move = Math.abs(m.weight_pct - p.weight_pct)
    if (p.stance !== m.stance) {
      out.push({
        area: `주식 · ${MARKET_NAMES[m.code]}`,
        from: `${p.stance} ${p.weight_pct}%`,
        to: `${m.stance} ${m.weight_pct}%`,
        reason: '',
        material: move >= MATERIAL.marketWeightPp,
      })
    } else if (move >= 3) {
      out.push({
        area: `주식 · ${MARKET_NAMES[m.code]}`,
        from: `${p.weight_pct}%`,
        to: `${m.weight_pct}%`,
        reason: '',
        material: move >= MATERIAL.marketWeightPp,
      })
    }
  }

  const prevSector = new Map((prev.sectors ?? []).map((s) => [`${s.region ?? 'GLOBAL'}:${s.name}`, s]))
  for (const s of now.sectors ?? []) {
    const p = prevSector.get(`${s.region ?? 'GLOBAL'}:${s.name}`)
    if (p && p.stance !== s.stance) {
      out.push({
        area: `섹터 · ${s.region ?? 'GLOBAL'} ${s.name}`,
        from: p.stance,
        to: s.stance,
        reason: '',
        // 섹터는 비중이 아니라 스탠스만 있어 크기로 잴 수 없다. 강조하지 않는다.
        material: false,
      })
    }
  }

  if (prev.signal !== now.signal) {
    // 신호 전환은 이 시스템이 내는 가장 상위 결론이다. 항상 강조한다.
    out.push({ area: '종합 신호', from: prev.signal, to: now.signal, reason: '', material: true })
  }

  // fx_view 방향 전환. duration.stance와 같은 패턴 — 드물고 결과가 크므로 크기 무관 강조.
  const FX_AREA = { dxy: '달러(DXY)', usdkrw: '원달러' } as const
  if (now.fx_view && prev.fx_view) {
    for (const key of ['dxy', 'usdkrw'] as const) {
      const a = prev.fx_view[key]
      const b = now.fx_view[key]
      if (a.direction !== b.direction) {
        out.push({ area: FX_AREA[key], from: a.direction, to: b.direction, reason: '', material: true })
      }
    }
  }
  const scoreMove = Math.abs(now.equity_score - prev.equity_score)
  if (scoreMove >= 3) {
    out.push({
      area: '주식 점수',
      from: String(prev.equity_score),
      to: String(now.equity_score),
      reason: '',
      // 실측 일간 범위가 57-58(1점)이었다. 10점이면 국면 판정이 바뀐 수준이다.
      material: scoreMove >= 10,
    })
  }

  return out
}
