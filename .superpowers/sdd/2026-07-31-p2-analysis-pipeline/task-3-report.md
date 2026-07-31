# Task 3 Report: 1단 결정론적 스크리너

## What was implemented

- `src/types.ts`: appended `QuoteRow`, `Candidate`, `CandidateTech` verbatim from the brief, after the existing `UniverseRow`. No existing types altered.
- `src/screener.ts` (new): `fetchQuotes`, `filterByLiquidity`, `rankByMomentum`, `scoreCandidates`, `computeTech`, plus the `Pair` type — all copied verbatim from the brief's Step 4 code, which matched the actual signatures of `src/indicators.ts` and `src/sources/yahoo.ts` on inspection (no adaptation needed).
- `src/screener.test.ts` (new): the brief's 9 tests, copied verbatim.

## TDD Evidence

**RED** — command: `npm test`

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\user\Desktop\jj-coding-projects\trading agent\src\screener.ts' imported from C:\Users\user\Desktop\jj-coding-projects\trading agent\src\screener.test.ts
...
✖ src\screener.test.ts (676.0826ms)
```

Expected and correct: `screener.ts` did not exist yet, so the test file failed to resolve its import. All 41 pre-existing tests in other files still ran and passed around this failure.

**GREEN** — command: `npm test` (after implementing `src/screener.ts`)

```
✔ 유동성 필터는 시장별로 따로 자른다 (1.3351ms)
✔ 유동성 필터는 가격이나 거래량이 null이면 제외한다 (0.1775ms)
✔ 유동성 필터는 시세가 아예 없는 종목을 조용히 버리지 않고 제외한다 (0.1148ms)
✔ 모멘텀 랭킹은 52주 수익률 내림차순 상위 N (0.2096ms)
✔ 모멘텀이 null인 종목은 랭킹에서 빠진다 (0.1785ms)
✔ 스코어는 모멘텀과 퀄리티를 합치고, 퀄리티 결측은 그 항만 0으로 둔다 (0.4557ms)
✔ scoreCandidates는 turnover를 현지통화 그대로 싣고 tech는 아직 null (0.1178ms)
✔ computeTech는 상승 추세에서 이동평균 위, RSI 100 (3.995ms)
✔ computeTech는 데이터가 짧으면 각 항을 null로 둔다 (0.3569ms)
...
ℹ tests 50
ℹ pass 50
ℹ fail 0
```

50 = 41 pre-existing + 9 new screener tests. (Brief said "36 + 9 = 45"; actual pre-existing count was 41 because this branch already has more tests than the brief author assumed — not a discrepancy in the screener code itself.)

## Live verification (against committed `data/universe.json`, live Yahoo batch quote API)

Per the task instructions, ran the JSON-file version instead of the brief's `readUniverse`/Supabase version (service role key is empty and unobtainable).

Command:
```bash
node --input-type=module -e "const s=await import('./src/screener.ts');const fs=await import('node:fs/promises');const all=JSON.parse(await fs.readFile('data/universe.json','utf8'));const u=all.filter(r=>r.sector==='Technology');console.log('universe tech',u.length,'KR',u.filter(r=>r.market==='KR').length);const t0=Date.now();const q=await s.fetchQuotes(u.map(r=>r.ticker));console.log('quotes',q.length,'in',Date.now()-t0,'ms');const kept=s.filterByLiquidity(u,q,0.5);console.log('after liquidity',kept.length,'KR',kept.filter(p=>p.row.market==='KR').length,'US',kept.filter(p=>p.row.market==='US').length);console.log(s.rankByMomentum(kept,5).map(p=>[p.row.ticker,p.quote.yearChangePct]))"
```

Output (verbatim):
```
universe tech 93 KR 19
quotes 93 in 1910 ms
after liquidity 47 KR 10 US 37
[
  [ 'SNDK', 2266.9385 ],
  [ 'MU', 577.11194 ],
  [ '009150.KS', 491.12305 ],
  [ 'WDC', 487.16483 ],
  [ 'LITE', 447.19296 ]
]
```

- Universe Technology sector: 93 rows (19 KR, 74 US).
- Quotes returned: 93 — exact match, no missing tickers.
- After liquidity filter (keepFraction 0.5): 47 survivors, KR 10/19 (~53%), US 37/74 (~50%). Both markets represented, roughly half of each survives, as expected — the per-market cut is working correctly and did not zero out either market.
- Top 5 by 52-week momentum shown with tickers from both KR (`009150.KS`) and US, confirming both markets flow through to the ranking stage.

## npm test / npm run typecheck

`npm test`: 50 pass, 0 fail (see GREEN output above).

`npm run typecheck`:
```
> typecheck
> tsc --noEmit
```
Clean, no output, exit 0.

## Files changed

- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\types.ts` (appended `QuoteRow`, `Candidate`, `CandidateTech`)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\screener.ts` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\screener.test.ts` (new)

## Self-review findings

- Completeness: all five exports present (`fetchQuotes`, `filterByLiquidity`, `rankByMomentum`, `scoreCandidates`, `computeTech`) with signatures matching the brief; all 9 tests present and passing.
- Correctness: `filterByLiquidity` sorts and cuts within each of `['KR', 'US']` separately (confirmed by test 1 and live run); rows with no quote/null price/null volume are excluded before ranking (test 2, 3); `rankByMomentum` filters out `yearChangePct === null` before sorting (test 5); `scoreCandidates` computes each z-score term independently and folds `null` to `0` only inside the sum, leaving the stored `roe`/`operatingMargin` fields as `null` (test 6) and keeping score finite; `computeTech` returns all-null on 5-bar input (test 8, no numbers computed from insufficient bars).
- Discipline: no speculative helpers or extra exports beyond the brief's `Pair` type, which the brief's own code also exports as the shared param/return shape.
- Testing: no network calls in `screener.test.ts` — all inputs are inline fixtures; `npm test` output is clean (no unexpected console noise from screener tests).

## Issues or concerns

None. The brief's code was already consistent with the actual `indicators.ts`/`yahoo.ts`/`types.ts` signatures in this repo, so no adaptation was needed — copied verbatim. The only deviation from the brief was using the JSON-file-based live check instead of the Supabase-based one, per explicit task instructions (empty `SUPABASE_SERVICE_ROLE_KEY`).

## Fix round 1 (coordinator review finding)

**Finding:** the fixture in `유동성 필터는 시장별로 따로 자른다` did not discriminate a per-market cut from a naive global sort-and-slice — both implementations produced `['A.KS', 'C']` on the original fixture (KR `[1e11, 5e9]`, US `[1.5e10, 2e6]`), so a regression that deletes the per-market loop would have passed silently.

**What changed:** `src/screener.test.ts`, raised `B.KS`'s `avgVolume3m` from `100_000` to `1_000_000`, making its turnover `5e10` — now between `A.KS` (`1e11`) and `C` (`1.5e10`). Under a global cut the top 2 by turnover become `A.KS` and `B.KS` (both KR); under a per-market cut they remain `A.KS` (KR) and `C` (US). Comment updated to explain the new numbers. No production code changed.

**Discrimination proof (temporary-revert evidence):**

1. Backed up `src/screener.ts` to `src/screener.ts.bak`.
2. Temporarily replaced the per-market loop in `filterByLiquidity` with a global sort-and-slice:
   ```ts
   // TEMPORARY MUTATION FOR REVIEW VERIFICATION — global sort-and-cut, no per-market split.
   const sorted = withTurnover.sort((a, b) => b.turnover - a.turnover)
   const n = Math.max(1, Math.ceil(sorted.length * keepFraction))
   return sorted.slice(0, n).map((x) => x.pair)
   ```
3. Ran `node --test src/screener.test.ts`. Result: 8 pass, 1 fail — the new fixture test failed as expected:
   ```
   ✖ 유동성 필터는 시장별로 따로 자른다 (2.8752ms)
     AssertionError [ERR_ASSERTION]: 시장별 상위 절반이 남아야 한다
     + actual - expected
   
       [
         'A.KS',
     +   'B.KS'
     -   'C'
       ]
   
     actual: [ 'A.KS', 'B.KS' ],
     expected: [ 'A.KS', 'C' ],
   ℹ tests 9
   ℹ pass 8
   ℹ fail 1
   ```
   This confirms the fixture now catches exactly the regression it exists to prevent.
4. Reverted `src/screener.ts` from the backup (`cp src/screener.ts.bak src/screener.ts`, then removed the backup). Confirmed via `git diff --stat src/screener.ts` and a subsequent `git status` that the file matched the previously committed version exactly (no diff against HEAD before this round).

**Post-fix verification:**

`node --test src/screener.test.ts` — 9/9 pass:
```
✔ 유동성 필터는 시장별로 따로 자른다 (1.4538ms)
✔ 유동성 필터는 가격이나 거래량이 null이면 제외한다 (0.1831ms)
✔ 유동성 필터는 시세가 아예 없는 종목을 조용히 버리지 않고 제외한다 (0.1255ms)
✔ 모멘텀 랭킹은 52주 수익률 내림차순 상위 N (0.1878ms)
✔ 모멘텀이 null인 종목은 랭킹에서 빠진다 (0.1504ms)
✔ 스코어는 모멘텀과 퀄리티를 합치고, 퀄리티 결측은 그 항만 0으로 둔다 (0.4387ms)
✔ scoreCandidates는 turnover를 현지통화 그대로 싣고 tech는 아직 null (0.11ms)
✔ computeTech는 상승 추세에서 이동평균 위, RSI 100 (3.7084ms)
✔ computeTech는 데이터가 짧으면 각 항을 null로 둔다 (0.2176ms)
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

`npm test` — 50/50 pass (unchanged from before).

`npm run typecheck` — clean, no output, exit 0.

**Commit:** `043970d` test: fix liquidity-filter fixture to discriminate per-market cut from global sort. Only `src/screener.test.ts` changed (2 lines); `src/screener.ts` untouched.

**Deferred (not in scope, per coordinator instruction):** `fetchQuotes`'s catch logging only `chunk[0]` instead of the whole failed chunk, and `scoreCandidates` re-checking a null `turnover` already excluded by `filterByLiquidity` — both left as-is.
