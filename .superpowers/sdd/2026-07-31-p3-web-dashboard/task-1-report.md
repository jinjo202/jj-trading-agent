# Task 1 Report: Next.js 스캐폴드 + Supabase 클라이언트 + 레이아웃

## What was created

All files exactly as specified in `task-1-brief.md`:

- `web/package.json` — scripts (dev/build/start/test/typecheck), deps (next 16.2.12, react/react-dom 19.2.8, @supabase/supabase-js 2.111.0, recharts 3.10.1), devDeps (typescript, @types/*, tailwindcss 4.3.3, @tailwindcss/postcss 4.3.3)
- `web/tsconfig.json` — strict TS config with `@/*` path alias
- `web/next.config.ts` — empty NextConfig
- `web/postcss.config.mjs` — Tailwind v4 postcss plugin
- `web/.env.local.example` — real Supabase URL, blank anon key placeholder
- `web/lib/supabase.ts` — anon-only client, throws if env vars missing
- `web/components/Disclaimer.tsx` — Korean investment disclaimer
- `web/app/globals.css` — `@import 'tailwindcss'`
- `web/app/layout.tsx` — root layout wiring Disclaimer + metadata
- Root `.gitignore` — added one line `!web/.env.local.example` after existing content, nothing else touched

## npm install output summary

`cd web && npm install` — 93 packages added, 29s, no errors.

- No peer-dependency conflicts between Next.js 16.2.12 / React 19.2.8 / Tailwind 4.3.3. `npm ls` confirms all top-level deps resolved to exactly the versions pinned in the brief (next@16.2.12, react@19.2.8, react-dom@19.2.8, @supabase/supabase-js@2.111.0, recharts@3.10.1, tailwindcss@4.3.3, @tailwindcss/postcss@4.3.3, typescript@5.9.3). No `--legacy-peer-deps`/`--force` needed.
- `npm warn allow-scripts`: sharp@0.34.5 (transitive, via Next's image optimizer) has an install script npm flagged for review. Not run, not required for typecheck; informational only.
- `npm audit`: 3 high-severity advisories, all inside Next 16.2.12's own bundled/transitive deps (postcss XSS/path-traversal advisories, sharp libvips CVEs) — not from our direct pins. `npm audit fix --force` would downgrade to `next@9.3.3`, which is not a real fix (major regression), so left as-is. Worth revisiting when Next ships a patched 16.x, but out of scope for this task.

## npm run typecheck output

```
> trading-agent-web@0.1.0 typecheck
> tsc --noEmit
```

No errors, no output — clean pass. Confirmed this works with no `app/page.tsx` present yet (as expected, `next build` would fail but `tsc --noEmit` doesn't need a page).

## Files changed

- Created: `web/package.json`, `web/package-lock.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/postcss.config.mjs`, `web/app/layout.tsx`, `web/app/globals.css`, `web/lib/supabase.ts`, `web/components/Disclaimer.tsx`, `web/.env.local.example`
- Modified: root `.gitignore` (one line added: `!web/.env.local.example`)
- `web/node_modules/` and `web/tsconfig.tsbuildinfo` (transient, deleted after typecheck) were not committed.

## Self-review findings

- Every file matches the brief's exact content verbatim — verified by diffing against the brief during creation.
- `web/lib/supabase.ts` throws `Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다')` when either env var is missing/falsy, before constructing the client — no silent broken-client path.
- Grepped `web/` (excluding node_modules) for `service_role`: only match is the code comment in `supabase.ts` stating service_role is *not* used — no actual key or env var name `SUPABASE_SERVICE_ROLE_KEY` appears anywhere under `web/`. (node_modules contains unrelated matches inside the `@supabase/auth-js`/`storage-js` library source — third-party code, not ours, correctly untracked.)
- `.gitignore` diff is purely additive: one blank line + `!web/.env.local.example` appended after the existing SDD-review block; nothing else in the file was touched. `.superpowers/sdd/.gitignore` was not touched (confirmed diff is empty aside from a CRLF-normalization warning with no content change).
- `git ls-files web/.env.local.example` confirms it's tracked despite the broad `.env*` ignore pattern — the negation line works as intended.

## Issues or concerns

None blocking. Two minor non-blocking notes carried above: the `sharp` install-script advisory notice from npm's allow-scripts guard, and the pre-existing high-severity advisories bundled inside Next 16.2.12 itself (not fixable without a Next downgrade). Neither affects this task's scope or the typecheck/build path.
