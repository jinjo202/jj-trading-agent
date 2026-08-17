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

/**
 * ETF의 분배수익률(연율 비율). 채권·대체자산 배분에서 캐리의 크기다.
 *
 * **만기수익률(YTM)이 아니다.** Yahoo의 `summaryDetail.yield`는 최근 12개월 분배 기준이라
 * (1) TIPS는 물가연동 원금상승분이 섞여 실질금리와 전혀 다르게 나오고
 * (2) 가격이 급변한 뒤에는 현재 매수자가 받을 수익률과 벌어진다.
 * 그래도 IG 4.66% 대 HY 5.94%처럼 **같은 채권끼리의 상대 비교**에는 쓸 수 있어서 싣는다.
 */
export async function fetchDistYield(symbol: string): Promise<number | null> {
  const s = await yf.quoteSummary(symbol, { modules: ['summaryDetail'] })
  return num(s.summaryDetail?.yield)
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
