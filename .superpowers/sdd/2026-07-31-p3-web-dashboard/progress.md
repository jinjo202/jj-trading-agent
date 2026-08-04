# SDD ledger — plan: docs/superpowers/plans/2026-07-31-p3-web-dashboard.md
branch: p3-web-dashboard
base: bf6a30bcefc09a05e9dc77dbeaa21ed3611eac9f
Task 1: complete (commits bf6a30b..179f77b, review clean). All 9 files verified, secrets grep clean, disclaimer wired into layout, typecheck passes against real installed deps (Next 16.2.12/React 19.2.8/Tailwind 4.3.3).
Task 1: minor (deferred): .gitignore diff added a blank line + the negation (2 lines) instead of just 1. Cosmetic.
Task 2: implemented (commit 924ff78, 7/7 tests). Implementer disclosed 2 deviations: dynamic import() workaround for supabase.ts's eager-throw, and a tsconfig allowImportingTsExtensions fix.
Task 2: review 1 — spec OK, field names verified byte-identical to root src/types.ts, error handling consistent across all 5 query fns. Important: dynamic-import workaround is a symptom-patch; root cause is Task 1's supabase.ts using an eager `export const supabase = createClient(...)` instead of the lazy memoized factory pattern already established by src/db.ts's db(). Ruling: fix Task 1's file (cross-task fix, approved). Plan corrected at source (Task 1's supabase.ts block + Task 2's queries.ts import).
Task 2: fix round 1/5 (1 addressed, 0 open) — web/lib/supabase.ts converted to lazy getSupabase() factory; queries.ts reverted to static import + getSupabase() calls in each function.
NOTE (process): the fix-round commit landed bundled into the controller's own doc-fix commit (0386276) due to a git race — controller ran `git add docs/... && git commit` in the shared working tree without waiting for the resumed implementer's completion notification first, so both parties' staged changes landed in one commit. Verified functionally correct (7/7 tests, clean typecheck, getSupabase pattern confirmed on disk) — no content lost, just commit attribution is muddled. Lesson: wait for the async completion notification before touching git state in a shared checkout.
Task 2: minor (deferred): signalLabel's test doesn't check hold's className against both others; scoreGaugeColor's boundary test only checks doesNotThrow not actual values. Both verbatim from brief.
Task 2: complete (commits 179f77b..0386276, review clean, 7/7 tests)
Task 3: implemented (commit 835607d). Initial report showed build failing on missing credentials — controller created web/.env.local with the real (non-secret, RLS-protected) anon key fetched earlier via Supabase MCP, re-ran build live: succeeded, static prerender of / against genuinely empty daily_verdicts (○ / 1h 1y), 7/7 tests, typecheck clean.
Task 3: review 1 — spec compliant, verbatim brief code, null-before-destructure order confirmed correct and now empirically live-verified. All prop contracts type-checked against real DailyVerdict shape, no `any` anywhere. No Critical/Important findings.
Task 3: minor (deferred): index-based keys for DriverCard/invalidation list (harmless, server-rendered once); ScoreGauge displays raw unclamped score number while gradient uses clamped value (latent, out of scope, verbatim brief).
Task 3: complete (commits b6ebb90..835607d, review clean)
NOTE: web/.env.local now exists on disk with real anon key (gitignored, not committed). Live build/dev verification is possible for all remaining tasks.
Task 4: complete (commits a2d5631..2ccd6b1, review clean). No findings. Client/server split correct, chart reversed to oldest-first while list stays newest-first (correctly asymmetric), independent build re-run confirmed live against empty DB.
Task 5: complete (commits 2ccd6b1..42aa530, review clean). agent_reports 라우트는 daily_verdicts 발행 여부로 게이팅.
Task 6: complete. `/stock/[market]/[ticker]` 추가.
Task 6: 브리프 초안에서 벗어난 부분 3개 — 모두 spec §8.1 충족을 위한 확장이며 축소는 없음.
  (1) 브리프 페이지가 CompanyReport의 catalysts / week52 / pbr / roe / debt_to_equity /
      per_pctile_in_sector / revenue_trend / op_margin_trend / generated_at 를 렌더하지 않았다.
      spec §8.1이 1장 리포트의 구성요소로 명시한 필드들이라 전부 추가했다.
  (2) 브리프는 리포트가 없을 때 notFound()를 불렀다. company_reports가 0행인 현재 상태에서는
      모든 종목 링크가 404가 되어 기능이 고장난 것처럼 보인다. market 값이 잘못된 경우는
      404를 유지하고(검증: /stock/XX/AAPL → 404), 리포트만 없는 경우는 "아직 생성되지 않음"
      안내로 분리했다.
  (3) 포맷 로직을 페이지에 인라인하지 않고 web/lib/format.ts에 순수 함수로 추가했다
      (pctLabel / numLabel / priceLabel / marketCapLabel / companyStanceLabel).
      퍼센트 표시가 페이지에서 8회 반복되고 per/pbr/roe/debt_to_equity가 nullable이라
      결측 처리를 한 곳에 모아야 했다. 기존 signalLabel/stanceClassName 패턴을 따랐고
      format.test.ts에 테스트를 붙였다 (6 → 18 tests).
Task 6: 결측 처리 규칙 — null/undefined/NaN은 '-'로 표시한다. 0으로 채우면 실제 0%와
  구별되지 않고, 없는 데이터를 있는 것처럼 보이게 만든다. 한국 종목 priceToBook 결측이
  실제로 확인된 값이라 이 경로는 실측으로 검증했다 (PBR 셀이 '-'로 렌더됨).
Task 6: 라이브 검증 방법 — company_reports가 0행이어서 빈 상태 분기만으로는 렌더를 확인할 수
  없었다. ticker '__RENDERTEST__' 더미 1행을 Supabase에 임시 삽입해 프로덕션 빌드
  (next start)로 실제 렌더를 확인한 뒤 삭제했다. 삭제 후 company_reports = 0행으로
  원상복구 확인. 전 라우트 상태: / 200, /history 200, /agents/2026-07-31 200,
  /stock/KR/005930 200, /stock/US/AAPL 200, /stock/XX/AAPL 404.
Task 6: 라이브 검증에서 버그 1건 발견·수정 — marketCapLabel이 음수에서 압축을 건너뛰어
  적자 분기 매출이 '-3,000,000,000,000'으로 새어 나왔다. `value >= 1e12` 비교가 음수에서
  항상 거짓이라 raw toLocaleString으로 떨어진 것. 크기 판정을 절대값으로 바꾸고 부호를
  따로 붙이도록 함수 자체를 고쳤다(호출처 전부가 이득). 회귀 테스트 추가, 재검증 결과 '-3.0조'.
  이 버그는 fixture에 적자 분기를 일부러 넣어서 드러났다 — 양수만 있는 데이터로는 안 잡혔다.
Task 6: 미착수로 남긴 것 — spec §8.2의 리포트 요청 큐(report_requests INSERT + API 라우트).
  P3 plan에 태스크가 없고 Task 6 범위 밖이다. 테이블과 RLS는 이미 있으므로 후속 작업으로
  붙이면 된다. 현재는 "일일 실행에서 생성됩니다" 안내로 대체.
Task 7: complete. Vercel 배포. URL: https://jj-trading-agent.vercel.app (계정 jinjo202-8902s-projects).
  HANDOVER.md §6 원안(GitHub Import)이 아니라 별도 인증된 Vercel MCP의 deploy_to_vercel(파일 트리
  직접 업로드)로 배포 — 이 환경엔 vercel CLI/OAuth가 없었으나 이 MCP 커넥터는 이미 인증돼 있었다.
  1차 시도는 lib/format.ts를 파일 목록에서 빠뜨려 5개 모듈 Module not found로 빌드 실패, 2차 시도에서
  추가해 성공. env는 프로젝트 설정이 아니라 배포 파일 트리의 .env.production으로 주입(도구에 env API
  없음) — NEXT_PUBLIC_* 둘 다 공개 가능한 값이라 문제 없음, SERVICE_ROLE_KEY는 미포함.
  package-lock.json은 제외(Vercel이 npm install로 새로 설치). /, /history, /stock/US/AAPL 실제 접속
  확인 — 전부 200, 콘솔 에러 없음, DB 0행이라 빈 상태 문구만 표시(정상).
  한계: git 연동이 아니라서 push해도 자동 재배포 안 됨. 다음 코드 변경은 재배포 필요, HANDOVER.md §6에
  전환 절차 기록.
