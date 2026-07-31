# Task 4: LLM 출력 스키마 검증 — Report

## What I implemented

- Appended `AgentOutput`, `DailyVerdict`, `CompanyReport` types to `src/types.ts` (verbatim from the brief, nothing else changed in that file).
- Created `src/schema.ts` with three exported validators — `validateAgentOutput`, `validateDailyVerdict`, `validateCompanyReport` — and the module-private `Path` class plus small helpers (`obj`, `str`, `numIn`, `oneOf`, `arr`, `strArray`, `isoDate`), implemented verbatim from the brief with one required fix (see below).
- Created `src/schema.test.ts` with the 15 tests from the brief, verbatim.

### One deviation from the brief's literal code — required by the global constraints

The brief's `Path` class used a constructor parameter property:
```ts
constructor(readonly at: string) {}
```
This is disallowed by this task's global constraints ("no constructor parameter properties" — Node 24 type-stripping doesn't support them) and running it confirmed the runtime error:
```
SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode
```
Fixed by declaring the field and assigning it in the constructor body instead:
```ts
class Path {
  readonly at: string
  constructor(at: string) {
    this.at = at
  }
  child(key: string | number): Path { ... }
  fail(msg: string): never { ... }
}
```
Behavior is identical; this is a mechanical syntax fix, not a logic change. Flagging it since I was told to write the brief's code "verbatim" but the literal snippet does not run under this project's runtime constraints.

## TDD Evidence

**RED** — command: `npm test` (after adding types + test file, before creating schema.ts)
```
SyntaxError [ERR_MODULE_NOT_FOUND]: Cannot find module '...\src\schema.ts' imported from ...\src\schema.test.ts
...
✖ src\schema.test.ts (490.9043ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
```
This is the expected failure mode per the brief's Step 3 (`Cannot find module './schema.ts'`) — confirms the test file is wired up correctly and fails only because the implementation doesn't exist yet.

**GREEN** — command: `npm test` (after implementing schema.ts, with the Path fix applied)
```
ℹ tests 65
ℹ suites 0
ℹ pass 65
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1290.733
```
65 = 50 pre-existing tests in the repo + 15 new schema tests, all passing. (The brief's own comment estimated "45 + 15 = 60"; the actual pre-existing count in this checkout was 50, so 65 is the correct total — internally consistent with "existing + 15 new".)

Intermediate check: after first implementing `Path` with the parameter-property form (before the fix), `npm test` failed with the `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` shown above on 1 of 51 tests, confirming the root cause before I applied the fix.

## `npm test` / `npm run typecheck`

- `npm test`: 65/65 passing, 0 failing.
- `npm run typecheck` (`tsc --noEmit`): clean, no output, exit 0.

## Files changed

- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\types.ts` — appended `AgentOutput`, `DailyVerdict`, `CompanyReport` (append-only, nothing else touched).
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\schema.ts` — new file, three validators + private helpers.
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\schema.test.ts` — new file, 15 tests verbatim from the brief.

Note: `.claude/settings.local.json` had an unrelated pre-existing local modification in the working tree (present before this task started). It was deliberately left out of the commit since the brief's Step 6 names exactly `src/types.ts src/schema.ts src/schema.test.ts`.

## Self-review

- **Completeness**: every field of all three types is validated in `validateCompanyReport`/`validateDailyVerdict`/`validateAgentOutput` — checked field-by-field against the type definitions and the brief's implementation. All 15 specified tests present and passing.
- **Correctness**:
  - `suggested_equity_weight` enforces exactly 2 entries (`w.length !== 2` check) and `lo <= hi` (`if (lo > hi) wp.fail(...)`).
  - Numeric-looking strings rejected: `numIn` does `typeof v !== 'number'` before range check, so `'62'` fails with a `typeof` message on the `score` path — confirmed by the "숫자 모양 문자열" test passing.
  - Nullable fields (`per`, `pbr`, `roe`, `per_pctile_in_sector`, `debt_to_equity`) accept `null` and reject non-finite numbers via `nullableNum`'s `Number.isFinite` check (rejects `NaN`/`Infinity` explicitly, not just non-numbers).
  - Every error message is built via `Path.fail`, which prefixes `${this.at}: ` — e.g. a bad `picks[0].market` produces `DailyVerdict.picks[0].market: KR|US 중 하나여야 함 (받은 값: "JP")`, satisfying the "must name the failing field path" constraint.
- **Discipline**: exactly three exports from `schema.ts` (`validateAgentOutput`, `validateDailyVerdict`, `validateCompanyReport`); `Path` and all helpers are unexported/module-private; no generic schema engine — `validateCompanyReport` is written out in full with explicit per-field calls, no abstraction beyond the brief's small helpers.
- **Testing**: 13 rejection tests vs 2 acceptance tests (the two `deepEqual` "정상 ... 통과" tests) — rejections outnumber acceptances as required. Every rejection test asserts `assert.throws(..., /fieldName/)`, matching against a path-bearing message rather than merely checking that something threw.
- **`deepEqual` scrutiny**: Both `goodAgent` and `goodVerdict` pass through unchanged. I traced this carefully since the task warned that any coercion, dropped key, or reordering would surface as a real defect via these tests. The validators only reconstruct fields explicitly named in the type (no unknown-key passthrough), which matches exactly what `goodAgent`/`goodVerdict` contain — no extra keys in the fixtures, so no information is dropped. The one place object identity could visibly change is `suggested_equity_weight: [lo, hi]` — a new array literal, but with numerically identical values in the same order, so `deepEqual` (structural, not referential) accepts it. Confirmed no defect here.

## Fix round 1

**Finding:** `src/schema.test.ts` never imported or called `validateCompanyReport`, leaving `CompanyReport`'s `invalidation` guarantee — one of the three design-mandated trust-boundary checks — with zero regression coverage.

**What changed:**
- `src/schema.test.ts`: added `validateCompanyReport` to the import, added a `goodReport` fixture, and 6 new tests: pass-through `deepEqual`, empty `invalidation` rejected, empty `thesis`/`bear_points` rejected, bad `market` rejected, `NaN`/`Infinity` rejected on a nullable numeric field (`per`) while `null` still passes, and out-of-range `week52.position` rejected.
- Verified the coordinator's suggested fixture's numeric fields (`change_1d` 0.012, `change_1m` 0.05, `change_12m` 0.32, `market_cap` 4.2e14) against the actual `numIn` bounds in the committed `src/schema.ts` (`-1..10`, `-1..100`, `-1..1000`, `0..MAX_SAFE_INTEGER` respectively) — all within range, no adjustment needed.
- No production code changed.

**Covering tests:** the 6 new tests in `src/schema.test.ts` (see above), run standalone and as part of the full suite.

**Commands and output:**

```
node --test src/schema.test.ts
```
```
ℹ tests 21
ℹ pass 21
ℹ fail 0
```

```
npm test
```
```
ℹ tests 71
ℹ pass 71
ℹ fail 0
```

```
npm run typecheck
```
```
> tsc --noEmit
(clean, no output)
```

**Commit:** `12b2f87` — test: add CompanyReport coverage for schema validators

## Issues or concerns

- The `Path` constructor-parameter-property fix (documented above) is the only place I deviated from the brief's literal code; it was necessary to make the code run at all under this project's stated runtime (Node 24 type-stripping forbids parameter properties, an explicit global constraint for this task). No test assertions or exported behavior changed.
- `validateCompanyReport` has no dedicated tests in this task's brief (only `validateAgentOutput`/`validateDailyVerdict` are imported/tested in `schema.test.ts`, per the brief's Step 2 code verbatim). It typechecks and was implemented in full per the brief's Step 4, but is currently only exercised by `tsc`, not by `node --test`. Flagging in case a later task expects `CompanyReport` tests to already exist — none were specified in this brief.
