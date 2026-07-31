# Task 5 Report: 번들 조립 (A단계 · B단계)

## What I implemented

- `src/types.ts`: appended `BundleA`, `BundleB` types (verbatim from brief).
- `src/db.ts`: appended `readLatestSnapshot(kind)` and `readOpenReportRequests(limit)` (verbatim from brief).
- `src/prepare.ts` (new): `buildBundleA`, `owSectorsFrom`, `buildBundleB`, plus `DISCLAIMER` constant, verbatim from brief.
- `src/prepare.test.ts` (new): the brief's 5 tests, with one fixture fix (see Issues below).
- `src/bin/prepare.ts` (new): A-stage CLI — reads `features` snapshot, fetches SPY/QQQ + Yonhap news, writes `runs/<date>/bundle-a.json`.
- `src/bin/candidates.ts` (new): B-stage CLI — reads bundle-a + validated agent outputs, derives OW sectors, screens universe, scores/enriches 12 candidates, writes `runs/<date>/bundle-b.json`.
- `package.json`: added `prepare:bundle` and `candidates` scripts.
- `.gitignore`: `runs/` was already present from an earlier task; no change needed.

## TDD Evidence

**RED** — command: `node --test src/prepare.test.ts` (also visible via `npm test`, which ran all 72 tests with 1 failing suite before implementation):

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\user\Desktop\jj-coding-projects\trading agent\src\prepare.ts' imported from ...\src\prepare.test.ts
```

Expected failure — `src/prepare.ts` did not exist yet, matching the brief's Step 4 expectation exactly.

**GREEN** — command: `npm test`, after implementing `src/prepare.ts`:

```
ℹ tests 76
ℹ suites 0
ℹ pass 76
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

71 pre-existing + 5 new = 76, matching the brief's Step 6 expectation.

## Live news-fetching verification (real network, no DB)

Command run exactly as specified in the task context (synthetic `FeatureSet`, bypassing `readLatestSnapshot`):

```
node --input-type=module -e "..."
```

Output:

```
news market 6 korea 15 bytes 4572
```

Both counts non-zero (SPY RSS: 6 items requested and returned; Yonhap economy RSS: 15 items). Bundle size 4572 bytes — well under the "low tens of KB" ballpark (this run used a mostly-empty synthetic `FeatureSet` with `assets: {}`, so it's smaller than a real bundle with ~23 populated assets would be, but confirms `buildBundleA` assembles correctly around live news data).

## npm test / npm run typecheck

Both clean:

- `npm test`: 76/76 pass, 0 fail.
- `npm run typecheck`: exits 0, no errors (after fixing the test fixture — see Issues below).

## Files changed

- `src/types.ts` (append)
- `src/db.ts` (append)
- `src/prepare.ts` (new)
- `src/prepare.test.ts` (new)
- `src/bin/prepare.ts` (new)
- `src/bin/candidates.ts` (new)
- `package.json` (two scripts added)
- `.gitignore` unchanged (`runs/` already present)

Commit: `a799814 feat: add A/B stage bundle builders and candidate screening CLI`

## Self-review findings

- Completeness: all exports from the brief's Interfaces block present with the exact signatures (`buildBundleA`, `owSectorsFrom`, `buildBundleB`, `readLatestSnapshot`, `readOpenReportRequests`, `BundleA`, `BundleB`). All five brief tests present.
- Correctness: `owSectorsFrom` matches `sector:` prefix, does case-insensitive `.toUpperCase() === 'OW'` on the trimmed value, trims the extracted sector name, and returns `[]` when `country_sector` is absent or has no OW entries — all covered and passing in the two dedicated tests. `buildBundleB`'s `company_reports_for` is a direct pass-through of the `requested` argument with no filtering/dedup — confirmed both by reading the implementation and by the "그대로 싣는다" test.
- Discipline: no speculative helpers, no extra exports beyond `DISCLAIMER` (which the brief's own code block exports) and the three required functions.
- Testing: each test targets a distinct, breakable behavior (agents_to_run ordering/count, news array wiring, OW extraction with mixed case/mixed UW/country-vs-sector entries, empty/absent handling, B-bundle field wiring, pass-through of the request queue). None are trivially-true tautologies.

## Issues / concerns

1. **Test fixture type error (fixed).** The brief's `prepare.test.ts` code block's `candidate()` helper builds a `Candidate` literal without a `tech` field, but `Candidate.tech` is `CandidateTech | null` (required, not optional) per `src/types.ts`. `npm run typecheck` failed with `TS2741: Property 'tech' is missing`. I added `tech: null` to the fixture. This only satisfies the type contract — it does not touch any assertion, so it doesn't weaken what the test can catch. Flagging per instructions rather than silently absorbing it.
2. **DB-dependent paths unverified (as expected, per task instructions).** `SUPABASE_SERVICE_ROLE_KEY` is empty in `.env`, so:
   - `readLatestSnapshot` and `readOpenReportRequests` in `src/db.ts` have never been exercised against a live Supabase instance in this task — they are typed and structurally mirror the already-working `upsertSnapshots`/`readUniverse` query patterns, but the actual query/`.select()`/`.order()`/`.is()` chain against `market_snapshots` and `report_requests` tables is unverified.
   - Ran `npm run prepare:bundle` and confirmed it fails at exactly the expected point: `A단계 준비 실패: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다` — i.e., `db()` throws before any query executes, as anticipated.
   - The full A→B CLI pipeline (`prepare:bundle` writing `runs/<date>/bundle-a.json`, then `candidates -- <date>` reading it, screening, and writing `bundle-b.json`) has not been run end-to-end because it depends on the live DB (universe table, report_requests table) and on `features` snapshot data from the P1 `collect` pipeline. Only the news-fetching half of `buildBundleA` was verified live, per the task's alternate verification instructions.

## Fix round 1

**Finding:** reviewer approved with one Important item — `owSectorsFrom`'s existing test only checked exact-case `'OW'`/`'UW'` and no-space labels. Nothing in the suite would catch a regression to a case-sensitive `value === 'OW'` check or a label-slice that stopped trimming, even though the brief calls out case-insensitivity and trimming as load-bearing.

**What changed:** added one test to `src/prepare.test.ts`, right after the existing `owSectorsFrom` OW-extraction test:

```ts
test('owSectorsFrom은 대소문자와 공백을 허용한다', () => {
  const cs = agent('country_sector', {
    evidence: [
      { label: 'sector:Technology', value: 'ow', source: 'features.relative.sectors' },
      { label: 'sector: Energy', value: 'OW ', source: 'features.relative.sectors' },
      { label: 'sector:Utilities', value: 'Ow', source: 'features.relative.sectors' },
    ],
  })
  assert.deepEqual(owSectorsFrom([cs]), ['Technology', 'Energy', 'Utilities'])
})
```

No changes to `src/prepare.ts` — the implementation was already correct (reviewer hand-traced it); this only closes the coverage gap.

**Commands and output:**

```
node --test src/prepare.test.ts
```
```
✔ owSectorsFrom은 대소문자와 공백을 허용한다 (0.1107ms)
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

```
npm test
```
```
ℹ tests 77
ℹ pass 77
ℹ fail 0
```

```
npm run typecheck
```
```
(no output — exit 0)
```

Commit: `450ec0e test: cover owSectorsFrom case-insensitivity and label trimming`
