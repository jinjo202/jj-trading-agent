# SDD ledger — plan: docs/superpowers/plans/2026-07-31-p1-collection-pipeline.md
branch: p1-collection
base: 19507be1b15b1e2f32773f5dda1bd33809eacd33
Task 1: implemented (commit dc471c1, 13/13 tests, typecheck clean)
Task 1: approved deviation — two float assertions use 1e-9 epsilon instead of assert.equal (plan text was wrong; plan file updated)
Task 1: review 1 — spec OK except Important plan-mandated: momentum12_1 off-by-one (end index t-20 not t-21), test bent to match. Confirmed real.
Task 1: minor (deferred): macd guard is values.length < 35 where < 34 suffices — correctness-neutral, returns null one bar early at the boundary (src/indicators.ts:41)
Task 1: minor (deferred): yahoo-finance2@4 pulls a large transitive tree (express, @modelcontextprotocol/sdk, zod, tough-cookie). Not a pinned-dependency violation; revisit only if install size becomes a problem.
Task 1: fix round 1 dispatched — momentum12_1 end index -> values.length - 22, test expected index 232 -> 231. Plan file corrected at source.
Task 1: fix round 1/5 (2 addressed, 0 open; commits dc471c1..c8d53fe)
Task 1: complete (commits 19507be..c8d53fe, review clean)
Task 2: complete (commits c8d53fe..f9dbbc8, review clean — live schema/policies/unique constraint verified against project jsxhcqnupvvctnjiaric)
Task 2: parked — brief Step 6 live round-trip not run (SUPABASE_SERVICE_ROLE_KEY not yet supplied by human). Ruling: real gap, blocked on a credential only the human can provide; Task 5's live collection exercises the exact same write path and cannot pass without it, so the gap closes there. Re-check at final review.
Task 2: minor (deferred): the four indexes were not re-verified against pg_indexes (applied in the same atomic migration that verified correctly).
Task 3: implemented (commit f11376d, live check OK: ^GSPC bars, AAPL sector Technology, Samsung 005930 bars, foreign ratio 46.53)
Task 3: review 1 — spec OK; Important plan-mandated: yahoo.ts volume `?? 0` violates the design doc's "결측을 0으로 채우지 않는다". Ruling: design doc governs over the plan's template code (same ruling as Task 1's momentum12_1). Fix dispatched: Ohlcv.volume widened to number|null.
Task 3: minor (deferred): yahoo.ts has no per-call error wrapping unlike naver.ts (library errors are already descriptive).
Task 3: minor (deferred): Naver payload sanitize is a blanket `replace(/'/g,'"')` — sound for the current fixed row shape (date + 6 numbers, no apostrophes possible), would break if Naver ever returns a text field.
Task 3: fix round 1/5 (1 addressed, 0 open; commits f11376d..214108d)
Task 3: complete (commits f9dbbc8..214108d, review clean)
Task 4: complete (commits 214108d..2eb0a8d, review clean — typecheck now clean project-wide, smoke 6 OK + 1 expected FRED key failure)
Task 4: parked — FRED live call unverified (FRED_API_KEY not yet supplied by human). Ruling: real gap, blocked on a credential only the human can provide; closes as soon as the key lands and `npm run smoke` shows 7 OK.
Task 4: minor (deferred): fred.ts has no runtime validation of the FRED payload — a FRED error-shaped JSON body would throw TypeError on .map rather than a diagnosable error. Matches the brief verbatim; revisit if FRED errors show up in practice.
Task 5: complete (commits 2eb0a8d..5b7b810, review clean — breadth alignment, curve arithmetic, missing accounting, rel(), 260-bar trim, purity all hand-verified; 18/18 tests, typecheck clean)
Task 5: approved deviation — collect.test.ts series() fixture uses high:c,low:c (brief's padded band made week52Position asymptotic to 1). Plan file updated at source.
Task 5: parked — brief Steps 7-9 (live `npm run collect`, DB verification query, idempotency re-run) not run; SUPABASE_SERVICE_ROLE_KEY empty. Substitute live check passed: 23/23 symbols fetched, missing = [fred, naver:foreignRatio] only. Ruling: real gap, blocked on a human-supplied credential; it is P1's stated completion criterion and MUST be closed before P1 is called done.
Task 5: minor (deferred): collect.test.ts week52Position assertion passes for any window length, so it cannot catch an off-by-one in the 252-bar slice (indicators.test.ts covers that separately).
Task 5: minor (deferred): yoy() filters nulls then indexes 13 back, so an interior gap in a FRED monthly series would silently compare the wrong span. Plan-mandated; CPI/core-CPI have no interior gaps in practice.
Final review (whole branch 19507be..5b7b810, opus): Critical 1 (.gitignore regression) + Important 2-5 + Minors 6/8/11/12/14. Indicator math verified against independent reimplementations; RLS verified live; all three earlier defects confirmed still fixed.
Final fix wave: commit 33b139a. Re-review (5b7b810..33b139a): all findings addressed, no new breakage. 21/21 tests, typecheck clean, smoke 8 checks (FRED expected fail).
Final review triage: 4 indexes item CLOSED (verified in pg_indexes). Carried as acceptable: macd guard (now fixed anyway), yahoo transitive tree, yahoo per-call wrapping, naver quote sanitizer, fred payload validation, week52 test window strength, yoy interior-gap, breadth position-alignment, migration create-policy non-idempotency, NaN reachability, FRED key in URL.
OPEN — blocks P1 completion, not the code: no row has ever been written to market_snapshots and FRED has never returned data. Both need human-supplied keys in .env. Run `npm run collect` twice + plan Step 8's verification query to close.
Workspace retained deliberately (not deleted) until that live run happens — the task reports are the evidence trail for it.
