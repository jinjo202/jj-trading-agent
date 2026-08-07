import YahooFinance from 'yahoo-finance2'
import type { Fundamentals, Ohlcv, RegionValuation } from '../types.ts'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export async function fetchDaily(symbol: string, days = 420): Promise<Ohlcv[]> {
  const period1 = new Date(Date.now() - days * 24 * 3600 * 1000)
  const res = await yf.chart(symbol, { period1, interval: '1d' })
  return res.quotes
    .filter((q) => q.close !== null && q.open !== null && q.high !== null && q.low !== null)
    .map((q) => ({
      date: new Date(q.date).toISOString().slice(0, 10),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: q.volume ?? null,
    }))
}

/**
 * 지역 ETF의 밸류에이션. 지역 간 "비싼가 싼가"를 비교하는 유일한 실측 근거다.
 *
 * Yahoo의 `topHoldings.equityHoldings.*`는 비율이 아니라 **역수(수익률)**로 온다 —
 * SPY가 0.03976으로 오는데 같은 응답의 `summaryDetail.trailingPE`는 25.99다(1/0.03976 = 25.15).
 * EWJ에서도 0.0524 vs 20.02로 재확인했다. 그래서 PER은 직접 값이 있는 summaryDetail을 쓰고,
 * summaryDetail에 없는 PBR만 역수를 뒤집어 쓴다.
 * 1 미만이면 역수로 보고 뒤집는 가드를 둔다 — Yahoo가 표현을 바꿔도 조용히 틀리지 않게.
 */
export async function fetchRegionValuation(symbol: string): Promise<RegionValuation> {
  const s = await yf.quoteSummary(symbol, { modules: ['topHoldings', 'summaryDetail'] })
  const eq = s.topHoldings?.equityHoldings
  const asRatio = (v: unknown): number | null => {
    const n = num(v)
    if (n === null || n <= 0) return null
    return n < 1 ? 1 / n : n
  }
  return {
    symbol,
    per: num(s.summaryDetail?.trailingPE) ?? asRatio(eq?.priceToEarnings),
    pbr: asRatio(eq?.priceToBook),
    psr: asRatio(eq?.priceToSales),
  }
}

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const s = await yf.quoteSummary(symbol, {
    modules: ['price', 'summaryProfile', 'defaultKeyStatistics', 'financialData'],
  })
  return {
    symbol,
    name: s.price?.longName ?? s.price?.shortName ?? null,
    sector: s.summaryProfile?.sector ?? null,
    price: num(s.price?.regularMarketPrice),
    marketCap: num(s.price?.marketCap),
    forwardPE: num(s.defaultKeyStatistics?.forwardPE),
    priceToBook: num(s.defaultKeyStatistics?.priceToBook),
    roe: num(s.financialData?.returnOnEquity),
    debtToEquity: num(s.financialData?.debtToEquity),
    revenueGrowth: num(s.financialData?.revenueGrowth),
    operatingMargin: num(s.financialData?.operatingMargins),
  }
}
