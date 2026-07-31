# Task 5 Report: 수집 오케스트레이션 + feature 계산 + CLI

## What I implemented

- `src/types.ts` — appended `MacroBlock`, `AssetFeature`, `FeatureSet` verbatim from the brief (Step 1). Existing types untouched.
- `src/collect.test.ts` — new, verbatim from the brief (Step 2): 5 tests for `buildFeatures`.
- `src/collect.ts` — new (Step 4): `SYMBOLS`, `SECTOR_ETFS`, `collectPrices`, `collectMacro`, `buildFeatures`, `runCollect`. Dropped `sma` from the `indicators.ts` import since it's unused in this file (per the pre-resolved ambiguity note).
- `src/bin/collect.ts` — new (Step 6): CLI entry calling `runCollect()`, exits 1 on error.

All signatures match the brief's Interfaces block exactly.

## TDD Evidence

**RED** — `npm test` before `collect.ts` existed:

```
node:internal/modules/esm/resolve:271
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\user\Desktop\jj-coding-projects\trading agent\src\collect.ts' imported from ...\src\collect.test.ts
...
✖ src\collect.test.ts (485.4488ms)
ℹ tests 14
ℹ pass 13
ℹ fail 1
```

Expected failure — module didn't exist yet. Confirmed correct reason (not a logic error).

**GREEN (partial)** — after implementing `collect.ts`, `npm test`:

```
ℹ tests 18
ℹ pass 17
ℹ fail 1
```

17 of 18 pass. One test does **not** pass, and I did not force it green — see "Blocking issue" below.

## Blocking issue found: test-fixture defect in `collect.test.ts` (same class as the earlier `momentum12_1` off-by-one)

Test `'상승 추세 자산은 이동평균 위, RSI 100'` asserts `a.week52Position === 1` (strict equality) for the `series(100, 0.1)` fixture. Actual value from the already-implemented, already-tested `week52Position` in `src/indicators.ts` (unchanged by this task, verified correct via `indicators.test.ts`'s own `week52Position: 고가 = 1, 저가 = 0` test using `high=low=close` bars) is:

```
0.96309963099631
```

Root cause: `series()` builds bars with `high: c + 1, low: c - 1` (fixed ±1 padding around a linearly-rising close). `week52Position` is `(lastClose - windowLow) / (windowHigh - windowLow)` over the trailing 252-bar window. With this padding, `windowHigh - windowLow = (Δclose over window) + 2` and `lastClose - windowLow = (Δclose over window) + 1`, so the ratio is always `< 1` and only approaches 1 as the price range grows much larger than the ±1 padding — it can never equal exactly 1 for this fixture (Δclose over the 252-bar window is only 25.1). I verified this numerically:

```js
window high 130.9
window low  103.8
last close  129.9
(129.9 - 103.8) / (130.9 - 103.8) = 0.96309963099631
```

This is not a floating-point-noise mismatch (which would be ~1e-9); it's a ~3.7% real discrepancy caused by the fixture's padding choice.

Per my task instructions ("if a test's expected value doesn't match what a correct implementation produces, stop and ask — never bend the expected value to match your output"), I did not change the assertion, and I did not change the `series()` fixture either (changing the fixture to route around a wrong-looking assertion is the same class of self-resolution the instruction told me not to do unilaterally). I left the test as specified in the brief and it is currently failing.

**Two candidate fixes, either of which I can apply immediately once approved:**
- **A (my recommendation — root-cause fix in test data):** change `series()`'s bars to `high: c, low: c` (matching the convention already used in `indicators.test.ts`'s own `week52Position` test), so the last bar's close equals the window max exactly. This doesn't touch any other assertion in the file — `distSma200`, `rsi14`, and the VIX-term test only use `close`, not `high`/`low`.
- **B:** change the assertion to the fixture's actual value, e.g. `assert.ok(Math.abs(a.week52Position! - 0.96309963099631) < 1e-9)`.

I did not apply either without confirmation. **This is the reason `npm test` is not fully green right now** — everything else in the suite passes.

## Substitute live check (real network, no DB — per the missing-credentials constraint)

Command run:
```bash
node --env-file=.env --input-type=module -e "const c=await import('./src/collect.ts');const p=await c.collectPrices();const m=await c.collectMacro();const f=c.buildFeatures(p,m);console.log('symbols',Object.keys(p).length);console.log('missing',f.missing);console.log('KS11',f.assets['^KS11']);console.log('GSPC',f.assets['^GSPC']);console.log('regime',f.regime);console.log('relative',JSON.stringify(f.relative));console.log('macro',f.macro)"
```

Output (verbatim):
```
FRED_API_KEY 없음 — 매크로 블록을 건너뜁니다
symbols 23
missing [ 'fred', 'naver:foreignRatio' ]
KS11 {
  symbol: '^KS11',
  close: 6362.419921875,
  distSma20: -0.07675577756992291,
  distSma60: -0.17616871786051902,
  distSma200: 0.10977803509247752,
  rsi14: 42.39441267503381,
  macdHist: -86.05813858274064,
  atr14: 545.1968014944592,
  realizedVol20: 0.9187169591020977,
  mom12_1: 1.6045256152488045,
  week52Position: 0.5206126542670992,
  ret1m: -0.23375820269627545,
  ret3m: -0.041951401567362656
}
GSPC {
  symbol: '^GSPC',
  close: 7437.6298828125,
  distSma20: -0.005774176330729297,
  distSma60: -0.002487419516309153,
  distSma200: 0.05950173656723812,
  rsi14: 48.92641074006539,
  macdHist: -15.981646388951244,
  atr14: 87.64073036697583,
  realizedVol20: 0.11896388850930487,
  mom12_1: 0.1771346449643576,
  week52Position: 0.8698560409207445,
  ret1m: -0.00823136662250279,
  ret3m: 0.04227603602084673
}
regime {
  vixLevel: 17.09000015258789,
  vixTerm: 0.8764102642352765,
  breadth: 0.028813556797132378,
  usdkrw: 1437.780029296875,
  usdkrwChange20d: -0.06766613401952914
}
relative {"krVsUs3m":0.00477588631778203,"sectors":[{"etf":"XLK","rel3m":0.062141740699903636},{"etf":"XLF","rel3m":0.055528608933142376},{"etf":"XLE","rel3m":-0.04350009747960404},{"etf":"XLV","rel3m":0.10246316762994834},{"etf":"XLI","rel3m":0.0074709824130576585},{"etf":"XLY","rel3m":-0.08040051181461882},{"etf":"XLP","rel3m":-0.01156169487105596},{"etf":"XLU","rel3m":-0.06464352172240662},{"etf":"XLB","rel3m":-0.02897045962893463},{"etf":"XLRE","rel3m":-0.004275771087856706},{"etf":"XLC","rel3m":-0.11786287290648823}]}
macro {
  available: false,
  dgs2: null,
  dgs10: null,
  dgs3mo: null,
  cpiYoY: null,
  coreCpiYoY: null,
  unrate: null,
  hySpread: null,
  curve2s10s: null,
  curve3m10y: null
}
```

Assessment against expectations:
- **23 symbols fetched** (12 `SYMBOLS` + 11 `SECTOR_ETFS`) — matches expected count exactly.
- **`missing` contains only `fred` and `naver:foreignRatio`** — no price symbol landed in `missing`. Every price symbol fetched successfully (including `^KS11`/`^KQ11` via direct Yahoo fetch — the Naver fallback path was not exercised because Yahoo succeeded for both).
- **`^KS11` close ≈ 6362, `^GSPC` close ≈ 7437** — plausible real index levels.
- **RSI/SMA-distance values are plausible** (e.g. KOSPI RSI 42.4, distSma200 +11%, S&P RSI 48.9, distSma200 +5.9%).
- **`macro` block is all `null` with `available: false`** — correct, since `FRED_API_KEY` is empty; `collectMacro()` correctly short-circuited and logged `FRED_API_KEY 없음 — 매크로 블록을 건너뜁니다` to stderr (not a credential value).

This confirms the entire fetch path (Yahoo for all 23 symbols, macro-key gating, feature computation) works correctly end-to-end over the real network.

## npm test / npm run typecheck results

`npm run typecheck`: clean, no output, exit 0.

`npm test`: 17/18 pass, 1 fail — the `week52Position` fixture-defect test described above. All other 17 tests (13 indicator tests + 4 other `collect.test.ts` tests) pass.

## Files changed

- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\types.ts` (appended)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\collect.ts` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\collect.test.ts` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\bin\collect.ts` (new)

No other files touched. No commit made yet — holding the Step 10 commit until the test-fixture question above is resolved, since "npm test all green" is a stated precondition for that step and for the P1 completion criteria.

## Self-review

- **Completeness:** all exports match the brief's Interfaces block (`SYMBOLS`, `SECTOR_ETFS`, `collectPrices`, `collectMacro`, `buildFeatures`, `runCollect`), with the exact signatures specified (`buildFeatures(prices, macro, date = kstDate(), foreignRatioSamsung = null)`). All 5 `buildFeatures` tests are present verbatim from the brief.
- **Correctness:** the breadth ratio aligns `RSP` and `SPY` by their tails (`n = Math.min(rsp.length, spy.length)`, indexed from `.length - n`) before dividing, matching the brief. `missing` accumulates every expected symbol (all `SYMBOLS` + `SECTOR_ETFS` keys) that has no bars, plus `'fred'` when macro is unavailable, plus `'naver:foreignRatio'` when the ratio is `null`. Every `await` inside `collectPrices`, `collectMacro`, and `runCollect`'s foreign-ratio fetch is wrapped in `try/catch` so a single source failure can't crash the run; only `buildFeatures` (pure, no I/O) and the final two `upsertSnapshot` calls in `runCollect` are unguarded by task design (a DB failure there is meant to propagate to the CLI's top-level catch, matching `src/bin/collect.ts`).
- **Discipline:** no speculative helpers added beyond the brief's shape; the 260-bar trim happens exactly where the brief puts it, in `runCollect` right before the `prices` snapshot write; `sma` dropped from the import list since unused, per the pre-resolved ambiguity note.
- **Testing:** tests assert real computed values (no network) except for the one fixture-defect test discussed above. Test output otherwise pristine (17/18 pass, no unexpected errors, no console noise beyond the intentional macro-skip log line during the live check).

## Deviations from brief (controller-approved)

The coordinator confirmed the reading above and approved Option A exactly as proposed — the third defect this plan's own code has produced (after the earlier `momentum12_1` off-by-one). Applied to `src/collect.test.ts`'s `series()` helper:

```diff
-    return { date: `d${i}`, open: c, high: c + 1, low: c - 1, close: c, volume: 1000 }
+    return { date: `d${i}`, open: c, high: c, low: c, close: c, volume: 1000 }
```

Rationale (as recorded by the coordinator): with `high: c+1, low: c-1` the 52-week band is wider than the close range on both ends, so a rising close can only approach the top of the band asymptotically, never reach it. With `high: c, low: c` the band equals the close range exactly, so the final bar of a monotonically rising series sits at the 52-week high and `week52Position` is exactly 1 — matching what the assertion was written to express, and matching `indicators.test.ts`'s own `bar()` convention (high/low default to close).

No change to the assertion itself, to `src/indicators.ts`, or to `src/collect.ts`.

Verified the other four `buildFeatures` tests still hold after narrowing the fixture, rather than assuming:
- `distSma200 > 0`, `rsi14 === 100` — depend only on `close`, unaffected by the `high`/`low` change. Confirmed passing.
- `vixTerm` test (`series(20, 0)` / `series(25, 0)`) — `vixTerm` is computed from `lastOf('^VIX')`/`lastOf('^VIX3M')`, which read `close` only. Confirmed still `20/25 = 0.8`.

Full suite after the fix: **18/18 pass** (`npm test` output below). `npm run typecheck` clean. Committed as `5b7b810 feat: add collection orchestration, feature builder and CLI` (`src/types.ts`, `src/collect.ts`, `src/collect.test.ts`, `src/bin/collect.ts` — the four files this task owns; unrelated working-tree changes to `.claude/settings.local.json` and the plan doc were left untouched).

```
ℹ tests 18
ℹ suites 0
ℹ pass 18
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 588.3494
```

## Issues or concerns

1. ~~The `week52Position` test-fixture defect~~ — resolved, see "Deviations from brief" above.
2. **Cannot verify (credentials absent, as instructed):**
   - **Step 7** (`npm run collect` against the real DB) — `db()` throws immediately on the first `upsertSnapshot` call since `SUPABASE_SERVICE_ROLE_KEY` is empty in `.env`. Not run; substitute live check run instead (see above) — everything except the three `upsertSnapshot` calls (`prices`, `macro`, `features` snapshot writes) is verified.
   - **Step 8** (SQL verification that `market_snapshots` contains today's real KOSPI/S&P closes and non-null curve) — cannot be done without a completed collection run, which requires the DB write path above.
   - **Step 9** (idempotent re-run check via SQL `count(*)` per `(date, kind)`) — same reason, cannot be done.
   - The **macro block being correctly populated when `FRED_API_KEY` is present** (as opposed to correctly falling back to all-`null` when absent, which I did verify) is also unverified — `hasFredKey()` returns `false` in this environment, so the `fetchFredSeries` calls and the `yoy`/`last` aggregation logic in `collectMacro()` never actually execute against real FRED data in my testing. The unit tests do cover the aggregation math (`curve2s10s`/`curve3m10y`) with synthetic `MacroBlock` values, but not the live FRED fetch + YoY computation path.
3. Did not commit anything (Step 10 held pending item 1 above).
