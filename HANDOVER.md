# 인수인계서 — 멀티에이전트 투자 분석 대시보드

- 작성일: 2026-07-31
- 리포지토리: https://github.com/devbotsender8282/jj-trading-agent
- 현재 브랜치: `p3-web-dashboard` (기준 브랜치는 `master`)

---

## 1. 한 줄 요약

매일 아침 "지금 주식 비중을 늘릴 타이밍인가 / 왜인가 / 어느 국가·섹터인가 / 어느 종목인가"에
7개 LLM agent가 답하고, 그 결과를 웹 대시보드로 보는 시스템.
설계 원칙은 **숫자는 코드가 계산하고 해석만 LLM이 한다**.

전체 설계는 [docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md](docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md)에 있다.
새 PC에서 작업을 이어받는 사람은 이 인수인계서 → spec → 해당 phase의 plan 순서로 읽으면 된다.

---

## 2. 진행 상황

| Phase | 범위 | 상태 |
|---|---|---|
| P1 | 수집 파이프라인 (데이터 소스, 지표 계산, 스냅샷) | **완료** |
| P2 | 분석 파이프라인 (agent 프롬프트 9개, 스크리너, 발행) | **완료** |
| P3 | 웹 대시보드 | **완료 (7/7)** |
| P4 | 자동화 (pg_cron 수집, 작업 스케줄러 분석) | 미착수 |

### P3 세부

| Task | 내용 | 상태 |
|---|---|---|
| 1 | Next.js 스캐폴드 + Supabase 클라이언트 + 레이아웃 | 완료 |
| 2 | 타입 + 조회/포맷 순수 함수 | 완료 |
| 3 | `/` 오늘의 결론 페이지 | 완료 |
| 4 | `/history` 페이지 | 완료 |
| 5 | `/agents/[date]` 페이지 | 완료 |
| 6 | `/stock/[market]/[ticker]` 기업 1장 리포트 | 완료 |
| 7 | Vercel 배포 | 완료 (§6 참조) |

Task 6은 "종목 클릭 → 1장짜리 기업 분석 리포트" 기능이다. `/`의 추천 종목 카드가 이미
`/stock/{market}/{ticker}`로 링크되어 있어서 클릭 경로가 연결되었다.
spec §8.1의 전 항목을 렌더한다 — 가격·등락률·시가총액, PER/PBR/ROE/부채비율/섹터 백분위,
52주 위치 바, 사업 설명, 투자논지, 반대논거, 향후 촉매, 매출·영업이익률 분기 추이 막대,
차트 해석, 종합 판단, 최근 뉴스, 무효화 조건.

남은 것은 spec §8.2의 **리포트 요청 큐**다 (`report_requests` INSERT + API 라우트).
테이블과 RLS는 이미 있고, 지금은 "일일 실행에서 생성됩니다" 안내로 대체되어 있다.

### 실측 검증 결과 (2026-07-31 기준)

```
npm test                 → 101 tests, 101 pass, 0 fail   (루트)
cd web && npm test       → 18 tests, 18 pass, 0 fail
npm run typecheck        → clean, exit 0 (루트/web 양쪽)
cd web && npm run build  → 성공. Next.js 16.2.12
```

라우트별 실제 HTTP 응답 (`next start` 프로덕션 빌드에 curl):

| 라우트 | 응답 |
|---|---|
| `/` | 200 (static, 1h revalidate) |
| `/history` | 200 (static, 1h revalidate) |
| `/agents/2026-07-31` | 200 (dynamic) |
| `/stock/KR/005930` | 200 — 리포트 없음 안내 |
| `/stock/US/AAPL` | 200 — 리포트 없음 안내 |
| `/stock/XX/AAPL` | 404 — 잘못된 market 거부 |

`company_reports`가 0행이라 빈 상태 분기만으로는 렌더를 확인할 수 없었으므로,
`ticker='__RENDERTEST__'` 더미 1행을 임시로 넣어 채워진 화면을 실제로 확인하고 삭제했다.
삭제 후 `company_reports = 0행` 원상복구를 확인했다. 이 과정에서 `marketCapLabel`이 음수에서
압축을 건너뛰는 버그를 찾아 고쳤다(적자 분기 매출이 원본 자릿수로 새어 나왔다).

---

## 3. 지금 막혀 있는 것 3개 — 새 PC에서 제일 먼저 처리할 것

### (1) `SUPABASE_SERVICE_ROLE_KEY`가 비어 있음 → 파이프라인이 실데이터로 한 번도 안 돌았다

`.env`의 `SUPABASE_SERVICE_ROLE_KEY`가 빈 값이다. 쓰기 권한이 없으니 수집·발행 스크립트가 DB에 못 쓴다.

DB 실측 결과 우리 테이블 6개가 **전부 0행**이다.

| 테이블 | 행 수 |
|---|---|
| `market_snapshots` | 0 |
| `agent_reports` | 0 |
| `daily_verdicts` | 0 |
| `company_reports` | 0 |
| `report_requests` | 0 |
| `universe` | 0 |

스키마 마이그레이션은 적용되어 있다(테이블이 존재함). 데이터만 없다.
따라서 **웹 대시보드는 지금 빈 화면을 정상적으로 렌더한다.** 버그가 아니다.

발급 위치: Supabase 대시보드 → 프로젝트 `super-use-project` → Project Settings → API → `service_role` secret.

> 이 키는 RLS를 우회하는 관리자 키다. `.env`에만 두고 절대 커밋하지 말고, 웹앱(`web/`)에는 넣지 마라.
> 웹앱은 `anon` 키만 쓴다.

### (2) `FRED_API_KEY`가 비어 있음 → 매크로 데이터를 못 받는다

`macro` agent의 입력(금리 커브, CPI, 실업률, DXY, WTI, HY 스프레드, VIX)이 전부 FRED에서 온다.

발급: https://fred.stlouisfed.org/docs/api/api_key.html — 무료, 즉시 발급.

### (3) `claude -p`가 미인증 상태 → 분석 자동화 불가

```
$ claude -p "say hi" --output-format json
→ "Not logged in · Please run /login"
```

**현재 우회 방법**: Claude Code에서 슬래시 커맨드 `/daily`를 수동 실행한다. 이건 인증 없이 지금 작동한다.
자동화(P4)를 하려면 새 PC의 터미널에서 `claude login`을 한 번 실행해야 한다.
`/daily`와 헤드리스 러너가 `prompts/` 파일을 공유하므로 재작업은 없다.

---

## 4. 새 PC 셋업 절차

```bash
git clone https://github.com/devbotsender8282/jj-trading-agent.git
cd jj-trading-agent
git checkout p3-web-dashboard
```

Node 24 이상이 필요하다 (`package.json`의 `engines.node: ">=24"`).
테스트가 Node 내장 TypeScript 타입 스트리핑에 의존하므로 22 이하에서는 `npm test`가 깨진다.
로컬에 Python은 필요 없다.

```bash
npm install            # 루트: yahoo-finance2, @supabase/supabase-js
cd web && npm install  # 웹: next, react, recharts, tailwind
cd ..
```

`.env`를 `.env.example`을 보고 만든다 (git에 없다).

```
SUPABASE_URL=https://jsxhcqnupvvctnjiaric.supabase.co
SUPABASE_SERVICE_ROLE_KEY=     # ← §3(1)에서 발급
FRED_API_KEY=                  # ← §3(2)에서 발급
```

`web/.env.local`을 `web/.env.local.example`을 보고 만든다.

```
NEXT_PUBLIC_SUPABASE_URL=https://jsxhcqnupvvctnjiaric.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase → Settings → API → anon public
```

`anon` 키는 RLS로 보호되는 공개 키다. 브라우저에 노출되는 것이 정상이다.

검증:

```bash
npm test                    # 101 pass 나와야 정상
npm run typecheck           # 무출력
npm run smoke               # 각 데이터 소스가 살아 있는지 확인 (네트워크 사용)
cd web && npm run build     # 빌드 통과
```

---

## 5. 매일 돌리는 방법

```bash
npm run universe        # 유니버스 702종목(US 503 / KR 199)을 DB에 적재 — 최초 1회 및 분기 갱신
npm run collect         # 시세·펀더멘털·매크로·뉴스 수집 → market_snapshots 저장
npm run candidates      # 결정론적 스크리너 → 후보 12종목
npm run prepare:bundle  # agent에게 줄 입력 번들 생성
```

그 다음 Claude Code에서:

```
/daily
```

`/daily`가 agent 6개 + 반대의견 1개 + 종합 1개를 실행하고, 결과를 다음 명령으로 발행한다.

```bash
npm run publish:run     # agent_reports + daily_verdicts + company_reports 기록
```

일일 LLM 호출 예산은 13회다 (분석 6 + 반대의견 1 + 종합 1 + 기업 리포트 5).

---

## 6. Vercel 배포 — 완료

**배포 완료.** URL: https://jj-trading-agent.vercel.app (계정: `jinjo202-8902s-projects`, 프로젝트 `jj-trading-agent`).
`/`, `/history`, `/stock/US/AAPL` 실제 접속 확인 — 전부 200, 콘솔 에러 없음, DB가 비어 있어 빈 상태 문구만 표시(§3(1) 때문이며 정상).

**배포 방식이 §6 원안과 다르다.** GitHub 연동이 아니라 Vercel MCP의 `deploy_to_vercel`(파일 트리 직접 업로드)로 배포했다.
이 환경엔 GitHub 저장소 Import를 수행할 CLI/OAuth 수단이 없었지만, 별도 인증된 Vercel MCP 커넥터가 있어 그걸로 우회했다.

**이것이 의미하는 것 — 다음 작업자가 반드시 알아야 함:**

- **`git push`해도 자동 재배포되지 않는다.** GitHub 연동이 아니므로 이 배포는 이 순간의 `web/` 스냅샷일 뿐이다.
  이후 코드를 바꾸면 같은 방식(`deploy_to_vercel`)으로 다시 배포하거나, 아래 GitHub 연동 절차로 전환해야 한다.
- `package-lock.json`은 배포에 포함하지 않았다(75KB, 불필요). Vercel이 `npm install`로 새로 설치했다.
  재현성이 중요해지면 lockfile 포함 배포나 git 연동으로 바꿔라.
- env 변수는 Vercel 프로젝트 설정이 아니라 배포 파일 트리 안의 `.env.production`으로 주입했다
  (`deploy_to_vercel` 도구에 env 변수 설정 API가 없음). `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` 둘 다 공개해도 되는 값이라 문제 없다.
  `SUPABASE_SERVICE_ROLE_KEY`는 물론 넣지 않았다.
- **첫 배포 시도는 실패했다** — `lib/format.ts`를 파일 목록에서 빠뜨려 5개 모듈이 `Module not found`로 빌드 실패.
  두 번째 시도에서 추가해서 성공했다. 파일 기반 배포는 git처럼 전체 트리를 자동으로 안 챙겨주므로, 새로 배포할 때
  `git ls-files`로 대상 파일 목록을 다시 뽑아 빠짐없이 포함해야 한다.

**GitHub 연동으로 전환하려면** (git push마다 자동 배포를 원할 때):

1. https://vercel.com/jinjo202-8902s-projects/jj-trading-agent → Settings → Git 에서 저장소 연결, 또는
2. https://vercel.com/new 에서 `devbotsender8282/jj-trading-agent`를 새로 Import
3. **Root Directory 를 `web` 으로 지정** ← 리포지토리 루트가 Next.js 앱이 아니다. 이걸 빼먹으면 빌드가 실패한다.
4. Environment Variables 에 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` 추가 (`SUPABASE_SERVICE_ROLE_KEY`는 넣지 마라)
5. **Production Branch 를 `p3-web-dashboard` 로 바꾼다** ← 기본값(`master`)은 `bf6a30b`에 멈춰 있어 대시보드 페이지가 하나도 없다.
   대안: `p3-web-dashboard`를 `master`에 머지하면 기본값 그대로 써도 된다.

---

## 7. 파일 지도

```
docs/superpowers/
  specs/2026-07-31-multi-agent-trading-advisor-design.md   전체 설계. 먼저 읽어라
  plans/2026-07-31-p1-collection-pipeline.md               P1 구현계획
  plans/2026-07-31-p2-analysis-pipeline.md                 P2 구현계획
  plans/2026-07-31-p3-web-dashboard.md                     P3 구현계획 (Task 6이 950줄부터)

src/                        수집·분석 파이프라인 (LLM 없음, 전부 결정론적)
  types.ts                  공용 타입. AgentOutput / DailyVerdict / CompanyReport
  indicators.ts             SMA/RSI/MACD/ATR/z-score/백분위
  sources/                  yahoo, naver, fred, news + smoke 체크
  collect.ts                소스들을 묶어 스냅샷 생성
  snapshot.ts               스냅샷 조립
  screener.ts               결정론적 1차 스크리너
  universe.ts               유니버스 적재
  prepare.ts                agent 입력 번들 생성
  schema.ts                 LLM 출력 스키마 검증 (LLM 출력은 신뢰 경계다)
  publish.ts                DB 발행
  db.ts                     Supabase 클라이언트 (lazy factory)
  bin/                      실행 엔트리포인트 5개

prompts/                    agent 프롬프트 9개
  macro / allocation / country_sector / technical / news / fundamental
  counter (반대의견) / synthesizer (종합) / company_report (기업 1장)

web/                        Next.js 16 대시보드 — Vercel Root Directory는 여기
  app/page.tsx              / 오늘의 결론
  app/history/              /history 점수 추이
  app/agents/[date]/        /agents/[date] agent 리포트 원문
  (app/stock/ 없음)          ← P3 Task 6에서 만들 것
  components/               ScoreGauge, DriverCard, StanceGrid, Disclaimer
  lib/queries.ts            Supabase 조회 (anon 전용)
  lib/format.ts             표시 포맷

data/universe.json          702종목 (US 503 / KR 199)
supabase/migrations/0001_trading_agent_schema.sql
.claude/commands/daily.md   /daily 슬래시 커맨드
.superpowers/sdd/           각 task의 브리프·리포트·리뷰 이력 (왜 그렇게 됐는지의 근거)
```

---

## 8. 함정 — 모르면 시간 버리는 것들

**Yahoo `quoteSummary`를 raw fetch로 호출하지 마라.** `Invalid Crumb`이 뜬다. `v7/finance/quote`도
`Unauthorized`다. 반드시 `yahoo-finance2` 라이브러리를 경유해야 한다. 쿠키/크럼을 내부에서 처리한다.
생성자는 `new YahooFinance()`다 (v4에서 API가 바뀌었다).

**Yahoo `v8/finance/chart` raw 호출은 브라우저 User-Agent가 필수다.** 없으면 429가 온다.

**Stooq는 쓰지 마라.** JS proof-of-work 챌린지를 서빙한다. 검토했고 버렸다.

**한국 종목의 `priceToBook`는 비어 있을 수 있다.** 삼성전자에서 확인했다. 없으면 `null`로 두고 백분위
계산에서 제외한다. 0이나 추정치로 채우지 마라.

**Naver `siseJson` 응답은 유효한 JSON이 아니다.** 싱글쿼트를 쓴다. 파싱 전에 정규화해야 한다.
이 소스를 유지하는 이유는 Yahoo에 없는 **외국인소진율** 때문이다.

**이 Supabase 프로젝트에는 다른 프로젝트의 테이블이 같이 있다.**
`daily_market`(4325행), `credit_split_raw`(1619행), `lending_balance_raw`(4096행), `todos`, `ai_commentary`,
`analysis_snapshot`. 우리 것이 아니다. **드롭하거나 마이그레이션으로 건드리지 마라.**
우리 테이블은 §3(1) 표에 있는 6개뿐이다.

**Supabase 무료 티어는 7일 무활동 시 프로젝트를 pause한다.** pause되면 pg_cron도 같이 멈춘다.
그래서 대시보드에 "마지막 갱신 시각"을 항상 노출하도록 설계했다.

**Vercel Root Directory는 `web`이다.** 리포지토리 루트에는 Next.js 앱이 없다.

**`web/` 안에 별도 `package-lock.json`이 있다.** lockfile이 2개라 Next가 workspace root를 저장소
최상위로 추론했다. `web/next.config.ts`에 `outputFileTracingRoot`를 명시해서 해결했다.
경고가 다시 보이면 이 설정이 지워졌는지 확인하라.

---

## 9. 남은 작업 순서 (권장)

1. §3의 막힌 것 3개 해소 — 특히 `SUPABASE_SERVICE_ROLE_KEY`, `FRED_API_KEY`
2. `npm run universe` → `collect` → `candidates` → `prepare:bundle` → `/daily` → `publish:run`을
   한 번 완주해서 `daily_verdicts`에 실제 1행을 만든다. 이게 전체 파이프라인의 첫 실증이다.
   지금까지 모든 화면 검증은 빈 DB 또는 더미 1행 기준이므로, 실데이터로 도는 것은 아직 미확인이다.
3. P4: pg_cron 수집 자동화 + `claude login` 후 작업 스케줄러
4. spec §8.2 리포트 요청 큐 (`report_requests` INSERT + API 라우트)
5. (선택) Vercel GitHub 연동으로 전환 — §6 참조. 지금은 코드 변경 시 수동 재배포가 필요하다.

---

## 10. 이 시스템이 하지 않는 것

- **주문 실행을 하지 않는다.** 코드에 주문 경로가 없다. 매수·매도는 사용자가 증권사 앱에서 직접 한다.
- **백테스트 성능을 주장하지 않는다.** 참고한 TradingAgents 논문의 Sharpe 8.21은 저자도 낙폭이 거의
  없던 3개월 구간 때문이라고 인정했다. 이건 공개 데이터를 정리·해석하는 리서치 도구다.
- **투자자문이 아니다.** 라이선스 있는 자문이 아니며, 전 페이지에 고정 디스클레이머를 둔다
  (`web/components/Disclaimer.tsx`, 레이아웃 레벨에 배치됨).
