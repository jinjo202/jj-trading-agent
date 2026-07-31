# Task 1 Report: 프로젝트 스캐폴드 + 지표 모듈 (TDD)

## What I implemented

- `package.json` — scripts (`test`, `typecheck`, `collect`, `smoke`), deps (`yahoo-finance2`, `@supabase/supabase-js`), devDeps (`typescript`, `@types/node`), exactly per brief.
- `tsconfig.json` — Node 24 type-stripping config (`nodenext`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `strict`), exactly per brief.
- `.gitignore` — replaced a pre-existing unrelated Next.js/Vercel-flavored `.gitignore` (node_modules/, .next/, .env*, .vercel, dist/ — leftover cruft, nothing in this repo uses those) with the brief's minimal `node_modules` / `.env`.
- `.env.example` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRED_API_KEY`, exactly per brief.
- `src/types.ts` — `Ohlcv`, `Fundamentals`, `SnapshotKind`, exactly per brief.
- `src/indicators.ts` — pure functions: `sma`, `ema`, `rsi`, `macd`, `atr`, `realizedVol`, `momentum12_1`, `week52Position`, `distFromSma`, `pctChange`, `zscore`, `pctRank`, exactly per brief's code. No I/O, no network, no env access.
- `src/indicators.test.ts` — 13 `node:test` cases from the brief, with one approved deviation (see below).
- `npm install` run: 121 packages added, 0 vulnerabilities.

## What I tested and results

- `npm test` — 13/13 passing, output pristine (no warnings, no stray console output).
- `npm run typecheck` — clean, no errors.

## TDD Evidence

**RED** — command: `npm test` (run immediately after creating `src/types.ts` and `src/indicators.test.ts`, before `src/indicators.ts` existed):

```
node:internal/modules/esm/resolve:271
    throw new ERR_MODULE_NOT_FOUND(
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\user\Desktop\jj-coding-projects\trading agent\src\indicators.ts' imported from ...\src\indicators.test.ts
...
✖ src\indicators.test.ts (382.0089ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

This is exactly the brief's expected failure ("Cannot find module './indicators.ts'") — the test file imports a module that doesn't exist yet, confirming the test was written and wired up correctly before any implementation existed.

**GREEN (first pass, after implementing `indicators.ts` verbatim from the brief)** — command: `npm test`:

```
✔ sma는 마지막 period개의 평균 (0.7711ms)
✔ ema는 SMA로 시드한 뒤 k=2/(n+1)로 갱신 (0.1393ms)
✔ rsi: 계속 오르면 100, 계속 내리면 0, 손계산 케이스와 일치 (0.2237ms)
✔ rsi는 period+1개 미만이면 null (0.0991ms)
✔ macd hist = macd - signal (1.2299ms)
✔ atr: 레인지가 일정하면 ATR은 그 레인지 (0.3103ms)
✔ realizedVol: 가격이 일정하면 0 (0.1672ms)
✔ momentum12_1은 t-252 대비 t-21 수익률 (0.1531ms)
✔ week52Position: 고가 = 1, 저가 = 0 (0.1476ms)
✖ distFromSma는 SMA 대비 퍼센트 (1.1153ms)
✖ pctChange는 lookback봉 전 대비 수익률 (0.2464ms)
✔ zscore는 모집단 표준편차 기준 (0.1516ms)
✔ pctRank는 null을 제외하고 0-100 백분위 (0.1043ms)
ℹ tests 13
ℹ pass 11
ℹ fail 2
```

Failures were floating-point precision issues in the test's own strict-equality assertions (see Deviations below), not implementation bugs — verified independently:
```
node -e "console.log(20/12.5 - 1)"   // 0.6000000000000001
node -e "console.log(110/100 - 1)"   // 0.10000000000000009
```

**GREEN (final, after the approved test-file fix)** — command: `npm test`:

```
✔ sma는 마지막 period개의 평균 (0.8283ms)
✔ ema는 SMA로 시드한 뒤 k=2/(n+1)로 갱신 (0.207ms)
✔ rsi: 계속 오르면 100, 계속 내리면 0, 손계산 케이스와 일치 (0.2635ms)
✔ rsi는 period+1개 미만이면 null (0.1249ms)
✔ macd hist = macd - signal (1.6386ms)
✔ atr: 레인지가 일정하면 ATR은 그 레인지 (0.2722ms)
✔ realizedVol: 가격이 일정하면 0 (0.1732ms)
✔ momentum12_1은 t-252 대비 t-21 수익률 (0.1922ms)
✔ week52Position: 고가 = 1, 저가 = 0 (0.1842ms)
✔ distFromSma는 SMA 대비 퍼센트 (0.1554ms)
✔ pctChange는 lookback봉 전 대비 수익률 (0.1061ms)
✔ zscore는 모집단 표준편차 기준 (0.1321ms)
✔ pctRank는 null을 제외하고 0-100 백분위 (0.1113ms)
ℹ tests 13
ℹ pass 13
ℹ fail 0
```

`npm run typecheck` — clean, no output, exit 0.

## Deviations from brief

**Approved by coordinator mid-task.** Two assertions in `src/indicators.test.ts` (as given verbatim in the brief) used `assert.equal` (strict equality) on values that are not exactly representable in IEEE 754 double precision:

- `distFromSma([10, 10, 10, 20], 4)` → brief expected `0.6`, actual computed value is `0.6000000000000001` (`20 / 12.5 - 1` in float arithmetic).
- `pctChange([100, 110], 1)` → brief expected `0.1`, actual computed value is `0.10000000000000009` (`110 / 100 - 1` in float arithmetic).

Confirmed via `node -e` that this is intrinsic floating-point behavior, not an implementation defect — `src/indicators.ts` was not changed. Every other float-producing test in the same file (`ema`, `rsi` period=2 case, `macd`, `atr`, `momentum12_1`, `zscore`) already uses the tolerance pattern `assert.ok(Math.abs(actual - expected) < 1e-9)`; only these two used strict equality inconsistently. I flagged this to the coordinator before touching the test file (per the task's explicit instruction not to silently bend a test to match output) and got explicit approval to change exactly these two assertions to the same epsilon pattern, leaving `src/indicators.ts` untouched and keeping the brief's `// 20 / 12.5 - 1` comment for readability. Confirmed the coordinator's noted true-strict-equality-safe cases (`sma`, `ema`'s `2.5`, `rsi` 100/0) were left as strict `assert.equal` — untouched.

Diff of the approved change:
```diff
 test('distFromSma는 SMA 대비 퍼센트', () => {
-  assert.equal(distFromSma([10, 10, 10, 20], 4), 0.6) // 20 / 12.5 - 1
+  assert.ok(Math.abs(distFromSma([10, 10, 10, 20], 4)! - 0.6) < 1e-9) // 20 / 12.5 - 1
 })

 test('pctChange는 lookback봉 전 대비 수익률', () => {
-  assert.equal(pctChange([100, 110], 1), 0.1)
+  assert.ok(Math.abs(pctChange([100, 110], 1)! - 0.1) < 1e-9)
   assert.equal(pctChange([100], 5), null)
 })
```

**Also unrequested-but-necessary:** `.gitignore` pre-existed in the repo with Next.js/Vercel-oriented content (`.next/`, `.vercel`, `dist/`) unrelated to this project's stack. Overwrote it with the brief's exact `node_modules` / `.env` content since the brief lists `.gitignore` as a file to create with specific content, and the old content was clearly template leftover (no Next.js/Vercel anywhere in this repo).

## Files changed

- `C:\Users\user\Desktop\jj-coding-projects\trading agent\package.json` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\package-lock.json` (new, from `npm install`)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\tsconfig.json` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\.gitignore` (replaced content)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\.env.example` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\types.ts` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\indicators.ts` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\indicators.test.ts` (new, with the two approved epsilon-assertion changes)

Not staged/committed (pre-existing, out of scope for this task): `.claude/settings.local.json`, `docs/superpowers/plans/2026-07-31-p1-collection-pipeline.md`.

## Self-review findings

- Completeness: every function named in the brief's Interfaces block exists in `src/indicators.ts` with the exact signature (`sma`, `ema`, `rsi`, `macd`, `atr`, `realizedVol`, `momentum12_1`, `week52Position`, `distFromSma`, `pctChange`, `zscore`, `pctRank`). `types.ts` has `Ohlcv`, `Fundamentals`, `SnapshotKind` exactly as specified. All 13 brief-listed tests exist.
- Quality: implementation matches the brief's code verbatim — no extra helpers beyond `tail`/`clean`, which are themselves part of the brief's code. No speculative options added.
- Testing: all assertions check real computed values (either exact strict equality where floating point permits it, or epsilon tolerance where it doesn't). Test output is pristine — no warnings, no stray console output. `npm test` exit clean, `npm run typecheck` exit clean.

## Issues or concerns

None outstanding. The only wrinkle (floating-point strict-equality test defect) was caught during RED→GREEN verification, flagged before editing, and resolved with explicit coordinator approval as documented above.

## Fix round 1

Task review returned one Important, confirmed finding: `momentum12_1` off-by-one at `src/indicators.ts:80`.

**Root cause:** every other "N bars ago" lookup in the file uses `values.length - 1 - N` (e.g. `pctChange` at `src/indicators.ts:101`). `momentum12_1`'s `end` used `values[values.length - 21]`, which is index `(length-1) - 20` — that's t-20, not t-21. `start` (`values[values.length - 253]`, i.e. t-252) was already correct. The function's own comment and the test's name both state the definition (t-252 vs t-21); the brief's code contradicted its own prose, so the prose governs.

**What changed:**
- `src/indicators.ts:80` — `values[values.length - 21]` → `values[values.length - 22]` (true t-21, following the `length - 1 - N` convention). Length guard `values.length < 253` left unchanged — 253 elements still covers both index 0 and index 231.
- `src/indicators.test.ts` — expected value derived from the definition rather than from implementation arithmetic: with a 253-element array, t = index 252, so t-252 = index 0 and t-21 = index 231 (previously the test used index 232, which matched the buggy implementation, not the definition):
  ```diff
   test('momentum12_1은 t-252 대비 t-21 수익률', () => {
  -  // 253개 중 index 0 = 100, index 232(=252-20) = 150
  -  const values = Array.from({ length: 253 }, (_, i) => (i === 0 ? 100 : i === 232 ? 150 : 1))
  +  // length 253이면 t = index 252. t-252 = index 0, t-21 = index 231.
  +  const values = Array.from({ length: 253 }, (_, i) => (i === 0 ? 100 : i === 231 ? 150 : 1))
     assert.ok(Math.abs(momentum12_1(values)! - 0.5) < 1e-9)
   })
  ```

**Not changed (deferred as minor, per coordinator instruction):** `macd`'s guard `values.length < 35` — correctness-neutral (returns `null` one bar later than the strict minimum of 34 would allow), left as-is.

**Covering tests:** `momentum12_1은 t-252 대비 t-21 수익률` in `src/indicators.test.ts` (the only test exercising this function); full suite re-run to confirm no regressions elsewhere.

**Commands and output:**

```
$ node --test src/indicators.test.ts
✔ sma는 마지막 period개의 평균 (0.7417ms)
✔ ema는 SMA로 시드한 뒤 k=2/(n+1)로 갱신 (0.1376ms)
✔ rsi: 계속 오르면 100, 계속 내리면 0, 손계산 케이스와 일치 (0.2202ms)
✔ rsi는 period+1개 미만이면 null (0.094ms)
✔ macd hist = macd - signal (1.2298ms)
✔ atr: 레인지가 일정하면 ATR은 그 레인지 (0.251ms)
✔ realizedVol: 가격이 일정하면 0 (0.1647ms)
✔ momentum12_1은 t-252 대비 t-21 수익률 (0.1445ms)
✔ week52Position: 고가 = 1, 저가 = 0 (0.1715ms)
✔ distFromSma는 SMA 대비 퍼센트 (0.1591ms)
✔ pctChange는 lookback봉 전 대비 수익률 (0.1231ms)
✔ zscore는 모집단 표준편차 기준 (0.1218ms)
✔ pctRank는 null을 제외하고 0-100 백분위 (0.106ms)
ℹ tests 13
ℹ pass 13
ℹ fail 0
```

```
$ npm test
(13/13 passing, identical to above)

$ npm run typecheck
> tsc --noEmit
(no output, clean)
```

Committed as `c8d53fe` — "fix: correct momentum12_1 off-by-one (t-21 was actually t-20)".
