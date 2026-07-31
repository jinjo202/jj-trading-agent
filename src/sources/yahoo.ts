import YahooFinance from 'yahoo-finance2'
import type { Fundamentals, Ohlcv } from '../types.ts'

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
