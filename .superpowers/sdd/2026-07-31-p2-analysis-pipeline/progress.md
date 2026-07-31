# SDD ledger — plan: docs/superpowers/plans/2026-07-31-p2-analysis-pipeline.md
branch: p2-analysis
base: 367c4c8a474d65f1ac26935d6d6bd393c8b32db5
note: P1 완료 기준(실제 market_snapshots 행)은 아직 미충족 — .env의 SUPABASE_SERVICE_ROLE_KEY / FRED_API_KEY 비어 있음. Task 2 이후가 이 키에 걸린다.
Task 1: implemented (commit b2f1221, 28/28 tests, smoke: both news feeds OK, FRED expected fail)
Task 1: review 1 — spec OK, quality approved; 3 Important all plan-mandated (brief's reference code under-delivers its own prose). Ruling: prose governs, same as P1's momentum12_1 / volume rulings. Fix dispatched.
  (a) entity table missed numeric entities -> raw &#8217; would reach LLM prompts
  (b) self-closing atom <link/> silently drops the item
  (c) pubDate test never exercised the present-but-unparseable path its name claims
Task 1: minor (deferred): tag() regex would match a hypothetical <titleFoo>; literal &amp; inside CDATA double-processed. Both theoretical for these two feeds.
Task 1: fix round 1/5 (3 addressed, 0 open; commits b2f1221..c8391d4)
Task 1: complete (commits 367c4c8..c8391d4, review clean, 30/30 tests)
Task 2: implemented (commit 111c310). Universe 702 rows (KR 199, US 503), off-vocabulary sectors 0, noSector 1 (457190.KS) — verified independently by reviewer against committed data/universe.json.
Task 2: deviation (accepted) — brief's 11-page KOSPI200 loop assumed ~20 codes/page; Naver serves ~10, so it captured only 109/200. Implementer diagnosed (pages 1-20 = 199 unique, page 21 empty) and switched to loop-until-empty capped at 30. Plan file corrected at source.
Task 2: review 1 — spec OK; Important: loop-until-empty cannot distinguish end-of-list from a rate-limited/blocked 200 response, so a throttled run silently yields half the Korean market with a normal success line. Fix dispatched: retry empty page once, 300ms between pages, throw if final count < 150.
Task 2: minor (deferred): db.ts's existing `import type` line was edited in place rather than a second import added — functionally inert.
Task 2: parked — DB seed unverified (SUPABASE_SERVICE_ROLE_KEY empty). upsertUniverse has never run against the live table. Closes when the key lands and `npm run universe` runs.
Task 2: fix round 1/5 (2 of 3 properties addressed — delay + floor + cap + HTTP propagation OK; retry advances to next page instead of re-fetching the same one, so a blocked page still loses ~10 tickers silently; commits 111c310..d6ac5e8). data/universe.json diff verified as pure reordering, 24 tickers moved, none lost.
Task 2: fix round 2 dispatched — extract collectCodes(fetchPage, opts) so the loop is testable without network; genuine same-page retry; 5 unit tests covering retry/end/floor/cap/HTTP-propagation.
Task 2: note — plan doc's amended fetchPageCodes design (same-page retry) is what round 2 implements; after round 2 the doc and code agree.
Task 2: fix round 2/5 (1 addressed, 0 open; commits d6ac5e8..25b88df). collectCodes extracted + 5 guard tests; re-reviewer ran the file directly (11/11) and confirmed each test fails if its property is reverted.
Task 2: complete (commits c8391d4..25b88df, review clean, 41/41 tests)
Task 3: implemented (commit 531b467, 50/50 tests). Live: Technology universe 93 (KR 19/US 74), quotes 93/93, liquidity kept 47 (KR 10 / US 37) — per-market split confirmed in production.
Task 3: review 1 — implementation correct (per-market cut, null propagation, NaN-safe score all traced by hand); Important plan-mandated: the currency test fixture passes identically under a global sort-and-cut, so the one regression this task exists to prevent had no real coverage. Ruling: fix. Plan file corrected at source.
Task 3: minor (deferred): fetchQuotes logs only chunk[0] on a failed batch; scoreCandidates re-checks a null turnover that filterByLiquidity already excludes.
Task 3: fix round 1/5 (1 addressed, 0 open; commits 531b467..043970d). Fixture proven to discriminate — mutated run failed 1/9 with actual ['A.KS','B.KS'], implementation confirmed byte-identical after revert.
Task 3: complete (commits 5d6793c..043970d, review clean, 50/50 tests)
Task 4: implemented (commit f4f0e4b). Implementer self-caught Path constructor-param-property violating this task's own Node-24 constraint (fixed, behavior-preserving) and flagged validateCompanyReport had zero tests.
Task 4: review 1 — spec OK, all three load-bearing guarantees (evidence, counter_case, invalidation) verified enforced live even for the untested CompanyReport path; Important plan-mandated: no CompanyReport test coverage. Ruling: fix.
Task 4: minor (deferred): news[].date allows empty string; picks/catalysts have no min length. Both verbatim brief, neither load-bearing.
Task 4: fix round 1/5 (1 addressed, 0 open; commits f4f0e4b..12b2f87). 6 CompanyReport tests added, each confirmed to fail if its underlying check were removed.
Task 4: complete (commits e28b3dd..12b2f87, review clean, 71/71 tests)
Task 5: implemented (commit a799814, 76/76 tests). Implementer caught candidate() test fixture missing required tech:null field (type error, no assertion change). Live news-fetch path verified: SPY 6 items, Yonhap 15 items.
Task 5: review 1 — spec OK, owSectorsFrom hand-verified correct for mixed case/whitespace/empty; Important plan-mandated: no test actually exercises those cases the brief itself calls load-bearing. Ruling: fix. Plan file corrected (candidate() tech field + new case/whitespace test) at source.
Task 5: fix round 1/5 (1 addressed, 0 open; commits a799814..450ec0e). Re-reviewer confirmed the test fails against both a case-sensitive revert and a non-trimming revert.
Task 5: parked — readLatestSnapshot/readOpenReportRequests and full A->B CLI unverified against live DB (SUPABASE_SERVICE_ROLE_KEY empty). Live news-fetching path verified (SPY 6 items, Yonhap 15). Ruling: real gap, blocked on human-supplied credential; closes when key lands and prepare:bundle/candidates run for real.
Task 5: complete (commits 26a1f2d..450ec0e, review clean, 77/77 tests)
Task 6: implemented (commit 0f0e03a, 82/82 tests). Trust boundary verified: every agent/report array element goes through validateAgentOutput/validateCompanyReport (throw-on-first-bad, no filter-and-skip); published:false is a hardcoded literal; onConflict targets match real unique constraints; markRequestsFulfilled scoped to fulfilled_at is null.
Task 6: review 1 — spec OK; Important plan-mandated: publish.ts's stage-merge silently defaults a malformed (non-array) agents field to [], losing agent output before validation ever runs. Ruling: fix. Also bundled: usage message referenced `npm run publish` instead of `publish:run`. Plan file corrected at source.
Task 6: minor (deferred): possible upsert collision if A/B stage agent names ever overlap (they don't, by design); CompanyReport.generated_at has no format validation in schema.ts (Task 4 scope, out of bounds here).
Task 6: fix round 1/5 (1 addressed, 0 open; commits 0f0e03a..f2d978a). Non-array a throws, non-array b.agents throws, absent b.agents still passes, usage message corrected.
Task 6: parked — DB write functions (writeAgentReports/writeDailyVerdict/writeCompanyReports/markRequestsFulfilled) and full publish CLI unverified against live DB (SUPABASE_SERVICE_ROLE_KEY empty). Verified by careful code reading only. Ruling: real gap, blocked on human-supplied credential; closes with Task 5's parked item once the key lands and a real /daily run publishes.
Task 6: complete (commits 5f1f9b4..f2d978a, review clean, 82/82 tests)
