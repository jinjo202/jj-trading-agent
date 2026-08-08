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

/**
 * 섹터별 라운드로빈으로 상위 N을 뽑는다.
 *
 * 단순 점수 정렬은 한 섹터가 강한 날 상위 N을 그 섹터가 독식한다 —
 * 실측에서 OW 섹터가 3개(헬스케어·금융·기술)였는데 후보 24종목이 전부 반도체로 나왔다.
 * 그러면 "분산된 후보군에서 고른다"는 다음 단계의 전제가 조용히 깨진다.
 *
 * 섹터 안에서는 점수 순서를 그대로 지키고, 섹터를 번갈아 한 종목씩 채운다.
 * 종목이 모자란 섹터는 자기 차례에 자연히 빠지므로 남은 자리를 다른 섹터가 가져간다 —
 * "섹터당 최대 k개" 식의 고정 쿼터와 달리 재분배 로직을 따로 둘 필요가 없다.
 *
 * ponytail: 시장(KR/US)은 쿼터 대상이 아니다. 섹터×시장으로 쪼개면 버킷이 두 배가 되어
 * 종목이 적은 섹터가 굶는다. 시장 균형이 필요해지면 그때 버킷 키에 market을 더하면 된다.
 */
function pickRoundRobinBySector<T>(
  items: T[],
  sectorOf: (x: T) => string | null,
  rankOf: (x: T) => number,
  topN: number,
): T[] {
  const bySector = new Map<string, T[]>()
  for (const item of items) {
    // sector가 null인 종목끼리 같은 섹터인 것은 아니지만, 버킷을 나눌 근거도 없으므로 한 통에 담는다.
    const key = sectorOf(item) ?? '(미분류)'
    const arr = bySector.get(key)
    if (arr) arr.push(item)
    else bySector.set(key, [item])
  }
  for (const arr of bySector.values()) arr.sort((a, b) => rankOf(b) - rankOf(a))

  // 섹터 순서는 각 섹터 1위의 점수 순. 강한 섹터가 먼저 자리를 잡되 독식하지는 않는다.
  const buckets = [...bySector.values()].sort((a, b) => rankOf(b[0]) - rankOf(a[0]))

  const out: T[] = []
  for (let round = 0; out.length < topN; round++) {
    let pickedThisRound = false
    for (const bucket of buckets) {
      if (round >= bucket.length) continue
      out.push(bucket[round])
      pickedThisRound = true
      if (out.length === topN) break
    }
    if (!pickedThisRound) break // 모든 섹터 소진 — topN을 못 채워도 여기서 끝낸다
  }
  return out
}

export function rankByMomentum(pairs: Pair[], topN: number): Pair[] {
  return pickRoundRobinBySector(
    pairs.filter((p) => p.quote.yearChangePct !== null),
    (p) => p.row.sector,
    (p) => p.quote.yearChangePct as number,
    topN,
  )
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

  // 여기도 섹터 라운드로빈이다. 24종목 단계에서만 균형을 잡고 최종 12를 점수순으로 자르면
  // 강한 섹터가 다시 올라온다 — 실측에서 24단계 쿼터만 넣었더니 12종목 중 8개가 기술주였다.
  // CIO가 실제로 보는 것은 이 12종목이므로 분산 보장은 이 단계에 있어야 한다.
  return pickRoundRobinBySector(candidates, (c) => c.sector, (c) => c.score, topN)
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
