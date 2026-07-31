# Task 7 Report: agent 프롬프트 9개

## What was created

`prompts/README.md` plus nine agent prompt files, all copied verbatim from
`task-7-brief.md`:

- `prompts/macro.md`
- `prompts/allocation.md`
- `prompts/country_sector.md`
- `prompts/technical.md`
- `prompts/news.md`
- `prompts/fundamental.md`
- `prompts/counter.md`
- `prompts/synthesizer.md`
- `prompts/company_report.md`

No code files were touched.

## Verification results

### 1. `features.*` path check against `src/types.ts` FeatureSet

The brief's `grep -o "features\.[a-zA-Z_.\[\]0-9']*"` command was run but
produced no output — the installed grep/pattern in this shell doesn't handle
that regex against multi-line prompt content as expected (also confirmed via
the Grep tool, whose regex engine choked on `^` inside `['^GSPC']` bracket
expressions, a tool quirk unrelated to the file content). I fell back to a
manual, file-by-file extraction of every `features.*` reference and checked
each by hand against the `FeatureSet` type in `src/types.ts` (lines 53-70).

Paths found and their status (all REAL):

| File | Path | Real on FeatureSet? |
|---|---|---|
| macro.md | `features.macro.curve2s10s` | yes (macro.curve2s10s) |
| macro.md | `features.macro` ...`curve3m10y` (bare) | yes |
| macro.md | `features.macro.cpiYoY` | yes |
| macro.md | ...`coreCpiYoY` (bare) | yes |
| macro.md | `features.macro.unrate` | yes |
| macro.md | `features.macro.hySpread` | yes |
| macro.md | `features.regime.vixLevel` | yes |
| macro.md | ...`vixTerm` (bare) | yes |
| macro.md | `features.regime.usdkrw` | yes |
| macro.md | ...`usdkrwChange20d` (bare) | yes |
| macro.md | `features.macro.available` | yes (MacroBlock.available) |
| macro.md | `features.missing` | yes |
| allocation.md | `features.assets['^GSPC']` / `['^KS11']` | yes (Record<string, AssetFeature>) |
| allocation.md | ...`distSma200`, `distSma60`, `realizedVol20`, `mom12_1` | yes (AssetFeature fields) |
| allocation.md | `features.regime.breadth` | yes |
| country_sector.md | `features.relative.krVsUs3m` | yes |
| country_sector.md | `features.relative.sectors` | yes ({etf, rel3m}[]) |
| country_sector.md | `features.relative.sectors[0].rel3m` | yes |
| country_sector.md | `features.regime.usdkrw`, `usdkrwChange20d` | yes |
| country_sector.md | `features.foreignRatioSamsung` | yes |
| country_sector.md | `features.assets` ...`distSma200`, `rsi14` | yes |
| technical.md | `features.assets['^GSPC']`/`['^IXIC']`/`['^KS11']`/`['^KQ11']` | yes |
| technical.md | ...`distSma20`, `distSma60`, `distSma200`, `rsi14`, `macdHist`, `realizedVol20`, `week52Position`, `ret1m`, `ret3m` | yes, all AssetFeature fields |
| synthesizer.md | `features.missing` | yes |
| README.md | `features.macro.curve2s10s`, `features.regime.vixTerm`, `features.missing` | yes |
| README.md | `candidates[3].roe` (example, not features.*) | yes, Candidate.roe real |
| README.md | `news.korea[2].title` (example, not features.*) | yes, NewsItem.title real |

`news.md` and `counter.md` reference no `features.*` paths (by design —
news.md uses `news.market`/`news.korea` which are `BundleA.news` fields, not
`features`; counter.md refers generically to prior agent outputs).
`fundamental.md` references `candidates[].*` fields (roe, operatingMargin,
forwardPE, priceToBook, yearChangePct, turnover, sector, market, score, tech.*)
— all checked against `Candidate` and `CandidateTech` in `src/types.ts` and
confirmed real. `company_report.md` references `snapshot.week52.position` —
confirmed real against `CompanyReport.snapshot.week52.position`.

No mismatches found. Zero `features.*` (or candidate/snapshot) paths needed
correction.

### 2. Agent name cross-check against `src/prepare.ts`

`src/prepare.ts` defines:
```
agents_to_run: ['macro', 'allocation', 'country_sector', 'technical', 'news']   // buildBundleA
agents_to_run: ['fundamental', 'counter', 'synthesizer', 'company_report']       // buildBundleB
```

All nine prompt files and the README use exactly these nine strings
throughout (`macro`, `allocation`, `country_sector`, `technical`, `news`,
`fundamental`, `counter`, `synthesizer`, `company_report`) with no typos or
variant spellings. `synthesizer.md`'s driver-agent list
(`macro, allocation, country_sector, technical, news, fundamental`) is a
subset of the same set. Confirmed consistent.

### 3. Sector/ETF table cross-check against `src/universe.ts`

`SECTOR_BY_ETF` in `src/universe.ts` (lines 24-36):
```
XLK: Technology, XLF: Financial Services, XLE: Energy, XLV: Healthcare,
XLI: Industrials, XLY: Consumer Cyclical, XLP: Consumer Defensive,
XLU: Utilities, XLB: Basic Materials, XLRE: Real Estate,
XLC: Communication Services
```
(11 entries)

`prompts/country_sector.md`'s "ETF ↔ 섹터 대응" table:
```
XLK=Technology, XLF=Financial Services, XLE=Energy, XLV=Healthcare,
XLI=Industrials, XLY=Consumer Cyclical, XLP=Consumer Defensive,
XLU=Utilities, XLB=Basic Materials, XLRE=Real Estate,
XLC=Communication Services
```
(11 entries)

Exact match — same tickers, same sector names, same count of 11.

## Files changed

- `prompts/README.md` (new)
- `prompts/macro.md` (new)
- `prompts/allocation.md` (new)
- `prompts/country_sector.md` (new)
- `prompts/technical.md` (new)
- `prompts/news.md` (new)
- `prompts/fundamental.md` (new)
- `prompts/counter.md` (new)
- `prompts/synthesizer.md` (new)
- `prompts/company_report.md` (new)

Commit: `6f8505d` — "docs: add agent prompts with evidence-path contract"

## Self-review findings

- Completeness: all ten files exist (README + 9 prompts). Confirmed via git
  commit output (10 files changed, all `create mode`).
- Correctness: every `features.*` path traced manually to `FeatureSet` in
  `src/types.ts` — all real. Every agent name traced to `agents_to_run` in
  `src/prepare.ts` — all match exactly, no typos. Sector/ETF table traced to
  `SECTOR_BY_ETF` in `src/universe.ts` — exact match, 11/11.
  DailyVerdict/CompanyReport field references in synthesizer.md and
  company_report.md (`counter_case`, `drivers.agent/weight`, `invalidation`,
  `picks.ticker/name/market/sector/scores.tech/fund/news/risk`,
  `sectors.etf`, `disclaimer`, `snapshot.week52.position`, `verdict.one_liner`,
  `verdict.confidence`, `generated_at`) were also checked against the
  `DailyVerdict` and `CompanyReport` types in `src/types.ts` — all real.
- Discipline: no code files touched, only `prompts/` created, matching the
  task's Code Organization constraint.

## Issues or concerns

None found. The brief's prompt text was already internally consistent with
the current `src/types.ts`, `src/prepare.ts`, and `src/universe.ts` — no
field-path or naming defects were discovered during verification.

## Fix round 1

Task review found: `prompts/synthesizer.md` never instructed the model to
populate `DailyVerdict.countries`, a required field (`validateDailyVerdict`
enforces `min: 1`), even though `country_sector.md` already emits
`country:KR`/`country:US` OW/N/UW evidence for exactly that purpose. Every
real run would have failed schema validation on `countries` unless the model
inferred the need unprompted. My original verification checked every
`features.*` path and every DailyVerdict field *mentioned* in the prompt
files, but didn't check the inverse — whether every *required* DailyVerdict
field was mentioned somewhere. That gap is what let this through.

**Change:** inserted a new bullet 5 in `synthesizer.md`'s "반드시 지킬 것" list
(renumbering the old 5-6 to 6-7):

```
5. `countries`는 `country_sector` agent의 evidence 중 `country:KR`/`country:US` 라벨에서 그대로 가져온다.
   라벨의 `KR`/`US`가 `code`, evidence의 `value`(`OW`/`N`/`UW`)가 `stance`가 된다.
   `rationale`은 그 근거를 한 문장으로 요약한다. 최소 1개 — 비어 있으면 검증기가 거부한다.
```

**Re-verification performed:**
- Read `synthesizer.md` end-to-end after the edit. No contradiction with the
  rest of the file — the new bullet sits parallel to the existing `sectors`
  bullet (country stance vs. sector stance, same evidence-label convention),
  and the list renumbering (5→7 for the two bullets that followed) is the
  only other change.
- Confirmed `DailyVerdict.countries`'s actual shape in `src/types.ts` line 139:
  `{ code: 'KR' | 'US'; stance: 'OW' | 'N' | 'UW'; rationale: string }[]`.
  The new bullet's field names (`code`, `stance`, `rationale`) match exactly
  — I deliberately did not reuse the reviewer's suggested wording verbatim
  where it said "`value`가 `OW`/`N`/`UW`" ambiguously; I kept `value` scoped
  to "evidence의 value" and named the target field `stance` explicitly, since
  `DailyVerdict.countries` has no `value` field and reusing that word
  unqualified would have reintroduced a field-name mismatch.
- Confirmed the source side too: `country_sector.md`'s existing text already
  specifies "국가 스탠스는 `label`을 `country:KR` 또는 `country:US`, `value`를
  `OW`/`N`/`UW`로 적는다" — so the new synthesizer bullet's mapping
  instructions are consistent with what `country_sector.md` actually
  produces.

No test suite applies (docs-only task). Commit: `41cbeb8` — "docs: add
missing countries instruction to synthesizer prompt".
