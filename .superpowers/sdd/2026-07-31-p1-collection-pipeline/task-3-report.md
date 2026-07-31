# Task 3 Report: Yahoo + Naver 소스 모듈

## What I implemented

Three new files, written verbatim per the brief (no adaptation needed — see divergence section):

- `src/sources/yahoo.ts` — `fetchDaily(symbol, days=420): Promise<Ohlcv[]>` via `yf.chart()`; `fetchFundamentals(symbol): Promise<Fundamentals>` via `yf.quoteSummary()` with `price`/`summaryProfile`/`defaultKeyStatistics`/`financialData` modules.
- `src/sources/naver.ts` — `fetchNaverDaily(code, days=420): Promise<Ohlcv[]>` and `fetchForeignRatio(code): Promise<number|null>`, both via a shared internal `fetchRows()` that hits `api.finance.naver.com/siseJson.naver`, sanitizes the single-quoted JS-literal response into JSON, and drops the header row.
- `src/sources/smoke.ts` — runnable script, no exports, imports `./fred.ts` (Task 4, does not exist yet — intentional per instructions).

## Live check output (Step 4, verbatim)

Command:
```
node --input-type=module -e "const y=await import('./src/sources/yahoo.ts');const n=await import('./src/sources/naver.ts');console.log('gspc',(await y.fetchDaily('^GSPC',30)).at(-1));console.log('aapl',await y.fetchFundamentals('AAPL'));console.log('naver',(await n.fetchNaverDaily('005930',30)).at(-1),await n.fetchForeignRatio('005930'))"
```

Output:
```
gspc {
  date: '2026-07-30',
  open: 7390.4501953125,
  high: 7448.75,
  low: 7370.97998046875,
  close: 7437.6298828125,
  volume: 3580758000
}
aapl {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  sector: 'Technology',
  price: 333.43,
  marketCap: 4897204862976,
  forwardPE: 34.52757,
  priceToBook: 45.926994,
  roe: 1.4147099,
  debtToEquity: 79.548,
  revenueGrowth: 0.166,
  operatingMargin: 0.32275
}
naver {
  date: '2026-07-31',
  open: 257000,
  high: 261500,
  low: 243000,
  close: 249500,
  volume: 32365502
} 46.53
```

All fields populated, non-null, plausible values. AAPL `sector: 'Technology'` as expected. Foreign ratio 46.53 (in 0-100 range) for Samsung.

Additional check (not in Step 4 but called out in task context — Korean `priceToBook` expected absent for some tickers):
```
node --input-type=module -e "const y=await import('./src/sources/yahoo.ts');console.log('005930.KS', await y.fetchFundamentals('005930.KS'))"
```
```
005930.KS {
  symbol: '005930.KS',
  name: 'Samsung Electronics Co., Ltd.',
  sector: 'Technology',
  price: 249500,
  marketCap: 1638357553643520,
  forwardPE: 3.7867334,
  priceToBook: null,
  roe: 0.18855,
  debtToEquity: 5.782,
  revenueGrowth: 0.692,
  operatingMargin: 0.42751
}
```
`priceToBook` came back `null` (Yahoo's `defaultKeyStatistics.priceToBook` is genuinely absent for this ticker) with no error and every other field populated — this is the expected behavior called out in the constraints, not a bug.

## Divergence between brief's assumed API and the real one

None. I inspected `node_modules/yahoo-finance2` (v4.0.0) type declarations before writing code:
- `new YahooFinance({ suppressNotices: ['yahooSurvey'] })` — `suppressNotices` option confirmed in `lib/options/options.d.ts`.
- `yf.chart(symbol, { period1, interval: '1d' })` with no `return` key resolves to the `ChartResultArray` overload (`res.quotes: ChartResultArrayQuote[]`), matching the brief's usage.
- `yf.quoteSummary(symbol, { modules: [...] })` field paths all confirmed present in `quoteSummary-iface.d.ts`: `price.longName`/`shortName`/`regularMarketPrice`/`marketCap`, `summaryProfile.sector`, `defaultKeyStatistics.forwardPE`/`priceToBook`, `financialData.returnOnEquity`/`debtToEquity`/`revenueGrowth`/`operatingMargins`.

Wrote the brief's code verbatim; no changes were necessary.

## `npm run typecheck` output

```
src/sources/smoke.ts(3,33): error TS2307: Cannot find module './fred.ts' or its corresponding type declarations.
```
Exactly the expected single error (exit code 2 from `tsc --noEmit`, one error, in `smoke.ts` only, for the not-yet-created `fred.ts`). No errors in `yahoo.ts` or `naver.ts`.

## `npm test` result

```
ℹ tests 13
ℹ suites 0
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
All 13 pre-existing tests (Task 1's indicator suite) still pass — untouched.

## Files changed

- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\sources\yahoo.ts` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\sources\naver.ts` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\sources\smoke.ts` (new)

## Self-review findings

- Completeness: `yahoo.ts` exports exactly `fetchDaily` and `fetchFundamentals` with the brief's signatures; `naver.ts` exports exactly `fetchNaverDaily` and `fetchForeignRatio`; `smoke.ts` has no exports. No extra exports anywhere.
- Correctness: date strings are `YYYY-MM-DD` in both modules (Yahoo via `.toISOString().slice(0,10)`, Naver via manual slice of `YYYYMMDD`). Naver row mapping: `r[1]`→open(시가), `r[2]`→high(고가), `r[3]`→low(저가), `r[4]`→close(종가), `r[5]`→volume(거래량) — matches the stated row order (날짜,시가,고가,저가,종가,거래량,외국인소진율), 고가 before 저가 confirmed correct. Missing values surface as `null` via the `num()` helper in `yahoo.ts` and the `typeof v === 'number' && Number.isFinite(v)` check in `fetchForeignRatio` — verified live with Samsung's `priceToBook: null`.
- Discipline: no caching layer, no retry framework, no DataSource abstraction, no speculative helpers. Only the internal (non-exported) `fetchRows` helper in `naver.ts`, which the brief itself specifies.
- Evidence: live network output captured above, not asserted.

## Issues or concerns

None. Everything worked on the first pass with no adaptation required.

## Fix round 1

**Finding (Important, ruled by coordinator):** `src/sources/yahoo.ts:19` used `volume: q.volume ?? 0`, which substitutes `0` for a genuinely missing volume — violating the design doc's "결측을 0이나 추정치로 채우지 않는다" rule and the brief's own Global Constraints. `ChartResultArrayQuote.volume` is typed `number | null` in `yahoo-finance2`, so this was a real gap, not a hypothetical.

**What changed:**
1. `src/types.ts` — widened `Ohlcv.volume` from `number` to `number | null`.
2. `src/sources/yahoo.ts` — changed `volume: q.volume ?? 0` to `volume: q.volume ?? null`.
3. `src/sources/naver.ts` — no change. `Row`'s 6th element (`r[5]`, 거래량) is typed `number` and is always numeric in the Naver payload, which is assignable to the widened `number | null` field without modification. Confirmed via typecheck below.

**Checks run:**

`npm run typecheck`:
```
src/sources/smoke.ts(3,33): error TS2307: Cannot find module './fred.ts' or its corresponding type declarations.
```
Same single expected error, nothing new — confirms `naver.ts` and the rest of the codebase (including `db.ts`, which consumes `Ohlcv`) still typecheck clean against the widened field.

`npm test`:
```
ℹ tests 13
ℹ pass 13
ℹ fail 0
```
All 13 Task 1 tests still pass (its test helper's `volume: 1000` stays valid under `number | null`).

Live re-check:
```
node --input-type=module -e "const y=await import('./src/sources/yahoo.ts');const n=await import('./src/sources/naver.ts');console.log('gspc',(await y.fetchDaily('^GSPC',30)).at(-1));console.log('naver',(await n.fetchNaverDaily('005930',30)).at(-1))"
```
```
gspc {
  date: '2026-07-30',
  open: 7390.4501953125,
  high: 7448.75,
  low: 7370.97998046875,
  close: 7437.6298828125,
  volume: 3580758000
}
naver {
  date: '2026-07-31',
  open: 257000,
  high: 261500,
  low: 243000,
  close: 250500,
  volume: 32672398
}
```
Both bars well-formed with real numeric volumes (neither source happened to return a genuinely missing volume in this run, but the code path no longer masks one as `0` if it occurs).

**Commit:** `214108d` fix: never fill missing yahoo volume with 0, widen Ohlcv.volume to nullable
