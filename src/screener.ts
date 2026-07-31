import YahooFinance from 'yahoo-finance2'
import {
  distFromSma, macd, realizedVol, rsi, week52Position, zscore,
} from './indicators.ts'
import type {
  Candidate, CandidateTech, Fundamentals, Ohlcv, QuoteRow, UniverseRow,
} from './types.ts'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export type Pair = { row: UniverseRow; quote: QuoteRow }

// quote()는 배치 호출이다. 700종목이 50개씩 14번이면 끝나므로
// 종목당 차트 호출(수백 회)을 피할 수 있다.
export async function fetchQuotes(symbols: string[]): Promise<QuoteRow[]> {
  const out: QuoteRow[] = []
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50)
    try {
      const res = await yf.quote(chunk)
      for (const r of res) {
        out.push({
          symbol: r.symbol,
          price: num(r.regularMarketPrice),
          marketCap: num(r.marketCap),
          avgVolume3m: num(r.averageDailyVolume3Month),
          yearChangePct: num(r.fiftyTwoWeekChangePercent),
          currency: r.currency ?? null,
        })
      }
    } catch (e) {
      console.error(`시세 배치 실패 (${chunk[0]}...): ${(e as Error).message}`)
    }
  }
  return out
}

// 거래대금은 현지통화라 KRW와 USD를 같은 줄에 세울 수 없다. 반드시 시장별로 자른다.
export function filterByLiquidity(
  rows: UniverseRow[],
  quotes: QuoteRow[],
  keepFraction = 0.5,
): Pair[] {
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]))
  const withTurnover: { pair: Pair; turnover: number }[] = []
  for (const row of rows) {
    const quote = bySymbol.get(row.ticker)
    if (!quote || quote.price === null || quote.avgVolume3m === null) continue
    withTurnover.push({ pair: { row, quote }, turnover: quote.price * quote.avgVolume3m })
  }

  const kept: Pair[] = []
  for (const market of ['KR', 'US'] as const) {
    const inMarket = withTurnover
      .filter((x) => x.pair.row.market === market)
      .sort((a, b) => b.turnover - a.turnover)
    const n = Math.max(1, Math.ceil(inMarket.length * keepFraction))
    kept.push(...inMarket.slice(0, n).map((x) => x.pair))
  }
  return kept
}

export function rankByMomentum(pairs: Pair[], topN: number): Pair[] {
  return pairs
    .filter((p) => p.quote.yearChangePct !== null)
    .sort((a, b) => (b.quote.yearChangePct as number) - (a.quote.yearChangePct as number))
    .slice(0, topN)
}

// 모멘텀 z + ROE z + 영업이익률 z. 결측 항은 그 항만 0으로 두고 나머지로 평가한다.
// 결측을 평균값으로 대체하지 않는 것은 설계서의 null 정책과 같은 이유다.
export function scoreCandidates(
  pairs: Pair[],
  funds: Map<string, Fundamentals>,
  topN = 12,
): Candidate[] {
  const moms = pairs.map((p) => p.quote.yearChangePct)
  const roes = pairs.map((p) => funds.get(p.row.ticker)?.roe ?? null)
  const margins = pairs.map((p) => funds.get(p.row.ticker)?.operatingMargin ?? null)

  const candidates = pairs.map((p) => {
    const f = funds.get(p.row.ticker)
    const parts = [
      p.quote.yearChangePct === null ? null : zscore(moms, p.quote.yearChangePct),
      f?.roe == null ? null : zscore(roes, f.roe),
      f?.operatingMargin == null ? null : zscore(margins, f.operatingMargin),
    ]
    const score = parts.reduce<number>((a, z) => a + (z ?? 0), 0)
    return {
      ticker: p.row.ticker,
      name: p.row.name,
      market: p.row.market,
      sector: p.row.sector,
      turnover:
        p.quote.price === null || p.quote.avgVolume3m === null
          ? null
          : p.quote.price * p.quote.avgVolume3m,
      yearChangePct: p.quote.yearChangePct,
      roe: f?.roe ?? null,
      operatingMargin: f?.operatingMargin ?? null,
      forwardPE: f?.forwardPE ?? null,
      priceToBook: f?.priceToBook ?? null,
      score,
      tech: null,
    }
  })

  return candidates.sort((a, b) => b.score - a.score).slice(0, topN)
}

// 최종 후보 12종목에만 쓴다. 종목 단위 기술적 지표를 코드가 계산해 두어야
// synthesizer가 picks[].scores.tech를 지어내지 않는다.
export function computeTech(bars: Ohlcv[]): CandidateTech {
  const closes = bars.map((b) => b.close)
  const m = macd(closes)
  return {
    distSma200: distFromSma(closes, 200),
    distSma60: distFromSma(closes, 60),
    rsi14: rsi(closes, 14),
    macdHist: m ? m.hist : null,
    week52Position: week52Position(bars),
    realizedVol20: realizedVol(closes, 20),
  }
}
