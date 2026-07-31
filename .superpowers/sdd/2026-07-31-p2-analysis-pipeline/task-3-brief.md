### Task 3: 1단 결정론적 스크리너

**Files:**
- Create: `src/screener.ts`
- Test: `src/screener.test.ts`

**Interfaces:**
- Consumes: `types.ts`의 `UniverseRow`, `Fundamentals`; `sources/yahoo.ts`의 `fetchFundamentals`; `indicators.ts`의 `zscore`
- Produces:
  - `types.ts`에 `export type QuoteRow = { symbol: string; price: number | null; marketCap: number | null; avgVolume3m: number | null; yearChangePct: number | null; currency: string | null }`
  - `types.ts`에 `export type Candidate = { ticker: string; name: string; market: 'KR' | 'US'; sector: string | null; turnover: number | null; yearChangePct: number | null; roe: number | null; operatingMargin: number | null; forwardPE: number | null; priceToBook: number | null; score: number }`
  - `screener.ts`: `fetchQuotes(symbols: string[]): Promise<QuoteRow[]>`, `filterByLiquidity(rows: UniverseRow[], quotes: QuoteRow[], keepFraction?: number): { row: UniverseRow; quote: QuoteRow }[]`, `rankByMomentum(pairs, topN): typeof pairs`, `scoreCandidates(pairs, funds: Map<string, Fundamentals>, topN?: number): Candidate[]`, `computeTech(bars: Ohlcv[]): CandidateTech`

- [ ] **Step 1: 타입 추가**

`src/types.ts` 끝에:

```ts
export type QuoteRow = {
  symbol: string
  price: number | null
  marketCap: number | null
  avgVolume3m: number | null
  yearChangePct: number | null
  currency: string | null
}

export type Candidate = {
  ticker: string
  name: string
  market: 'KR' | 'US'
  sector: string | null
  turnover: number | null        // price * avgVolume3m, 현지통화
  yearChangePct: number | null
  roe: number | null
  operatingMargin: number | null
  forwardPE: number | null
  priceToBook: number | null
  score: number                  // 모멘텀 z + 퀄리티 z 합
  tech: CandidateTech | null     // 후보 확정 후 일봉으로 계산해 채운다
}

export type CandidateTech = {
  distSma200: number | null
  distSma60: number | null
  rsi14: number | null
  macdHist: number | null
  week52Position: number | null
  realizedVol20: number | null
}
```

`tech`가 있는 이유: 최종 `DailyVerdict.picks[].scores.tech`를 LLM이 채워야 하는데,
번들에 종목 단위 기술적 지표가 없으면 그 숫자를 **지어내는 수밖에 없다**.
"숫자는 코드가 계산한다"는 원칙이 깨지는 지점이라 후보 12종목에 한해 코드가 계산해 넣는다.

- [ ] **Step 2: 실패하는 테스트 작성**

핵심 위험은 **통화 혼동**이다. KRW 거래대금은 USD보다 자릿수가 크므로 두 시장을 한 줄에 세워 자르면
한국 종목이 전부 살아남거나 전부 죽는다. 필터는 반드시 시장별로 따로 돌아야 한다.

`src/screener.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTech, filterByLiquidity, rankByMomentum, scoreCandidates } from './screener.ts'
import type { Fundamentals, QuoteRow, UniverseRow } from './types.ts'

const u = (ticker: string, market: 'KR' | 'US'): UniverseRow => ({
  ticker, market, name: ticker, sector: 'Technology', active: true,
})

const q = (
  symbol: string, price: number, vol: number, chg: number, currency: string,
): QuoteRow => ({
  symbol, price, marketCap: price * 1e6, avgVolume3m: vol,
  yearChangePct: chg, currency,
})

const f = (roe: number | null, margin: number | null): Fundamentals => ({
  symbol: 'x', name: null, sector: null, price: null, marketCap: null,
  forwardPE: 10, priceToBook: 1, roe, debtToEquity: null,
  revenueGrowth: null, operatingMargin: margin,
})

test('유동성 필터는 시장별로 따로 자른다', () => {
  // KRW 거래대금이 USD보다 압도적으로 크다. 한 줄로 세우면 US가 전멸한다.
  const rows = [u('A.KS', 'KR'), u('B.KS', 'KR'), u('C', 'US'), u('D', 'US')]
  const quotes = [
    q('A.KS', 100000, 1_000_000, 10, 'KRW'),  // 1e11
    q('B.KS', 50000, 100_000, 10, 'KRW'),     // 5e9
    q('C', 300, 50_000_000, 10, 'USD'),       // 1.5e10
    q('D', 20, 100_000, 10, 'USD'),           // 2e6
  ]
  const kept = filterByLiquidity(rows, quotes, 0.5).map((p) => p.row.ticker)
  assert.deepEqual(kept.sort(), ['A.KS', 'C'], '시장별 상위 절반이 남아야 한다')
})

test('유동성 필터는 가격이나 거래량이 null이면 제외한다', () => {
  const rows = [u('A', 'US'), u('B', 'US')]
  const quotes = [
    q('A', 10, 1000, 5, 'USD'),
    { ...q('B', 10, 1000, 5, 'USD'), avgVolume3m: null },
  ]
  assert.deepEqual(filterByLiquidity(rows, quotes, 1).map((p) => p.row.ticker), ['A'])
})

test('유동성 필터는 시세가 아예 없는 종목을 조용히 버리지 않고 제외한다', () => {
  const kept = filterByLiquidity([u('A', 'US'), u('GHOST', 'US')], [q('A', 10, 1000, 5, 'USD')], 1)
  assert.deepEqual(kept.map((p) => p.row.ticker), ['A'])
})

test('모멘텀 랭킹은 52주 수익률 내림차순 상위 N', () => {
  const rows = [u('A', 'US'), u('B', 'US'), u('C', 'US')]
  const quotes = [q('A', 10, 1e6, 5, 'USD'), q('B', 10, 1e6, 90, 'USD'), q('C', 10, 1e6, 40, 'USD')]
  const pairs = filterByLiquidity(rows, quotes, 1)
  assert.deepEqual(rankByMomentum(pairs, 2).map((p) => p.row.ticker), ['B', 'C'])
})

test('모멘텀이 null인 종목은 랭킹에서 빠진다', () => {
  const rows = [u('A', 'US'), u('B', 'US')]
  const quotes = [{ ...q('A', 10, 1e6, 5, 'USD'), yearChangePct: null }, q('B', 10, 1e6, 1, 'USD')]
  const pairs = filterByLiquidity(rows, quotes, 1)
  assert.deepEqual(rankByMomentum(pairs, 5).map((p) => p.row.ticker), ['B'])
})

test('스코어는 모멘텀과 퀄리티를 합치고, 퀄리티 결측은 그 항만 0으로 둔다', () => {
  const rows = [u('A', 'US'), u('B', 'US'), u('C', 'US')]
  const quotes = [q('A', 10, 1e6, 10, 'USD'), q('B', 10, 1e6, 50, 'USD'), q('C', 10, 1e6, 90, 'USD')]
  const pairs = rankByMomentum(filterByLiquidity(rows, quotes, 1), 3)
  const funds = new Map<string, Fundamentals>([
    ['A', f(0.30, 0.30)],
    ['B', f(0.05, 0.05)],
    ['C', f(null, null)],   // 결측: 퀄리티 항 없이 모멘텀만으로 평가
  ])
  const out = scoreCandidates(pairs, funds, 3)
  assert.equal(out.length, 3)
  assert.ok(out[0].score >= out[1].score && out[1].score >= out[2].score, '점수 내림차순')
  const c = out.find((x) => x.ticker === 'C')!
  assert.equal(c.roe, null, '결측은 null로 남고 0으로 채우지 않는다')
  assert.ok(Number.isFinite(c.score), '퀄리티 결측이 점수를 NaN으로 만들지 않는다')
})

test('scoreCandidates는 turnover를 현지통화 그대로 싣고 tech는 아직 null', () => {
  const pairs = filterByLiquidity([u('A.KS', 'KR')], [q('A.KS', 100000, 1000, 10, 'KRW')], 1)
  const out = scoreCandidates(pairs, new Map(), 1)
  assert.equal(out[0].turnover, 100000 * 1000)
  assert.equal(out[0].tech, null, 'tech는 후보 확정 뒤 일봉으로 따로 채운다')
})

test('computeTech는 상승 추세에서 이동평균 위, RSI 100', () => {
  // high/low를 종가와 같게 둬야 52주 밴드가 종가 범위와 일치한다 (P1에서 같은 함정을 겪었다)
  const bars = Array.from({ length: 300 }, (_, i) => {
    const c = 100 + i * 0.1
    return { date: `d${i}`, open: c, high: c, low: c, close: c, volume: 1000 }
  })
  const t = computeTech(bars)
  assert.ok(t.distSma200! > 0)
  assert.equal(t.rsi14, 100)
  assert.equal(t.week52Position, 1)
})

test('computeTech는 데이터가 짧으면 각 항을 null로 둔다', () => {
  const bars = Array.from({ length: 5 }, (_, i) => ({
    date: `d${i}`, open: 100, high: 100, low: 100, close: 100, volume: 1000,
  }))
  const t = computeTech(bars)
  assert.equal(t.distSma200, null)
  assert.equal(t.week52Position, null)
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './screener.ts'`

- [ ] **Step 4: 구현**

`src/screener.ts`:

```ts
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
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 36 + 스크리너 9 = 45개

- [ ] **Step 6: 라이브 배치 시세 확인**

```bash
node --env-file=.env --input-type=module -e "const s=await import('./src/screener.ts');const d=await import('./src/db.ts');const u=await d.readUniverse(['Technology']);console.log('universe tech',u.length);const t0=Date.now();const q=await s.fetchQuotes(u.map(r=>r.ticker));console.log('quotes',q.length,'in',Date.now()-t0,'ms');const kept=s.filterByLiquidity(u,q,0.5);console.log('after liquidity',kept.length);console.log(s.rankByMomentum(kept,5).map(p=>[p.row.ticker,p.quote.yearChangePct]))"
```

Expected: Technology 섹터 유니버스 수, 같은 수의 시세, 절반으로 줄어든 후보, 모멘텀 상위 5의 티커와 52주 수익률.
시세 개수가 유니버스보다 크게 적으면 어떤 티커가 빠졌는지 확인하고 보고한다.

- [ ] **Step 7: 커밋**

```bash
git add src/types.ts src/screener.ts src/screener.test.ts
git commit -m "feat: add deterministic stage-1 screener with per-market liquidity filter"
```

---

