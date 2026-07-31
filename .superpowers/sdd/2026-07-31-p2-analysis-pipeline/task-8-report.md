# Task 8 Report: `/daily` 슬래시 커맨드 + 엔드투엔드 실행

## What was created / edited

- **Created**: `.claude/commands/daily.md` — written verbatim from the brief's Step 1 markdown block.
- **Edited**: `docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md`
  - §4 table: replaced the `네이버 뉴스 (Claude Code MCP)` row with the three rows specified in the brief (Yahoo 종목 RSS, 연합뉴스 경제 RSS, struck-through 네이버 뉴스 MCP row noting the session has no such server).
  - §11 v1 description: replaced "Supabase MCP로 결과를 쓴다" with the file-based prepare → LLM → validated-publish description from the brief.

## Verification results

### 1. `package.json` script names (brief references `collect`, `prepare:bundle`, `candidates`, `publish:run`)

Actual `scripts` block:
```json
"scripts": {
  "test": "node --test",
  "typecheck": "tsc --noEmit",
  "collect": "node --env-file=.env src/bin/collect.ts",
  "smoke": "node --env-file=.env src/sources/smoke.ts",
  "universe": "node --env-file=.env src/bin/universe.ts",
  "prepare:bundle": "node --env-file=.env src/bin/prepare.ts",
  "candidates": "node --env-file=.env src/bin/candidates.ts",
  "publish:run": "node --env-file=.env src/bin/publish.ts"
}
```
All four names used in `daily.md` (`collect`, `prepare:bundle`, `candidates`, `publish:run`) match exactly. No typos.

### 2. `prompts/` filenames (brief references macro.md, allocation.md, country_sector.md, technical.md, news.md, fundamental.md, counter.md, synthesizer.md, company_report.md, plus README.md for shared rules)

Actual directory listing:
```
README.md
allocation.md
company_report.md
counter.md
country_sector.md
fundamental.md
macro.md
news.md
synthesizer.md
technical.md
```
All 9 agent-prompt filenames referenced in `daily.md`, plus `README.md`, exist verbatim. No mismatches.

### 3. `sector:`/`OW` convention vs `src/prepare.ts`'s `owSectorsFrom`

Actual code (`src/prepare.ts` lines 22-31):
```ts
// country_sector agent는 섹터 스탠스를 evidence에 `label: 'sector:<Yahoo섹터명>', value: 'OW'`
// 형태로 남긴다. 스크리너가 자유 서술을 파싱하지 않아도 되게 만든 계약이다.
export function owSectorsFrom(agents: AgentOutput[]): string[] {
  const cs = agents.find((a) => a.agent === 'country_sector')
  if (!cs) return []
  return cs.evidence
    .filter((e) => e.label.startsWith('sector:') && e.value.trim().toUpperCase() === 'OW')
    .map((e) => e.label.slice('sector:'.length).trim())
    .filter((s) => s.length > 0)
}
```
This confirms the gate language in `daily.md` step 3 — `evidence`에 `label: "sector:<섹터명>", value: "OW"` — matches the real parsing: label prefix `sector:`, value case/whitespace-insensitively equal to `OW`. Test file `src/prepare.test.ts` (lines 44-67) exercises exactly this contract, including whitespace variants (`'sector: Energy'`, `'OW '`). No mismatch.

Also checked `src/bin/candidates.ts:24` — the actual thrown error is:
```
country_sector agent가 OW 섹터를 하나도 남기지 않았습니다
```
`daily.md` step 4 paraphrases this as `OW 섹터가 하나도 없습니다` (not a verbatim string match). This is a loose description, not a grep target, and the brief's Step 1 text was to be transcribed verbatim, so it was left as-is. Noted here for the record — not treated as a defect requiring correction, since it doesn't affect the human's ability to recognize the failure (both mention "OW 섹터" and "없다/남기지 않다").

## `npm test` / `npm run typecheck`

- `npm test`: **82/82 passing**, 0 failures — matches the brief's expected count exactly.
- `npm run typecheck`: clean, no errors.

## Files changed

- `C:\Users\user\Desktop\jj-coding-projects\trading agent\.claude\commands\daily.md` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\docs\superpowers\specs\2026-07-31-multi-agent-trading-advisor-design.md` (two targeted edits, §4 and §11)

`git diff` on the design doc confirms exactly two hunks, both matching the brief's specified before/after text — no unrelated lines touched.

## Self-review findings

- Every script name in `daily.md` matches `package.json`: confirmed (`collect`, `prepare:bundle`, `candidates`, `publish:run`).
- Every prompt filename referenced matches an actual file in `prompts/`: confirmed (all 9 agent prompts + README.md).
- The `sector:`/`OW` language matches `src/prepare.ts`'s actual parsing: confirmed.
- The design doc's two edits are targeted, no unrelated content changed: confirmed via `git diff` — only the §4 row and §11 paragraph changed.

## Additional finding (out of this task's scope, flagged not fixed)

`docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md` §6.2 (Agent 목록 table), line 129, still reads:
```
| 5 | `news` | 네이버 뉴스 MCP + US RSS 헤드라인 | 심리 score + 핵심 이벤트 3개 |
```
This is the same stale "네이버 뉴스 MCP" premise the brief's Step 2 corrects in §4, but the brief scopes Step 2's edits explicitly to §4 and §11, and this task's Code Organization section says "Nothing else" beyond the two specified edits. Left untouched per scope; flagging here for a follow-up correction (should read something like `Yahoo 종목 RSS + 연합뉴스 경제 RSS + US 뉴스 RSS`).

## Issues / concerns

- **The brief's Step 4 (live `/daily` run) and Step 5 (Supabase verification query) were skipped, per explicit instruction from the task dispatcher.** Both `SUPABASE_SERVICE_ROLE_KEY` and `FRED_API_KEY` are empty in `.env`; every DB-touching script (`collect`, the DB-reading half of `prepare:bundle`, `publish:run`) fails at `db()` construction without the Supabase key, and `collect` also needs `FRED_API_KEY` for US macro data. This means **the full end-to-end `/daily` run — the thing that actually produces a `daily_verdicts` row and validates the whole pipeline in production conditions — remains unverified.** This is the single remaining item before Phase 2 (per §13's completion criterion: "실데이터 기반 `daily_verdicts` 1행 + `company_reports` 여러 행 생성") can be declared complete. It requires the human partner to supply both credentials, then a full manual (or supervised) `/daily` run plus the Step 5 SQL checks against project `jsxhcqnupvvctnjiaric`.
- A secondary, low-severity stale reference at §6.2 line 129 was found (see above) — out of scope for this task, flagged for follow-up. **Resolved in Fix round 1 below.**

## Fix round 1 (coordinator review)

The coordinator's task review approved everything, with one Important finding: the §6.2 stale reference flagged above in "Additional finding" was ruled in-scope and required a fix now, not a deferred follow-up — leaving it would mean a reader jumping straight to §6.2 gets the wrong answer about what `news` consumes, since the §4 strikethrough doesn't get re-read from there.

**Change made** — `docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md` §6.2, agent table, `news` row:

```diff
-| 5 | `news` | 네이버 뉴스 MCP + US RSS 헤드라인 | 심리 score + 핵심 이벤트 3개 |
+| 5 | `news` | Yahoo 종목 RSS + 연합뉴스 경제 RSS + US 뉴스 RSS | 심리 score + 핵심 이벤트 3개 |
```

This matches the actual sources named in the §4 edit and Task 1's build.

**Re-verification**: ran `grep -n "네이버\|MCP"` over the full design doc. Only remaining hit:

```
60:| ~~네이버 뉴스 MCP~~ | **세션에 그런 서버가 없다.** 설계 시점의 전제가 틀렸음 | 사용하지 않음 | — |
```

This is the intentional struck-through §4 row documenting the removed source — correct to keep. Zero stale (non-struck-through) references remain.

No test suite applies (docs-only change). Committed as `342031c` "docs: fix stale news-source reference in agent table (§6.2)".

Per the coordinator's explicit instruction, `daily.md` was **not** touched this round — the reviewer's three noted clarity gaps (OW-failure error string not verbatim, no instruction for `synthesizer` to set `verdict.date`, ambiguous precedence between queued report requests and the top-5 picks cap) are deferred to the ledger for the final whole-branch review to triage.
