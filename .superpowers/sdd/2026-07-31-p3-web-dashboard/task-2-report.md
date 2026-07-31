# Task 2 Report — 타입 + 조회/포맷 순수 함수 (TDD)

## What I implemented

- `web/lib/types.ts` — `AgentOutput`, `DailyVerdict`, `CompanyReport`, copied verbatim from the brief. Cross-checked every field name against the root project's actual `src/types.ts` (the single source of truth for the DB's jsonb shapes) — identical, no mismatch.
- `web/lib/format.ts` — `equityWeightLabel`, `signalLabel`, `stanceClassName`, `scoreGaugeColor`, verbatim from the brief.
- `web/lib/format.test.ts` — 6 tests, verbatim from the brief.
- `web/lib/queries.ts` — `getLatestPublishedVerdict`, `getVerdictHistory`, `historyPoint`, `isPublished`, `getAgentReports`, `getLatestCompanyReport`. Same signatures, same query logic, same error messages as the brief, but with one structural change (see "Deviation" below).
- `web/lib/queries.test.ts` — 1 test (`historyPoint`), verbatim from the brief.

## Deviation from the brief (disclosed, not silent)

**`queries.ts`'s Supabase import is lazy, not static top-level, as the brief specified.**

The brief's `queries.ts` has `import { supabase } from './supabase.ts'` at the top. `web/lib/supabase.ts` (Task 1) throws synchronously at module-evaluation time if `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset — which they are in this repo right now (Task 1 deliberately shipped only `.env.local.example` with a blank key, since credentials aren't provisioned yet).

Running `queries.test.ts` verbatim crashed before any test ran:
```
Error: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다
    at file:///.../web/lib/supabase.ts:7:9
```
This isn't a network-access issue — `historyPoint` never touches Supabase — it's ESM evaluation order: dependencies (`supabase.ts`) evaluate before the importing module's own code, so no env-var stub placed inside `queries.test.ts` can run early enough to prevent the throw. The only fixes were: (a) real or dummy env vars supplied from outside the file (shell/CI/`--env-file`), which would require touching `package.json`, out of this task's scope, or (b) stop requiring `supabase.ts` to load until a DB call is actually made.

I took (b): `queries.ts` now has a small `client()` helper that does `const { supabase } = await import('./supabase.ts')` and each of the five async functions calls `const supabase = await client()` before its query. `historyPoint` is untouched and still fully pure/synchronous. Behavior, signatures, and error messages for all five DB functions are identical to the brief — only *when* `supabase.ts` is loaded changed (lazily, on first real call, instead of eagerly at import).

This keeps "tests run with zero network access, pristine output" true without fabricating credentials or touching files outside this task's list.

## Second blocker found and fixed: `web/tsconfig.json` missing `allowImportingTsExtensions`

Task 1's `web/tsconfig.json` doesn't set `allowImportingTsExtensions`. The root project's `tsconfig.json` does (`"allowImportingTsExtensions": true`), for the exact same reason: this codebase's convention is relative imports with an explicit `.ts` extension (matches Node's native ESM resolution, which requires it). The moment any file does a *value* import like `import { historyPoint } from './queries.ts'` (as `queries.test.ts` and `format.test.ts` both do, verbatim from the brief), `tsc` fails with:
```
error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.
```
This isn't something I introduced — the brief's own verbatim `queries.ts` (`import { supabase } from './supabase.ts'`) would have hit the same error. It's a gap in Task 1's scaffolding that only surfaces once Task 2 adds the first cross-file `.ts` imports. Fix: added the single missing compiler option to `web/tsconfig.json`, mirroring root's already-established precedent. `noEmit: true` (required for the flag) was already set, so this is a safe, additive, one-line change.

## TDD Evidence

**RED (format.ts missing)** — `cd web && npm test`:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../web/lib/format.ts' imported from .../web/lib/format.test.ts
✖ lib\format.test.ts (476.8969ms)
ℹ tests 1 / pass 0 / fail 1
```
Expected and correct — `format.ts` didn't exist yet.

**GREEN (format.ts implemented)** — `cd web && npm test`:
```
✔ equityWeightLabel은 [하한,상한]을 "60-70%"로 표시한다
✔ equityWeightLabel은 하한==상한이면 단일 숫자로 표시한다
✔ signalLabel은 세 신호를 각각 다른 문구/색으로 매핑한다
✔ stanceClassName은 OW/N/UW를 서로 다른 클래스로 매핑한다
✔ scoreGaugeColor는 50 미만/이상에서 다른 색을 낸다
✔ scoreGaugeColor는 0-100 경계에서 던지지 않는다
ℹ tests 6 / pass 6 / fail 0
```

**RED (queries.ts missing)** — `cd web && npm test`:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../web/lib/queries.ts' imported from .../web/lib/queries.test.ts
✖ lib\queries.test.ts (562.7571ms)
ℹ tests 7 / pass 6 / fail 1
```
Expected and correct — `queries.ts` didn't exist yet (format tests still green from before).

**Intermediate RED (queries.ts exists, verbatim static import — caught the env-var blocker)**:
```
Error: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다
    at file:///.../web/lib/supabase.ts:7:9
ℹ tests 7 / pass 6 / fail 1
```
This is the real defect described above, not the expected "queries.ts implemented, tests pass" outcome — led to the lazy-import fix.

**GREEN (queries.ts implemented with lazy import)** — `cd web && npm test`:
```
✔ equityWeightLabel은 [하한,상한]을 "60-70%"로 표시한다
✔ equityWeightLabel은 하한==상한이면 단일 숫자로 표시한다
✔ signalLabel은 세 신호를 각각 다른 문구/색으로 매핑한다
✔ stanceClassName은 OW/N/UW를 서로 다른 클래스로 매핑한다
✔ scoreGaugeColor는 50 미만/이상에서 다른 색을 낸다
✔ scoreGaugeColor는 0-100 경계에서 던지지 않는다
✔ historyPoint는 {date, verdict}를 {date, score}로 요약한다
ℹ tests 7 / pass 7 / fail 0
```

## `npm test` / `npm run typecheck` results (from inside `web/`)

```
> npm test
ℹ tests 7
ℹ pass 7
ℹ fail 0

> npm run typecheck
> tsc --noEmit
(no output — clean)
```

Non-blocking cosmetic warning present in `npm test` stderr (pre-existing, not introduced by this task): Node prints `[MODULE_TYPELESS_PACKAGE_JSON]` because `web/package.json` has no `"type": "module"`. This doesn't fail anything and reparsing still succeeds; fixing it would mean touching `package.json`, which is outside this task's file list, and could have build-config side effects I didn't want to risk for a warning-only issue. Flagging it here rather than silently leaving it unmentioned.

## Files changed

- `web/lib/types.ts` (new)
- `web/lib/format.ts` (new)
- `web/lib/format.test.ts` (new)
- `web/lib/queries.ts` (new)
- `web/lib/queries.test.ts` (new)
- `web/tsconfig.json` (modified — added `"allowImportingTsExtensions": true`, one line, out of the task's stated file list but required for `npm run typecheck` to pass at all; disclosed above)

## Self-review findings

- Completeness: every type, every export, every test from the brief is present with the brief's exact signatures.
- Correctness:
  - `equityWeightLabel([65, 65])` → `'65%'` (equal-bounds case handled, tested).
  - `signalLabel`'s three signals (`increase`/`hold`/`reduce`) each get a genuinely distinct `className` (emerald / neutral / rose), not just distinct text.
  - All five `queries.ts` DB functions throw `new Error(...)` with a descriptive, table-specific message on a Supabase error — never swallowed.
  - `getLatestPublishedVerdict`, `getVerdictHistory`, `getAgentReports`, `getLatestCompanyReport` all return `null`/`[]` on an empty result set via `data?.[0]` / `data ?? []` — never throw for "no rows," matching the DB's current real (empty) state.
  - Verified `daily_verdicts` RLS policy (`supabase/migrations/0001_trading_agent_schema.sql`) restricts anon `SELECT` to `published = true` rows only — so `getLatestPublishedVerdict`/`getVerdictHistory` correctly rely on RLS rather than needing an explicit `.eq('published', true)` filter in the query itself. No mismatch between function name and behavior.
- Discipline: no speculative helpers, no extra exports beyond what the brief lists.
- Testing: `npm test` runs 7/7 green with zero network access (verified the lazy-import fix specifically closes this gap) and no code touches `web/app/*`.

## Issues or concerns

1. `web/tsconfig.json` modified (see above) — required for `npm run typecheck` to pass; without it, even the brief's own verbatim code would fail typecheck. Minimal, additive, matches root project's precedent exactly.
2. `queries.ts`'s Supabase import is lazy (dynamic `import()` inside a `client()` helper) instead of the brief's static top-level import — required to keep `queries.test.ts` free of network/credential dependency. Behavior and all five function signatures/error messages are unchanged from the brief.
3. Cosmetic-only: `MODULE_TYPELESS_PACKAGE_JSON` warning on `npm test` stderr, pre-existing from Task 1's `package.json`, not fixed (out of scope, no functional impact).

None of these affect correctness of the five documented functions or the DB schema field names, which were verified to match the root project's `src/types.ts` exactly.

## Fix round 1 (after review)

**Finding:** the reviewer traced the dynamic-import workaround to its actual root cause — `web/lib/supabase.ts` (Task 1) constructed its client eagerly at module load (`export const supabase = createClient(url, key)`), throwing immediately on missing env vars. The repo already had the correct pattern for this one file over: `src/db.ts`'s lazy, memoized `db()` factory — throws only when actually called, not at import. `web/lib/supabase.ts` should have used that shape from the start.

**What changed:**
- `web/lib/supabase.ts` — rewritten as a lazy, memoized factory:
  ```ts
  let client: SupabaseClient | null = null
  export function getSupabase(): SupabaseClient {
    if (client) return client
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다')
    client = createClient(url, key)
    return client
  }
  ```
- `web/lib/queries.ts` — reverted the per-function dynamic `await import('./supabase.ts')` workaround. Now a normal static `import { getSupabase } from './supabase.ts'` at the top; each of the five functions calls `getSupabase()` (synchronous, no `await`) instead of the removed `client()` helper.
- Grepped `web/` for any other reference to the old `supabase` named export — only `queries.ts` referenced it (no later task exists yet), now updated.

**Commands and output:**

`cd web && npm test`:
```
✔ equityWeightLabel은 [하한,상한]을 "60-70%"로 표시한다
✔ equityWeightLabel은 하한==상한이면 단일 숫자로 표시한다
✔ signalLabel은 세 신호를 각각 다른 문구/색으로 매핑한다
✔ stanceClassName은 OW/N/UW를 서로 다른 클래스로 매핑한다
✔ scoreGaugeColor는 50 미만/이상에서 다른 색을 낸다
✔ scoreGaugeColor는 0-100 경계에서 던지지 않는다
✔ historyPoint는 {date, verdict}를 {date, score}로 요약한다
ℹ tests 7 / pass 7 / fail 0
```

`cd web && npm run typecheck`:
```
> tsc --noEmit
(no output — clean)
```

Same safety property preserved (no throw at import time, `historyPoint`'s test still runs without `.env.local`), now matching the codebase's own established idiom instead of a second bespoke pattern. Net diff: `queries.ts` down to one clean import line instead of five `await import()` call sites.

Committed as a follow-up commit (see git log).
