# Task 1 Report: 뉴스 소스 모듈

## What was implemented

- `src/types.ts`: appended `NewsItem` type (title, url, date: ISO | null, source), no existing types altered.
- `src/sources/news.ts` (new): regex-based RSS 2.0 parser and two fetchers.
  - `parseRss(xml, source)` — extracts `<item>` blocks only (never the channel-level `<title>`), strips CDATA, decodes the five standard XML entities, drops items missing `title` or `link`, normalizes `pubDate` to ISO or `null` on parse failure/absence.
  - `fetchSymbolNews(symbol, limit = 8)` — hits the Yahoo headline RSS endpoint (`feeds.finance.yahoo.com/rss/2.0/headline?s=...`), works for both US and KR tickers per the measured endpoint behavior; source tag `yahoo:<symbol>`.
  - `fetchKrEconomyNews(limit = 15)` — hits `www.yna.co.kr/rss/economy.xml`; source tag `yonhap`.
  - Both fetchers send the browser `User-Agent` header and throw `RSS <source> HTTP <status>` on non-OK responses, matching `naver.ts`'s shape.
- `src/sources/news.test.ts` (new): the seven fixture-based tests from the brief, verbatim.
- `src/sources/smoke.ts`: added import of `fetchKrEconomyNews`/`fetchSymbolNews` and two entries to the `checks` array (`news yahoo 005930.KS`, `news yonhap economy`).

No caching, retry, or feed-registry abstraction was added — none was requested and `news.ts` owns RSS parsing only.

## TDD Evidence

**RED**

Command: `npm test`

Before `news.ts` existed (only `news.test.ts` was written), the run produced:

```
node:internal/modules/esm/resolve:271
    throw new ERR_MODULE_NOT_FOUND(
          ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\user\Desktop\jj-coding-projects\trading agent\src\sources\news.ts' imported from C:\Users\user\Desktop\jj-coding-projects\trading agent\src\sources\news.test.ts
...
ℹ tests 22
ℹ pass 21
ℹ fail 1
✖ src\sources\news.test.ts (557.643ms)
  'test failed'
```

This is the expected failure: the test file imports `parseRss` from a module that doesn't exist yet. The 21 pre-existing tests (Phase 1) still passed, confirming the failure was isolated to the new file, not a broken test runner or unrelated regression.

**GREEN**

Command: `npm test` (after implementing `src/sources/news.ts`)

```
✔ parseRss는 채널 제목을 항목으로 착각하지 않는다 (2.5588ms)
✔ parseRss는 CDATA를 벗겨낸다 (0.3156ms)
✔ parseRss는 XML 엔티티를 디코드한다 (0.231ms)
✔ parseRss는 pubDate를 ISO로 정규화하고 실패 시 null (0.2542ms)
✔ parseRss는 source를 모든 항목에 붙인다 (0.2364ms)
✔ parseRss는 title이나 link가 없는 항목을 버린다 (0.2005ms)
✔ parseRss는 item이 없으면 빈 배열 (0.8442ms)
ℹ tests 28
ℹ pass 28
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

28 = 21 pre-existing + 7 new, matching the brief's expectation exactly.

## `npm run smoke` output (verbatim)

```
> smoke
> node --env-file=.env src/sources/smoke.ts

OK   yahoo chart ^GSPC: 21
OK   yahoo chart ^KS11: 22
OK   yahoo fundamentals AAPL: Technology
OK   yahoo fundamentals 005930.KS: 0.18855
OK   naver daily 005930: 22
OK   naver daily KOSPI: 22
OK   naver daily KOSDAQ: 22
OK   naver foreign ratio 005930: 46.53
FAIL fred DGS10: FRED_API_KEY 없음
OK   news yahoo 005930.KS: 3
OK   news yonhap economy: 3
```

The `FAIL fred DGS10` line is expected — `FRED_API_KEY` is empty in this environment; only the human can supply it. Every other check, including both new news checks, passed with the requested count (3 items each).

## `npm test` and `npm run typecheck` results

- `npm test`: 28/28 pass, 0 fail.
- `npm run typecheck`: `tsc --noEmit` — clean, no output, exit 0.

## Files changed

- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\types.ts` (appended `NewsItem`)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\sources\news.ts` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\sources\news.test.ts` (new)
- `C:\Users\user\Desktop\jj-coding-projects\trading agent\src\sources\smoke.ts` (two checks added)

Note: `.claude/settings.local.json` was already modified in the working tree before this task started (unrelated, pre-existing change) and was deliberately left out of this commit.

## Self-review findings

- Completeness: `parseRss`, `fetchSymbolNews`, `fetchKrEconomyNews` all present with the brief's exact signatures. All seven tests present and passing.
- Correctness: verified the item-block regex (`/<item[\s>][\s\S]*?<\/item>/g`) only matches `<item>` tags, so the channel-level `<title>Yahoo Finance</title>` outside any `<item>` block is never captured — confirmed by the first test passing (`items.length === 2`, not 3). CDATA-stripping and entity-decoding both covered by dedicated tests and passing. Items missing `title` or `link` are filtered out (`if (!title || !url) continue`), confirmed by the "버린다" test (3 items in fixture, 1 survives).
- Discipline: no speculative helpers or extra exports beyond the three specified functions; `decode` and `tag` are internal, unexported helpers as in the brief.
- Testing: `news.test.ts` only imports `parseRss` and uses inline string fixtures — zero network calls, verified by clean/fast run (all seven tests complete in ~4ms total). Test output is pristine, no console noise beyond the standard `node --test` TAP-ish summary.

## Issues or concerns

None. Implementation matches the brief verbatim; all live network checks and static checks are green.

## Fix round 1 (post-review)

Coordinator review approved the task but ruled three findings must be fixed — all defects in the brief's own reference code (prose promised behavior the code didn't deliver).

**What changed** (`src/sources/news.ts`):
- Finding 1: added `&nbsp;` to the named `ENTITIES` table, and added `decodeEntities()` with a numeric-entity fallback (decimal `&#8217;` and hex `&#x2014;` via `String.fromCodePoint`), applied after the named-entity pass so `&amp;` still resolves first. `decode()` now calls `decodeEntities()` instead of inlining the old narrower regex.
- Finding 2: added `link(block)` helper — tries the paired `<link>...</link>` form first via the existing `tag()`, falls back to extracting `href="..."` from a self-closing atom-style `<link .../>` only when the paired form is absent. `parseRss` now calls `link(b)` instead of `tag(b, 'link')`.
- Finding 3 (`src/sources/news.test.ts`): added a `badDate` case to the existing pubDate test — an unparseable-but-present `<pubDate>어제쯤</pubDate>` — asserting `date === null`, closing the gap where `Number.isNaN(parsed.getTime())` had zero coverage.

Also added two new tests per the review: numeric-entity decoding, and self-closing atom `<link href>`.

Deferred per the coordinator's explicit "not in scope" call: the `tag()` regex matching a hypothetical `<titleFoo>`, and double-processing of a literal `&amp;` inside CDATA. Not touched.

**Covering tests:** `parseRss는 숫자 엔티티도 디코드한다`, `parseRss는 self-closing atom link의 href를 쓴다`, and the extended `parseRss는 pubDate를 ISO로 정규화하고 실패 시 null` (now covers both the absent- and present-but-unparseable pubDate paths).

**Commands and output:**

`node --test src/sources/news.test.ts`:
```
✔ parseRss는 채널 제목을 항목으로 착각하지 않는다 (2.3014ms)
✔ parseRss는 CDATA를 벗겨낸다 (0.247ms)
✔ parseRss는 XML 엔티티를 디코드한다 (0.1419ms)
✔ parseRss는 pubDate를 ISO로 정규화하고 실패 시 null (0.1627ms)
✔ parseRss는 source를 모든 항목에 붙인다 (0.143ms)
✔ parseRss는 title이나 link가 없는 항목을 버린다 (0.1482ms)
✔ parseRss는 item이 없으면 빈 배열 (0.5057ms)
✔ parseRss는 숫자 엔티티도 디코드한다 (0.1328ms)
✔ parseRss는 self-closing atom link의 href를 쓴다 (0.1682ms)
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

`npm test`:
```
ℹ tests 30
ℹ pass 30
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
(21 pre-existing Phase 1 + 9 news tests, up from 7 before this fix round.)

`npm run typecheck`:
```
> typecheck
> tsc --noEmit
```
Clean, no output.

`npm run smoke`:
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
OK   news yahoo 005930.KS: 3
OK   news yonhap economy: 3
```
Both live feeds still parse correctly after the changes; FRED fails only on its expected missing-key condition.

Commit: `c8391d4` — fix: decode numeric XML entities and atom self-closing links in RSS parser
