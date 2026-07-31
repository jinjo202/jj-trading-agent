import { pctChange, pctRank } from './indicators.ts'
import type { Fundamentals, Ohlcv, CompanyReport } from './types.ts'

export type CompanySnapshot = CompanyReport['snapshot']

// 스냅샷을 만들 수 없으면 null을 반환한다. 0이나 추정치로 채우지 않는다 —
// LLM이 여기 없는 숫자를 지어내는 것보다 그 종목의 리포트를 하루 건너뛰는 편이 낫다.
export function buildSnapshot(
  bars: Ohlcv[],
  funds: Fundamentals,
  sectorForwardPEs: (number | null)[],
): CompanySnapshot | null {
  if (bars.length === 0 || funds.marketCap === null) return null

  const closes = bars.map((b) => b.close)
  const change_1d = pctChange(closes, 1)
  const change_1m = pctChange(closes, 21)
  const change_12m = pctChange(closes, 252)
  if (change_1d === null || change_1m === null || change_12m === null) return null

  const w = bars.slice(-252)
  const high = Math.max(...w.map((b) => b.high))
  const low = Math.min(...w.map((b) => b.low))
  const position = high === low ? 0.5 : (bars.at(-1)!.close - low) / (high - low)

  return {
    price: bars.at(-1)!.close,
    change_1d,
    change_1m,
    change_12m,
    market_cap: funds.marketCap,
    per: funds.forwardPE,
    pbr: funds.priceToBook,
    roe: funds.roe,
    per_pctile_in_sector:
      funds.forwardPE === null ? null : pctRank(sectorForwardPEs, funds.forwardPE),
    debt_to_equity: funds.debtToEquity,
    week52: { high, low, position },
    // 분기 실적 시계열은 quoteSummary의 별도 모듈이 필요하다. P2 범위 밖 —
    // 빈 배열로 두고 지어내지 않는다. 스키마는 빈 배열을 허용한다.
    revenue_trend: [],
    op_margin_trend: [],
  }
}
