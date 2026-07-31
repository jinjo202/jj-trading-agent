# Final fix pass — p1-collection

Branch `p1-collection`, base HEAD `5b7b810`. All findings from the whole-branch review addressed in one pass.

## Findings and fixes

### Critical 1 — `.gitignore` regression
`.gitignore` (whole file rewritten). Restored:
```
node_modules/
.next/
.env*
!.env.example
.vercel
dist/
```
Verified:
- `git check-ignore -v .env .env.local` → both matched by `.gitignore:3:.env*`
- `git ls-files | grep -i '^\.env'` → only `.env.example`

### Important 2 — `collectMacro` all-or-nothing
`src/collect.ts:80-109` (`collectMacro`):
- `Promise.all` → `Promise.allSettled`. Each of the 7 FRED series independently resolves to its observations or is treated as absent on rejection (rejections are logged individually).
- `available` is now `true` iff at least one series fulfilled, `false` iff all seven rejected. The `hasFredKey()` early-return path (all-null, `available:false`) is untouched.
- `MacroBlock` shape unchanged — no new fields.

`src/collect.ts:140-147` (`buildFeatures`):
- `if (!macro.available) missing.push('fred')` else loop over the 7 field names (`dgs2, dgs10, dgs3mo, cpiYoY, coreCpiYoY, unrate, hySpread`) and push `` `fred:${field}` `` for each one that is `null`.

New test in `src/collect.test.ts` ("macro가 일부만 채워지면..."): a `MacroBlock` with `available: true, dgs2: null` (rest populated) asserts `missing` contains `fred:dgs2`, does not contain bare `fred`, `curve2s10s` is `null`, `curve3m10y` is not null. Breaks if the per-field loop is removed or if `dgs2` fails to propagate to `curve2s10s`.

### Important 3 — `pctRank` overshoot above 100
`src/indicators.ts:121`: `(below / (v.length - 1)) * 100` → `(Math.min(below, v.length - 1) / (v.length - 1)) * 100`.

New test in `src/indicators.test.ts`: `pctRank([10,20,30],40) === 100`, `pctRank([10,20,30],5) === 0`. Existing pctRank tests untouched and still pass. Verified by reasoning: without the clamp, `pctRank([10,20,30],40)` computes `below=3`, `3/2*100=150`, which the test would catch (`150 !== 100`).

### Important 4 — `week52Position` missing minimum-window guard
`src/indicators.ts:84-85`: added `if (bars.length < 200) return null` before the 252-bar slice.

New test in `src/indicators.test.ts` ("200봉 미만이면 null"): 10 bars with **distinct** high/low/close values (100..109, not all equal) — deliberately not degenerate, so the pre-existing `high === low → null` branch can't accidentally cover for a missing guard. Confirmed by temporarily removing the guard: test failed with `1 !== null` (position was computed as 1 instead of null); guard restored, test passes again.

Existing fixture check (as requested): `src/indicators.test.ts`'s `week52Position: 고가 = 1, 저가 = 0` test used only 3 bars, which the new guard would null out. Fixed the fixture to 200 bars (1 low bar + 199 high bars, close=high=low pattern preserved) so it legitimately exercises the "position 1" case rather than weakening the guard. No other test in `indicators.test.ts` or `collect.test.ts` calls `week52Position`/`assetFeature`/`buildFeatures` with fewer than 200 bars (the `collect.test.ts` fixtures all use `n=300` by default, including the VIX-term test).

### Important 5 — `prices` snapshot size / misleading comment
`src/collect.ts`:
- Added `round4()` helper (`Math.round(n*10000)/10000`), applied to `open/high/low/close` only, in the `trimmed` object built for storage in `runCollect`. `volume` untouched (including `null`). `buildFeatures` still receives the raw, untrimmed, unrounded `prices` — confirmed by reading the diff: `buildFeatures(prices, macro, ...)` call is unchanged, only `trimmed` (a separate object used solely for the `prices` upsert) is rounded/trimmed.
- Replaced the comment with one stating actual measured numbers (see below) and explicitly notes the deliberate absence of retention/pruning.

Measured (see live check output below): untrimmed `903,548` bytes → trimmed only `816,556` bytes (~10%, matches finding) → trimmed **and rounded** `564,707` bytes. That's a further ~31% cut from the trim-only figure, ~37.5% total off the untrimmed payload. At `~565 KB/day` the 500 MB free-tier ceiling is roughly 2.4 years out instead of ~600 days — better, but retention was intentionally left unbuilt per the instruction.

### Minor 6 — `macd` off-by-one
`src/indicators.ts:41`: `values.length < 35` → `values.length < 34`. Existing macd test (120-bar series) still passes.

### Minor 8 — non-atomic upserts
`src/db.ts`: replaced `upsertSnapshot(kind, date, payload)` with `upsertSnapshots(rows: {kind,date,payload}[])`, a single `.upsert(rows, {onConflict:'date,kind'})` call. `upsertSnapshot` had exactly one caller (`runCollect`, 3 call sites) so it was replaced outright rather than kept alongside a second entry point — no query-builder abstraction added.
`src/collect.ts` `runCollect`: builds `features` before the DB round-trip, then issues one `upsertSnapshots([...])` call with all three rows (`prices`, `macro`, `features`).

### Minor 11 — Naver fallback empty-result guard
`src/collect.ts` `collectPrices`: fallback branch now mirrors the Yahoo branch — `if (bars.length > 0) { out[s] = bars; ... } else { console.error(...) }` instead of assigning unconditionally. An empty Naver response no longer produces `out['^KS11'] = []`, so it also won't be double-counted in the completion log's symbol count.

### Minor 12 — smoke script didn't test the KOSPI/KOSDAQ fallback
`src/sources/smoke.ts`: added `['naver daily KOSPI', ...]` and `['naver daily KOSDAQ', ...]` entries alongside the existing `naver daily 005930` check, same shape (`fetchNaverDaily(sym, 30)).length`).

### Minor 14 — dropped test comment
`src/collect.test.ts`: restored the two-line comment above `series()` explaining the high/low=close design rationale for `week52Position === 1`.

## Test/typecheck/smoke output

`npm test` — 21/21 pass, pristine:
```
ℹ tests 21
ℹ suites 0
ℹ pass 21
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

`npm run typecheck` — clean, no output beyond the `tsc --noEmit` invocation.

`npm run smoke` — exits 1 as expected (no FRED key):
```
OK   yahoo chart ^GSPC: 21
OK   yahoo chart ^KS11: 22
OK   yahoo fundamentals AAPL: Technology
OK   yahoo fundamentals 005930.KS: 0.18855
OK   naver daily 005930: 22
OK   naver daily KOSPI: 22
OK   naver daily KOSDAQ: 22
OK   naver foreign ratio 005930: 46.53
FAIL fred DGS10: FRED_API_KEY 없음
```

## Substitute live check

```
node --env-file=.env --input-type=module -e "...buildFeatures..."
```
```
FRED_API_KEY 없음 — 매크로 블록을 건너뜁니다
symbols 23
missing [ 'fred', 'naver:foreignRatio' ]
KS11 { symbol: '^KS11', close: 6416.1201171875, distSma20: -0.0693..., ... week52Position: 0.5291..., ret1m: -0.2273..., ret3m: -0.0339... }
featuresBytes 9976
```
23/23 symbols collected (Yahoo succeeded for both `^KS11`/`^KQ11` directly — Naver fallback not exercised in this run, so its guard fix isn't visible here, but is covered by the smoke checks and code inspection). `missing` correctly shows only `fred` (no key present) and `naver:foreignRatio` (not fetched in this reduced repro), matching pre-change behavior for those two cases — no regression.

Payload-size measurement (separate one-off script replicating `runCollect`'s trim/round logic against a live `collectPrices()` call):
```
untrimmed bytes 903548
trimmed (no round) bytes 816556
trimmed + rounded bytes 564707
```
This confirms the finding's measured baseline (903,548 / 816,556) and gives the real post-fix number: **564,707 bytes/day** for the `prices` payload.

## Not changed (out of scope, per instructions)

- breadth RSP/SPY alignment by position not date
- migration's non-idempotent `create policy` statements
- `NaN` reachability in `realizedVol`/`distFromSma`
- FRED key in the request URL
- `yahoo-finance2` transitive deps
- per-call error wrapping in `yahoo.ts`
- Naver blanket quote sanitizer
- `yoy()`'s null-filter-then-index-13 approach
- No retention/pruning mechanism added for the `prices` table (deliberately deferred, per instructions — now recorded in the code comment).

## Concerns

- None of the fixes required bending a test's expected value — every new/adjusted test's expected value matches what the correct implementation produces (verified pctRank and week52Position by reasoning/temporary-break-and-revert).
- `.claude/settings.local.json` and `docs/superpowers/plans/2026-07-31-p1-collection-pipeline.md` showed up as modified in `git status` but were not touched by this fix pass (pre-existing working-tree state) — left alone and not staged/committed.
- The substitute live check happened to have Yahoo succeed for both KR indices, so it doesn't exercise the Naver-fallback-guard fix (finding 11) end-to-end; that fix was verified by code inspection and the smoke script's now-passing `naver daily KOSPI`/`KOSDAQ` checks instead.
