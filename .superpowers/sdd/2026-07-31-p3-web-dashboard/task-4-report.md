# Task 4 Report: `/history` 페이지

## What I implemented

- `web/app/history/ScoreTrendChart.tsx` — client component (`'use client'`), Recharts `LineChart` wrapped in `ResponsiveContainer`, receives `points: { date, score }[]` as a prop and reverses it locally for oldest-first chart order. Written verbatim from the brief.
- `web/app/history/page.tsx` — async Server Component. Fetches `getVerdictHistory(90)`, returns the empty-state message (`아직 발행된 결론이 없습니다.`) before any mapping if `rows.length === 0`, otherwise maps to `historyPoint` for the chart and renders a list of rows linking to `/agents/${date}`, each with score and `signalLabel` badge. Written verbatim from the brief.

## Local dev-server check (real Supabase credentials, live DB)

Ran `npm run dev` (Next.js 16.2.12, Turbopack, ready in 506ms) and loaded `http://localhost:3000/history` in the browser tool.

- `location.href` confirmed as `http://localhost:3000/history` (tab title metadata is inherited from the shared layout, so it displayed "오늘의 시장 판단" — this is expected, not a routing bug).
- Page text rendered:
  ```
  아직 발행된 결론이 없습니다.
  ```
  This is the correct empty-state branch, since `daily_verdicts` is genuinely empty.
- Console messages: only React DevTools info banner and `[HMR] connected` logs — no errors or warnings.
- Network requests: `GET /history → 200 OK` (x2, from navigation retry), plus the `ScoreTrendChart` and `page` JS chunks returning `304 Not Modified`. No failed requests.

## `npm run build` output

```
▲ Next.js 16.2.12 (Turbopack)
✓ Compiled successfully in 2.4s
  Finished TypeScript in 2.4s ...
✓ Generating static pages using 5 workers (4/4) in 650ms

Route (app)      Revalidate  Expire
┌ ○ /                    1h      1y
├ ○ /_not-found
└ ○ /history             1h      1y

○  (Static)  prerendered as static content
```

Build succeeded; `/history` was statically prerendered against the live, empty `daily_verdicts` table (empty-state branch executed at build time with no errors).

## Files changed

- `web/app/history/ScoreTrendChart.tsx` (new)
- `web/app/history/page.tsx` (new)

Committed as `2ccd6b1 feat: add history route with score trend chart` on branch `p3-web-dashboard`. (Note: `.superpowers/sdd/2026-07-31-p3-web-dashboard/task-4-brief.md` was already staged in the index before I started this task and rode along in the same commit — I did not touch its contents, and its staging predates this task's `git add`.)

## Self-review

- Empty-state branch (`rows.length === 0`) is checked and returns before any `.map()` calls on `rows` or `points` — confirmed by reading the code and by the live empty-DB dev/build checks above, both of which exercised exactly this branch.
- `ScoreTrendChart.tsx` starts with `'use client'` and takes `points` as a prop; it does not call `getVerdictHistory` or any data-fetching itself — all fetching happens in `page.tsx` (Server Component, no `'use client'`).
- Each history-list row links to `` `/agents/${date}` ``, where `date` comes straight from `getVerdictHistory`'s `{ date, verdict }` rows (the same `date` string used as the React `key`), and `historyPoint` derives `{ date, score: verdict.equity_score }` from the identical `date` field — so the date format is consistent between the link, the list, and the chart's x-axis.
- `npm run build` succeeded against the live (currently empty) Supabase database, statically prerendering `/history`.

## Issues or concerns

None. Code matches the brief verbatim; only the two files listed in scope were created; dev and build checks both passed cleanly against the live database with no console errors.
