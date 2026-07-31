# Final consolidated fix pass — branch review findings

Branch: `p2-analysis`. All five findings fixed in the order given, tests added, `npm test` and `npm run typecheck` both pristine.

## Critical 2 — empty universe silently publishes a zero-pick verdict

**(a) `src/bin/candidates.ts`**
- Line 27-33: added a guard right after `readUniverse(ow)` — throws if `universe.length === 0`, naming the OW sectors and pointing at `npm run universe`.
- Line 49-51 (after the edit): added a guard right after `scoreCandidates(top24, funds, 12)` — throws if `candidates.length === 0`.

Both guards are plain fail-fast throws inside the existing `try { ... } catch (e) { console.error(...); process.exit(1) }` wrapper, so they surface as a normal CLI failure with a clear Korean message — exactly the existing error-handling convention in this file.

**(b) `src/schema.ts:130`**
- `validateDailyVerdict`'s `picks` array now requires `{ min: 1 }`:
  `picks: arr(o.picks, p.child('picks'), { min: 1 }).map(...)`.
  This is the backstop: even if an empty-picks verdict reached `publish:run` through some other path, it now fails schema validation before any DB write.

**Test added** (`src/schema.test.ts`, after the "market이 KR/US" pick test):
```ts
test('picks가 비면 거부 — 빈 검증(zero-pick) verdict는 통과시키지 않는다', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, picks: [] }), /picks/)
})
```
This breaks if the `{ min: 1 }` constraint is removed or the min is set to 0.

**Side effect caught during testing:** `src/publish.test.ts`'s `verdict` fixture previously had `picks: []`. With the new minimum, that fixture became invalid and every test using it (`splitOutputs는 세 종류를 나눠 담는다`, the two new agents/company_reports tests, etc.) would fail. Fixed the fixture to include one valid pick object (same shape as `schema.test.ts`'s `goodVerdict.picks[0]`, ticker `AAPL`). This is a fixture correction, not a scope creep — the old fixture was only ever "valid" because the bug we're fixing let it be.

## Important 3 — `splitOutputs` didn't validate `company_reports` shape, and the `agents` check lived only in the bin script

**`src/publish.ts:13-18`** — `splitOutputs` now throws before defaulting either field to `[]`:
```ts
if (o.agents !== undefined && !Array.isArray(o.agents)) {
  throw new Error('LLM 출력: agents 필드가 배열이 아닙니다')
}
if (o.company_reports !== undefined && !Array.isArray(o.company_reports)) {
  throw new Error('LLM 출력: company_reports 필드가 배열이 아닙니다')
}
```
This is the new trust boundary — testable, since `splitOutputs` is exported and covered by `publish.test.ts`.

**`src/bin/publish.ts:15-22`** — removed the standalone `agents-b.json의 agents 필드가 배열이 아닙니다` throw and its silent-default ternary. Kept the `agents-a.json`-top-level check (that one is NOT redundant — see trace-through below). Restructured the merge so a malformed `b.agents` flows through to `splitOutputs` unmodified instead of being silently coerced to `[]`:
```ts
const merged = {
  ...b,
  agents: Array.isArray(b.agents) ? [...a, ...b.agents] : b.agents === undefined ? a : b.agents,
}
```

**Tests added** (`src/publish.test.ts`, after the "company_reports가 없으면 빈 배열" test):
```ts
test('splitOutputs는 agents가 배열이 아니면 거부', () => {
  assert.throws(() => splitOutputs({ agents: {}, verdict }), /agents/)
})

test('splitOutputs는 company_reports가 배열이 아니면 거부', () => {
  assert.throws(() => splitOutputs({ agents: [agent], verdict, company_reports: {} }), /company_reports/)
})
```
These break if the two new `Array.isArray` guards in `splitOutputs` are removed or their throw messages stop matching `/agents/` / `/company_reports/`.

### Trace-through: `src/bin/publish.ts` on a normal, valid two-file publish run
- `a` = parsed `agents-a.json`, a valid array of raw stage-A agent outputs → `Array.isArray(a)` true, guard passes.
- `b` = parsed `agents-b.json`, e.g. `{ agents: [...raw stage-B outputs], verdict: {...}, company_reports: [...] }`.
- `Array.isArray(b.agents)` is true → `merged.agents = [...a, ...b.agents]`, a genuine array combining both stages (identical to the old behavior).
- `merged.verdict` / `merged.company_reports` come straight from `b` via the spread.
- `splitOutputs(merged)`: top-level is an object, `verdict` is present, `agents` and `company_reports` are both arrays → both new guards no-op, falls through to `.map(validateAgentOutput)` / `validateDailyVerdict` / `.map(validateCompanyReport)` exactly as before.
- Result: `{ agents, verdict, reports }` unchanged from pre-fix behavior on the happy path. `writeAgentReports` / `writeDailyVerdict` / `writeCompanyReports` / `markRequestsFulfilled` all run as before.

Confirmed: no behavior change on a valid run; only the malformed-shape paths changed (now centralized in `splitOutputs`, and `company_reports` is newly covered).

### Import-cycle / redundancy note
The `agents-a.json` top-level check in `src/bin/publish.ts` was deliberately **kept**, because `splitOutputs` never receives raw `a` on its own — by the time `splitOutputs` runs, `a`'s contents are already concatenated into `merged.agents`. If `a` isn't an array, `[...a, ...b.agents]` throws an unhelpful native `TypeError` at spread time, before `splitOutputs` ever runs. That check is not duplicated by anything in `splitOutputs`, so removing it would trade a clear Korean error for a native `not iterable` crash — it's not a "duplicate check," so it stays.

## Important 4 — `generated_at` not validated as a real date before Postgres `date` slice

**`src/schema.ts:180-187`** — `validateCompanyReport`'s `generated_at` field now runs an IIFE (matching the existing style used for the `verdict` field a few lines down in the same function) that calls `str()` and then checks the first 10 characters against `/^\d{4}-\d{2}-\d{2}/`, using the same `Path`/`.fail()` convention as `isoDate`:
```ts
generated_at: (() => {
  const gp = p.child('generated_at')
  const generated_at = str(o.generated_at, gp)
  if (!/^\d{4}-\d{2}-\d{2}/.test(generated_at)) {
    gp.fail(`ISO 8601 날짜로 시작해야 함 (받은 값: ${generated_at})`)
  }
  return generated_at
})(),
```
Didn't reuse `isoDate` directly since that helper anchors the pattern with `$` (requiring the whole string to be exactly `YYYY-MM-DD`), which would reject a full ISO timestamp like `2026-07-31T00:00:00.000Z`. This check only anchors the start (`^`), matching the finding's stated requirement.

**Test added** (`src/schema.test.ts`, right before the `week52.position` test):
```ts
test('generated_at이 ISO 8601 날짜로 시작하지 않으면 거부', () => {
  assert.throws(() => validateCompanyReport({ ...goodReport, generated_at: 'not a date' }), /generated_at/)
})
```

## Important 5 — `owSectorsFrom` normalized OW case but not sector-name case

**`src/prepare.ts`**
- Added `import { SECTOR_BY_ETF } from './universe.ts'` and a `canonicalSector(raw: string): string` helper that case-insensitively matches against `Object.values(SECTOR_BY_ETF)` (the 11 real sector names) and throws naming the bad value if no match is found.
- `owSectorsFrom` now maps every extracted sector name through `canonicalSector(...)` before returning, so `"technology"` → `"Technology"`, and an unknown name like `"Widgets"` throws loudly instead of silently producing zero DB rows.

**Import-cycle check**: read `src/universe.ts` fully — its only imports are `./sources/yahoo.ts` and `./types.ts`; it does not import `./prepare.ts` (directly or via `sources/yahoo.ts`, which itself has no such import). Confirmed via `grep -rn "from '.*prepare"` across `src/` — only `prepare.test.ts`, `bin/candidates.ts`, and `bin/prepare.ts` import from `prepare.ts`; `universe.ts` is not among them. No cycle.

**Tests added** (`src/prepare.test.ts`, before the existing "country_sector가 없거나" test):
```ts
test('owSectorsFrom은 섹터명을 대소문자 구분 없이 정규화한다', () => {
  const cs = agent('country_sector', {
    evidence: [{ label: 'sector:technology', value: 'OW', source: 's' }],
  })
  assert.deepEqual(owSectorsFrom([cs]), ['Technology'])
})

test('owSectorsFrom은 알 수 없는 섹터명이면 던진다', () => {
  const cs = agent('country_sector', {
    evidence: [{ label: 'sector:Widgets', value: 'OW', source: 's' }],
  })
  assert.throws(() => owSectorsFrom([cs]), /Widgets/)
})
```
Verified the two *existing* `owSectorsFrom` tests (exact-case `'Technology'`/`'Energy'`, and the mixed-case `'ow'`/`'Ow'` test) still pass unmodified — all their sector names (`Technology`, `Energy`, `Utilities`) are already exact matches in `SECTOR_BY_ETF`'s values, so `canonicalSector` is a no-op for them. The "no OW / no country_sector" test uses a `UW` value, which is filtered out before `canonicalSector` is ever called, so it's unaffected too.

## Test run

```
npm test
...
ℹ tests 88
ℹ suites 0
ℹ pass 88
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
Pristine — no warnings, no `console.error` noise, all 88 tests pass (82 pre-existing + 6 new: 2 in `schema.test.ts` for `picks`/`generated_at`, 2 in `publish.test.ts` for `agents`/`company_reports` shape, 2 in `prepare.test.ts` for sector canonicalization).

```
npm run typecheck
> tsc --noEmit
```
Clean, no output, exit 0.

## Confirmations requested in the task

- **Import cycle**: confirmed none — `src/universe.ts` has no import of `src/prepare.ts`, directly or transitively through `src/sources/yahoo.ts`.
- **`src/bin/publish.ts` trace-through**: confirmed above — a normal valid two-file run produces byte-identical `merged`/`agents`/`verdict`/`reports` values to the pre-fix code path; only malformed-shape handling changed, and it improved (now also catches malformed `company_reports`, and centralizes the `agents` shape check in the tested `splitOutputs` function).

## Concerns

- None found that block this fix pass. The `agents-a.json` top-level `Array.isArray` check remains in `src/bin/publish.ts` by design (see Important 3 above) — flagging it here explicitly in case the reviewer expected it fully removed; I judged removing it would trade a clear error for an ugly native crash with no corresponding coverage in `splitOutputs`, so I kept it.
- Did not touch `CompanyReport.snapshot`'s data-source gap (Critical 1) or any of the explicitly out-of-scope items — verified no stub/placeholder was added anywhere in `daily.md`, `BundleB`, or `company_report.md`.
- `SUPABASE_SERVICE_ROLE_KEY` / `FRED_API_KEY` remain empty in `.env`, untouched; nothing in this pass calls `db()` outside the existing bin scripts, and no test exercises live Supabase (confirmed via `npm test` output — no network/DB test present).
