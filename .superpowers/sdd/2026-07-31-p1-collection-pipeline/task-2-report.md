# Task 2 Report: Supabase 스키마 + RLS + DB 쓰기 모듈

## What I implemented

1. **Migration** `supabase/migrations/0001_trading_agent_schema.sql` — applied verbatim via Supabase MCP `apply_migration` (project `jsxhcqnupvvctnjiaric`, migration name `trading_agent_schema`) then saved to disk as the record of what was applied. Creates 6 tables (`market_snapshots`, `agent_reports`, `daily_verdicts`, `company_reports`, `report_requests`, `universe`), 4 indexes, enables RLS on all 6 new tables, and adds the 5 policies specified in the brief (4 anon-read policies + 1 anon-insert-only policy on `report_requests`). `market_snapshots` intentionally gets no anon policy.
2. **`src/db.ts`** — exactly the three exports specified: `db()`, `kstDate()`, `upsertSnapshot(kind, date, payload)`. Imports `SnapshotKind` from `./types.ts` (type-only import), no redefinition. `upsertSnapshot` uses `onConflict: 'date,kind'` matching the `unique (date, kind)` constraint.
3. **`.env`** — created by copying `.env.example`; `SUPABASE_SERVICE_ROLE_KEY` left empty (human partner to supply). Confirmed git-ignored.

## What I verified (actual tool output)

**Pre-migration `list_tables`** (project_id `jsxhcqnupvvctnjiaric`, schemas `["public"]`) — confirmed only the 6 pre-existing tables existed, all belonging to the other app, none named the same as my new tables:
```
todos, daily_market, credit_split_raw, analysis_snapshot, ai_commentary, lending_balance_raw
```
No naming collisions → safe to proceed additively.

**`apply_migration`** → `{"success":true}`

**Post-migration `list_tables`**:
```json
{"tables":[
 {"name":"public.todos","rls_enabled":true,"rows":4},
 {"name":"public.daily_market","rls_enabled":true,"rows":4325},
 {"name":"public.credit_split_raw","rls_enabled":true,"rows":1619},
 {"name":"public.analysis_snapshot","rls_enabled":true,"rows":4},
 {"name":"public.ai_commentary","rls_enabled":true,"rows":1},
 {"name":"public.lending_balance_raw","rls_enabled":true,"rows":0},
 {"name":"public.market_snapshots","rls_enabled":true,"rows":0},
 {"name":"public.agent_reports","rls_enabled":true,"rows":0},
 {"name":"public.daily_verdicts","rls_enabled":true,"rows":0},
 {"name":"public.company_reports","rls_enabled":true,"rows":0},
 {"name":"public.report_requests","rls_enabled":true,"rows":0},
 {"name":"public.universe","rls_enabled":true,"rows":0}
]}
```
All 6 new tables present with `rls_enabled: true`. All 6 pre-existing tables untouched (same names, same row counts as before).

**`get_advisors` (type `security`)**:
```json
{"lints":[
  {"name":"rls_enabled_no_policy","level":"INFO",
   "detail":"Table `public.market_snapshots` has RLS enabled, but no policies exist"},
  {"name":"rls_policy_always_true","level":"WARN",
   "detail":"Table `public.report_requests` has an RLS policy `anon_insert_report_request` for `INSERT` that allows unrestricted access (WITH CHECK clause is always true). This effectively bypasses row-level security for anon."},
  {"name":"auth_leaked_password_protection","level":"WARN",
   "detail":"Leaked password protection is currently disabled."}
]}
```
Assessment: the first two are the *intended* design from the brief — `market_snapshots` deliberately has no anon policy (raw data stays private, service_role bypasses RLS), and `report_requests` deliberately allows open anon INSERT (web visitors requesting a report) with no select/update. No table shows an "RLS disabled" warning. The third (leaked password protection) is a pre-existing project-level Auth setting unrelated to this migration — not caused by my changes, out of scope for this task.

**`.env` git-ignore check**: `git check-ignore .env` → printed `.env` (confirmed ignored).

**`src/db.ts` sanity check** (no network, key intentionally empty):
```
exports: [ 'db', 'kstDate', 'upsertSnapshot' ]
kstDate(): 2026-07-31
db() threw as expected: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다
```
Confirms the module parses under Node 24 type stripping, exports the three required functions, `kstDate()` returns `YYYY-MM-DD` in KST, and `db()` fails closed when the key is missing rather than silently proceeding.

**Step 6 (live round-trip)**: SKIPPED. `SUPABASE_SERVICE_ROLE_KEY` in `.env` was still empty at the time this task ran — checked programmatically (only presence/length, never printed the value). Per the task's exception instructions, I did not fail the task over this; the controller is obtaining the key from the human in parallel and will run the round-trip check separately.

## Files changed

- `supabase/migrations/0001_trading_agent_schema.sql` (new, committed)
- `src/db.ts` (new, committed)
- `.env` (new, NOT committed — git-ignored, key left empty)

## Self-review

- **Completeness**: all 6 tables, all 4 indexes, all 6 RLS enables, all 5 policies present — matches brief exactly. `db.ts` exports exactly `db()`, `kstDate()`, `upsertSnapshot()` with the brief's signatures, nothing extra.
- **Correctness**: applied schema matches the saved migration file (same SQL used for both). `upsertSnapshot` uses `onConflict: 'date,kind'`, matching the `unique (date, kind)` constraint on `market_snapshots` — reruns of a day's collection will update, not duplicate.
- **Discipline**: no extra tables, no extra policies, no speculative helper functions in `db.ts` beyond the three required exports. No new dependencies added.
- **Security**: `git show HEAD | grep` for key-like strings found only the variable name `SUPABASE_SERVICE_ROLE_KEY` referenced in code/comments — no actual key value anywhere in the committed diff. `.env` confirmed ignored and unstaged throughout (`git status --porcelain --ignored` showed `!! .env`).

## Issues or concerns

- Step 6's live round-trip (actual insert/select/delete against `market_snapshots` via the service-role key) is **unverified** — blocked on the human supplying `SUPABASE_SERVICE_ROLE_KEY`. Everything else (migration applied, schema verified via `list_tables`, security posture verified via `get_advisors`, module parse-checked) is verified.
- The pre-existing `auth_leaked_password_protection` WARN is unrelated to this task and was not addressed (out of scope — it's a project Auth setting, not part of the schema/RLS work here).
