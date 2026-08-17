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
| P4 | 자동화 (헤드리스 `npm run daily` + 작업 스케줄러 07:20) | **완료** |

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

`macro` agent의 입력 대부분(금리 커브, 미국·유로존 CPI, 실업률, HY 스프레드, 지역 신용 스프레드)이 FRED에서 온다.

발급: https://fred.stlouisfed.org/docs/api/api_key.html — 무료, 즉시 발급.

**일본·한국 CPI만 FRED가 아니다.** FRED가 OECD에서 미러하던 시리즈가 각각 2021·2023년에
갱신이 끊겨서, `src/sources/dbnomics.ts`로 뺐다 — **키가 필요 없는** 공개 API다.

| 시장 | 시리즈 | 형태 |
|---|---|---|
| 일본 | `STATJP/CPIm/001` (일본 통계청) | 지수 → 전년동월비 계산 |
| 한국 | `OECD/DSD_PRICES@DF_PRICES_ALL/KOR.M.N.CPI.PA._T.N.GY` | 이미 전년동월비(%) |

> **DBnomics는 미러마다 최신성이 제각각이다.** IMF 미러는 13개월 밀려 있었고(미국까지 같아서
> 데이터가 아니라 갱신 지연이다), OECD의 일본 시리즈는 아직도 2021년에 멈춰 있다.
> 시리즈를 바꿀 일이 생기면 **반드시 마지막 관측일을 실측하고 골라라.**
>
> 두 시리즈는 형태가 다르다(지수 vs 퍼센트). `cpiFromObs(obs, kind)`가 그 변환을 담당하고
> 테스트로 고정돼 있다 — 헷갈리면 3%가 300%가 되어 그대로 판단에 들어간다.

### (3) ~~`claude -p` 미인증~~ → **해결됨 (2026-08-08)**

`claude -p`는 이제 로그인돼 있고 헤드리스 실행이 작동한다. `npm run daily` 한 줄로
수집부터 발행까지 전부 돈다. §5 참조.

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

### 자동 (권장) — 2026-08-08 추가

```bash
npm run daily           # 수집 → 데스크 6개 → 스크리닝 → 반대의견 → CIO → 기업리포트 → 발행
```

한 줄로 전 과정이 돈다. 소요 15-20분, LLM 호출 최대 13회.

동작 방식이 중요하다. `src/llm.ts`가 `claude -p --tools ""`를 **텍스트 in / JSON out**으로만 쓴다.
번들 전체를 프롬프트에 인라인으로 넣기 때문에 모델이 파일·셸 도구를 쓸 일이 없고,
따라서 **워크스페이스 신뢰·권한 프롬프트에 걸려 무인 실행이 멈추는 경로가 아예 없다.**

각 단계는 기존 검증기(`src/schema.ts`)를 통과해야 다음으로 넘어간다.
실패하면 **검증기 오류 메시지를 그대로 다시 프롬프트에 넣어** 최대 3회 재시도한다 —
"어느 필드가 왜 거부됐는지"가 모델이 고칠 수 있는 유일한 정보다.

> **함정 1.** `spawn`에 `shell: true`를 쓰지 마라. Windows 셸이 빈 문자열 인자를 삼켜서
> `--tools`가 값 없는 플래그가 되고 CLI가 `argument missing`으로 죽는다.
> `claude`는 `.exe`라 셸 없이 PATH에서 바로 실행된다.
>
> **함정 2.** 호출 타임아웃은 10분이다. 5분으로 뒀더니 CIO 단계에서 실제로 터졌다 —
> 번들 56KB를 읽고 JSON 10KB를 쓰는 가장 무거운 호출이다. 데스크는 60-90초에 끝난다.

단계별 실측 소요: 데스크 6개 각 60-90초, counter 약 1분, CIO 5분 이상, 기업 리포트 각 40-60초.

### 스케줄러

`scripts/daily.cmd`가 작업 스케줄러 진입점이다(cwd를 스스로 잡고 `logs/`에 날짜별 로그를 남긴다).

**등록 완료**: `jj-trading-agent-daily`, 매일 **07:20 KST**.
07:20인 이유는 미국 장 마감(05:00-06:00 KST) 이후이고 한국 장 시작(09:00) 전이기 때문이다.

```powershell
Get-ScheduledTaskInfo -TaskName "jj-trading-agent-daily"      # 다음 실행 시각 확인
Start-ScheduledTask     -TaskName "jj-trading-agent-daily"    # 지금 한 번 돌리기
Unregister-ScheduledTask -TaskName "jj-trading-agent-daily"   # 해제
```

> **함정 3.** `schtasks /Create`에 경로를 넘길 때 공백 때문에 인용이 깨진다("trading"에서 잘림).
> PowerShell `Register-ScheduledTask` cmdlet을 쓰면 이 문제가 없다.
>
> **함정 4 — `scripts/daily.cmd`는 ASCII로만 쓴다.** cmd.exe는 `.cmd`를 UTF-8이 아니라
> 시스템 ANSI 코드페이지(한국어 Windows는 CP949)로 읽는다. 한글 주석을 넣었더니
> 깨진 바이트가 명령 파싱을 망가뜨려 **07:20 첫 자동 실행이 9009로 죽었고 로그조차 안 남았다**.
> 날짜도 `%DATE%` 파싱 대신 PowerShell `Get-Date -Format yyyy-MM-dd`를 쓴다(로케일 무관).

**자동 공개가 켜져 있다.** `scripts/daily.cmd`가 `npm run daily -- --publish`를 부르므로
실행이 성공하면 사람 검토 없이 사이트에 바로 올라간다.
검토 후 공개로 바꾸려면 그 줄에서 ` -- --publish`만 지우면 된다.

### 실패 알림 — 2026-08-15 추가

2026-08-11~08-15 5일간 OAuth 세션 만료로 자동 실행이 조용히 실패했는데,
아무도 모르고 있다가 사용자가 물어봐서 발견했다. 그 재발 방지책이다.

`scripts/daily.cmd`가 종료 코드를 확인해 0이 아니면 `scripts/notify-failure.ps1`을
호출하고, 이 스크립트가 해당 날짜 로그의 마지막 25줄을 [ntfy.sh](https://ntfy.sh)로
푸시한다. 계정도 API 키도 필요 없는 무료 서비스다.

**구독 방법**: ntfy 앱(iOS/Android)에서 토픽 `jj-trading-agent-0f163934ef`를 추가하거나,
브라우저로 `https://ntfy.sh/jj-trading-agent-0f163934ef`를 열어 웹 푸시를 켠다.
토픽 이름을 아는 사람은 누구나 볼 수 있으니(비밀값이 아니라 추측하기 어려운 이름일 뿐)
다른 곳에 공개하지 않는다.

npm 자체가 실행되지 못하는 경우까지 잡으려고 `daily.ts`의 try/catch가 아니라
**`daily.cmd`의 종료 코드**에 걸었다 — `daily.ts` 안에서 무엇이 죽든 상관없이 잡힌다.

> **함정 5 — cmd.exe의 `if ( ... )` 블록은 괄호를 세는 방식이 원시적이다.**
> 따옴표로 감싼 PowerShell 코드 안의 `(...)`도 블록 파서가 괄호로 세어버려서
> `if not "%RC%"=="0" ( powershell -Command "...(...)..." )` 형태로 인라인했더니
> `.cmd` 파일 전체가 `"the was unexpected at this time."`로 깨졌다.
> 해결: `if not "%RC%"=="0" call :alert` + `:alert` 라벨 + `goto :eof`로 분리하고,
> 괄호가 많은 PowerShell 코드는 아예 별도 `.ps1` 파일(`notify-failure.ps1`)로 뺐다.
>
> **함정 6 — Windows PowerShell 5.1의 `Invoke-RestMethod -Body`는 바이트 배열을
> 시스템 코드페이지로 잘못 재인코딩한다.** 한글이 포함된 로그를 그대로 POST하면
> 전송 단계에서 깨진다(수신 측 문제가 아니라 실제로 깨진 바이트가 나간다).
> `notify-failure.ps1`은 `[System.IO.File]::WriteAllText(...)`로 UTF-8(BOM 없음)
> 파일을 쓴 다음 `curl.exe --data-binary @file`로 보내 이 인코딩 경로를 완전히 우회한다.

테스트: `scripts/daily.cmd`를 복사해 `npm run daily` 호출을 강제 실패로 바꾼 뒤
`cmd.exe /c`로 직접 돌려 실제로 ntfy에 한글 포함 메시지가 정상 도착하는 것까지 확인했다.

### 수동 (단계별로 보고 싶을 때)

```bash
npm run universe        # 유니버스 702종목 적재 — 최초 1회 및 분기 갱신
npm run collect
npm run prepare:bundle
# Claude Code에서 /daily 슬래시 커맨드로 데스크 6개 실행 → runs/<DATE>/agents-a.json
npm run candidates -- <DATE>
# 반대의견 + CIO + 기업리포트 → runs/<DATE>/agents-b.json
npm run publish:run -- <DATE>
```

### 공개 게이트

`npm run daily`는 기본값이 `published=false`다. `--publish`를 줘야 공개까지 간다.
스케줄러(`scripts/daily.cmd`)는 `--publish`를 켜둔 상태다.

수동으로 공개하려면:

```sql
update daily_verdicts set published = true where date = '<DATE>';
```

### 비용

`claude -p`는 호출당 시스템 프롬프트 캐시 생성 때문에 최소 $0.2 수준이 붙는다.
13회면 하루 **$2-3** 정도로 보면 된다. 줄이려면 기업 리포트 5건을 빼거나
`src/llm.ts`에서 `--model`을 낮추면 된다.

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
supabase/migrations/0002_market_snapshots_prices_anon_read.sql  근거 차트용 anon 정책
.claude/commands/daily.md   /daily 슬래시 커맨드
.superpowers/sdd/           각 task의 브리프·리포트·리뷰 이력 (왜 그렇게 됐는지의 근거)
```

### 섹터 클릭 → 보유종목 패널 — 2026-08-16 추가

홈의 섹터 카드를 누르면 판단 근거(rationale)와 상위 10종목(비중·시총·원화환산·12mf PER·
3개년 매출/이익·최근 두 분기 YoY)이 펼쳐진다.

**수집은 `daily.cmd`가 아니라 `daily.ts` 7단계에서, CIO가 스탠스를 낸 섹터만** 받는다
(`src/sources/holdings.ts`). 전 섹터(31개)를 매일 긁으면 종목당 3회 호출로 600회가 넘어
rate limit 위험이 크고, 보지도 않을 섹터를 받을 이유가 없다 — 사용자 확인 후 이 방식으로 결정.
LLM 호출이 아니라 Yahoo·네이버 API라 **토큰 비용은 0**이고 수집 시간만 1-2분 늘어난다.

- **한국 ETF 구성종목은 Yahoo에 없다**(topHoldings undefined 확인). 네이버 모바일 API
  (`m.stock.naver.com/api/stock/<코드>/etfAnalysis`의 `etfTop10MajorConstituentAssets`)가
  종목코드·이름·비중을 준다. KRX 정보데이터시스템은 세션 쿠키를 붙여도 `LOGOUT`을 돌려줘
  무인 실행에 못 쓴다(시도해서 확인함).
- **재무는 `fundamentalsTimeSeries(module:'financials')`를 쓴다.** `incomeStatementHistory`는
  Yahoo 공지대로 2024-11 이후 사실상 비어 있다.
- **`operatingIncome`은 은행에서 항상 null이다**(JPM·KB·HSBC 전부 확인). 세전이익으로
  대체하고 `incomeBasis` 필드로 어느 지표인지 남긴다 — 화면에도 "영업이익을 별도 보고하지
  않아 세전이익으로 대체" 안내가 붙는다. 라벨 없이 섞으면 다른 지표를 같은 이름으로
  비교하게 된다.

> **함정 15 — 런던 상장주는 필드마다 통화 단위가 다르다.** GBp(펜스) 호가인데
> **시가총액 필드만 파운드로 온다**(가격·PER 계열은 펜스 그대로). HSBC가 fPER 800.67로
> 나와서 발견했다 — forwardPE만 ÷100 보정하고 marketCap은 GBP 환율을 그대로 곱해야 한다.
> 실측: 502.1조(원화환산), fPER 8.0 — 은행 배수로 정상.
>
> **함정 16 — `fundamentalsTimeSeries`의 `date`는 문자열이 아니라 Date 객체다.**
> `String(r.date)`로 찍으면 "Sun Dec 31"이 된다. `r.date.toISOString().slice(0,10)`을 써야 한다.

**YoY 계산은 인덱스 정렬에 의존한다**(`web/lib/holdings.ts`의 `lastTwoQuartersYoy`) — 배열
끝에서 4칸 앞을 "전년 동기"로 본다. 중간에 결측 분기가 있으면(실제로 KB금융에서 발생)
어긋난 분기를 짝짓는 대신 **그 비교만 `null`(화면엔 "–")로 낸다** — 틀린 값보다 없는 편이
정직하다. 전년 실적이 적자(≤0)인 경우도 증가율이 부호를 왜곡하므로 같은 이유로 null이다.

### 근거 차트 전면 확대 — 2026-08-16 추가

근거 116건을 훑어보니 35건(30%)에 차트가 없었고, 지역 신용스프레드 12건은 **인용한 값이
아니라 지역 ETF 가격**이 붙고 있었다. 지금은 **뉴스 제외 98%**가 자기 값의 차트를 갖는다
(실측: 근거 96줄 중 매크로 15 · 가격 67 · 상관 6 · 없음 8[뉴스 7 + breadth 1]).

**원칙: 인용한 값 자신을 보여준다.** `EvidenceChart`의 우선순위는
① 상관 → -1~+1 눈금 ② 매크로·지역신용 → 그 지표 시계열 ③ 그 외 → 관련 자산 가격.

- **`chartIndex`** — `features.sleeves[7]`처럼 인덱스로 된 경로는 배열 순서를 알아야
  티커가 나오는데 화면은 features를 통째로 받지 못한다. 수집 때 `buildChartIndex(features)`가
  경로→심볼 맵(70개)을 만들어 macro 스냅샷에 실어 보낸다.
  **순서를 웹에 복제하지 않는 것이 핵심** — 복제하면 배열이 바뀔 때 조용히 엉뚱한 차트가 붙는다.
- **지역 신용스프레드 시계열** — `collectRegionMacro`가 `{macro, series}`를 내도록 바꿔
  US·EU·EM·KR 4종을 저장한다. 이제 EU 신용을 인용하면 VGK 가격이 아니라 EU OAS가 그려진다.
- **상관** — 값 하나에 뜻이 다 들어 있어 추이가 아니라 **척도 위 위치**가 답이다.
  `CorrelationBar`가 -1~+1 눈금에 찍고 0.9 초과는 붉게 "분산 없음"을 단다.
  `CorrelationMatrix`는 5×5 표를 색 강도로 보여준다(홈 화면 별도 섹션).
  값은 `evidence.value` 앞머리 숫자를 파싱해 쓴다 — 별도 조회가 필요 없다.

> **함정 14 — 티커에 점이 있으면 경로 파싱이 조용히 실패한다.**
> `features.sectorValuation.EXV1.DE.per`에서 첫 조각만 자르면 `EXV1`이 되어 못 찾는다
> (EU 섹터 2건이 실제로 이래서 차트가 없었다). `extractChartSymbol`이 알려진 심볼 목록을
> 받아 **가장 긴 것부터 맞춰본다**. `091160.KS`도 같은 경우다.

`features.regime.breadth`는 RSP/SPY 비율의 이격이라 단일 종목 가격이 아니다 —
의도적으로 차트를 붙이지 않는다. 지어낸 차트보다 없는 편이 정직하다.

### 매크로 지표 차트 — 2026-08-16 추가

근거에 "실질금리 2.39%"가 나오면 그 옆에 **그 지표 자신의 1년 추이**가 붙는다.
전에는 가격 차트만 그릴 수 있어서 매크로를 인용해도 관련 ETF 종가가 붙었는데,
그건 인용한 값과 **다른 것**을 보여주는 셈이었다.

- `collectMacro()`가 이제 `{ macro, series }`를 낸다. FRED 원시 시계열을 버리지 않고
  `market_snapshots(kind='macro')`의 `payload.series`에 함께 저장한다(12종, 91KB/일).
  일간은 260관측(1년), 월간은 60관측. 키는 **`MacroBlock`의 필드명과 동일** —
  화면이 `features.macro.realYield10y` 경로에서 바로 찾게 하려는 것이다.
  `curve2s10s`/`curve3m10y`는 날짜를 맞춰 뺀 파생 시계열이고, CPI는 YoY로 변환해 넣는다.
- `EvidenceChart`가 **매크로를 먼저** 찾고 없을 때만 가격 차트로 넘어간다.
- `MacroSparkline`은 가격용과 달리 **부호가 바뀌는 지표에 0선을 그린다**(금리차·실질금리).
  값 하나로는 수준을 알 수 없다는 것이 이 차트의 존재 이유다.
- RLS: `kind='macro'`에 anon 읽기 정책 추가(마이그레이션 0004). FRED 공개 데이터라
  민감도가 없다. `features`는 계속 비공개.

`MACRO_LABELS`(web/lib/format.ts)에 없는 필드는 차트를 안 그린다 — 저장된 시계열이
없는 값을 그릴 수는 없다. 지표를 추가하려면 `collectMacro`의 `series`와 이 표 둘 다 고친다.

### 화면 문장과 강조 — 2026-08-16 추가

`prompts/README.md`에 **"문장 쓰는 법"** 절을 넣었다(공통 규칙이라 모든 agent가 받는다).
결론 먼저, 한 문장에 한 가지, 숫자는 비교 대상과 함께, 그리고 핵심은 `**굵게**`.
한 문단에 한두 곳만 강조하도록 못박았다 — 다 굵으면 아무것도 안 굵은 것과 같다.

`web/components/RichText.tsx`가 `**...**`만 `<strong>`으로 렌더한다.
**마크다운 라이브러리를 쓰지 않았다.** 파서를 들이면 표·링크·이미지까지 렌더 가능해져
**LLM 출력이 곧 마크업이 되는 표면**이 생긴다. 강조 하나만 처리하고 나머지는 평문이다.
짝이 안 맞는 `**`는 문장을 삼키지 않고 글자로 남는다(`RichText.test.ts`가 이걸 고정한다).

LLM이 쓴 서술 필드는 전부 `RichText`를 거친다 — `rationale`·`comment`·`reasoning`·
`headline`·`point`·`thesis`·`key_risk`·`counter_case`·`outlook`·`themes[].body`·`changes[].reason`.
라벨·티커·숫자는 감싸지 않는다(강조 대상이 아니다).

화면 위계도 정리했다: 결론(신호·점수·권장비중·확신도·시야·국면)을 상단 카드 한 덩어리로
모았고, 섹션 제목을 본문보다 확실히 무겁게 바꿨다. 전에는 모든 제목이 같은 크기 회색이라
"무엇부터 읽어야 하는가"가 안 보였다.

### SAA / TAA 와 배분 주기 — 2026-08-16 추가

**일간 판단으로 배분을 갈아끼우면 안 된다.** 2026-08-07~16 일간 판단 6개를 실측했다:

| | |
|---|---|
| 신호 | 6일 내내 `hold` |
| 주식 점수 | 57-58 (범위 1점) |
| **시장 스탠스 전환** | **25개 시장-일 중 13개 = 52%** |
| 시장 비중 일평균 변화 | 1.2-2.0%p |
| 주식 밴드 중앙값 일평균 변화 | 2.5%p (최대 6%p) |

최상위 뷰가 사실상 고정인데 그 아래가 매일 뒤집힌다. 한국은 8영업일 동안
N→UW→N→UW→UW→N으로 4번 왕복했다. **시장이 바뀐 게 아니라 모델이 매일 백지에서
다시 정하는 것**이고, 3-6개월 시야에서 이건 신호가 아니라 회전율이다.

그래서 3층으로 나눴다:

| 층 | 무엇 | 주기 | 어디에 있나 |
|---|---|---|---|
| **SAA** | 전략 기준선 | **연 1회** | `src/saa.ts` 상수 (사람이 바꾼다) |
| **TAA** | SAA 대비 편차 | **월 1회 확정** | 월간 리포트 |
| 일간 | 확정 TAA 대비 이탈 감시 | 매일 | 홈의 드리프트 패널 |

`src/saa.ts`가 기준선의 단일 출처다(`monthly.ts`는 여기서 재수출만 한다 — 두 군데
두면 한쪽만 고쳐졌을 때 ± 열이 조용히 틀린다). SAA 세 축의 출처가 다르고 그 차이가
신뢰도 차이라서 화면에도 적었다: 주식=시가총액(사실), 채권=업계 관례,
**대체자산=이 시스템이 정한 규약(시장 사실 아님)**.

**강조 문턱(`MATERIAL`)은 실측 잡음에서 역산했다.**
- 스탠스 전환만으로는 강조하지 않는다 — 절반이 매일 바뀌므로 강조가 의미를 잃는다.
- 자산군·시장 비중은 일간 잡음(~2.5%p)의 두 배인 **5%p**부터.
- sleeve 내부는 분모가 작아 **10%p**부터.
- 듀레이션 전환·신호 전환은 드물고 결과가 커서 크기 무관 강조.

> **관측 — 2026-08 리포트의 변화 6건이 전부 비강조다.** 최대 이동이 4%p로 문턱 미달이다.
> 버그가 아니라 위 논리의 결론이다: **이 시스템의 월간 변화가 아직 일간 잡음보다 작다.**
> 강조 렌더링 자체는 DB에서 material을 켜서 뱃지·앰버 강조·상단 정렬까지 확인했다.

**TAA 앵커링 (2026-08-16 적용)** — 회전율을 보여주는 데 그치지 않고 실제로 줄인다.

`readStandingTaa()`가 최신 월간 리포트의 `as_of`로 그 날 판단을 되짚어 확정 배분을 만들고,
`candidates.ts`가 그것을 `bundle-b.standing_taa`에 실어 CIO에게 준다.
`prompts/cio.md`의 **0절**(다른 모든 절보다 먼저 읽게 배치)이 규칙이다:

1. `standing_taa.invalidation`이 오늘 데이터로 깨졌는지 **먼저** 확인 → 깨졌으면 인용하며 변경
2. 아니면 데스크·반대의견이 **확정 당시와 다른 사실**을 가져왔는지 → 지표가 실제로 움직였어야 함
3. 둘 다 아니면 **그대로 낸다**

금지: 근거 없는 ±1-2%p 미세조정, 데이터 변화 없는 스탠스 전환, `standing_taa` 무시.
유지한 항목도 `rationale`은 오늘 기준으로 다시 쓰게 했다("유지"만 적으면 안 됨).

> 배분 스냅샷을 월간 리포트에 따로 저장하지 않고 `as_of`로 되짚는다.
> 확정 배분은 그 판단 **자체**라서 복사본을 두면 둘이 어긋날 수 있다 — 출처를 하나로 둔다.

### 월간 리포트 자동 실행 — 2026-08-16 추가

**등록 완료**: `jj-trading-agent-monthly`, 매일 **08:30 KST**(일간 07:20 실행이 끝난 뒤).

```powershell
Get-ScheduledTaskInfo -TaskName "jj-trading-agent-monthly"    # 다음 실행 시각
Start-ScheduledTask    -TaskName "jj-trading-agent-monthly"   # 지금 한 번
Unregister-ScheduledTask -TaskName "jj-trading-agent-monthly" # 해제
```

**매일 깨어나지만 한 달에 한 번만 일한다.** `scripts/monthly.cmd`가 전월(`AddMonths(-1)`)을
대상으로 `npm run monthly -- <월> --publish --if-missing`을 부른다.

> **함정 11 — PowerShell에 월간 트리거가 없다.** `New-ScheduledTaskTrigger`는
> `-Once/-Daily/-Weekly`만 지원하고 월간은 없다. `schtasks /SC MONTHLY`는 함정 3의
> 경로 인용 문제가 있다. 그래서 **일간 트리거 + `--if-missing` 가드**로 풀었다.
> 부수 효과가 오히려 이득이다 — 1일에 PC가 꺼져 있어도 다음 부팅 때 스스로 채운다.
>
> **함정 12 — "이미 있는가"로 건너뛰면 그 달을 영영 못 채운다.** 월중에 만든 리포트는
> 그 시점까지만 담는다. 8/16에 만든 8월 리포트를 9/1에 존재만 보고 건너뛰면
> 8/17~31이 영영 빠진다. 그래서 `readMonthlyReportAsOf`로 **저장된 as_of와 그 달
> 마지막 판단 날짜를 비교**해 오래됐으면 다시 만든다. 실제로 as_of를 8/15로 되돌려
> 재생성되는 것까지 확인했다.
>
> **함정 13 — 그 달에 판단이 없는 것은 실패가 아니다.** 처음 붙였을 때 대상이 2026-07이라
> "판단 없음"으로 exit 1이 났고, 그대로 뒀으면 9/1까지 **매일 거짓 알림**이 울렸다.
> `--if-missing`이 붙은 스케줄러 모드에서는 조용히 exit 0으로 넘어가고,
> 수동 실행은 그대로 시끄럽게 실패한다(`SKIP` 심볼로 구분).

실패 시 알림은 일간과 같은 ntfy 토픽으로 간다(`scripts/notify-failure.ps1` 공용).

### 월간 리포트 — 2026-08-16 추가

`npm run monthly -- 2026-08 --publish` (인자 없으면 이번 달). 참고 형식은 저장소 루트의
`global-asset-allocation-viewpoints-us.pdf`(T. Rowe Price 월간 뷰포인트)다.
웹은 `/monthly`(최신)와 `/monthly/<YYYY-MM>`(아카이브).

**핵심 설계 — 숫자는 코드, 이유는 모델.**
`src/monthly.ts`가 두 판단을 비교해 무엇이 얼마에서 얼마로 바뀌었는지 전부 계산하고,
모델은 `reason`·`outlook`·`themes`·`key_risks`만 채운다. 검증기(`validateMonthlyNarrative`)가
**모델이 돌려준 `changes[].area` 목록이 코드가 만든 것과 정확히 일치하는지** 확인한다 —
"지난달 대비 이렇게 바뀌었다"는 리포트에서 가장 조용히 틀리는 자리라 여기를 막았다.

**중립 배분**(`NEUTRAL_EQUITY`/`NEUTRAL_BOND`/`NEUTRAL_ALT`)이 있어야 Relative(±) 열이 성립한다.
셋의 출처가 다르다는 점이 중요하다 — 주식은 시가총액 근사(사실), 채권은 업계 관례,
**대체자산은 시가총액 중립이 존재하지 않아 이 시스템이 정한 규약**이다. 마지막 것은
시장의 사실이 아니므로 화면에 그렇게 적어 뒀다(`MonthlyReportView`의 `NEUTRAL_NOTE`).

> **함정 10 — 비교 기준을 날짜만으로 고르면 빈 리포트가 나온다.** 첫 리포트는 전월이 없어
> 그 달 첫 판단과 비교하는데, 2026-08-04는 CIO 개편 이전이라 `markets`도 `asset_allocation`도
> 없어서 변화가 0건으로 나왔다. `readEarliestVerdictInMonth`가 `verdict->markets`가 있는 행만
> 고르도록 고쳤다(그래서 8/07이 기준이 되어 6건이 잡혔다).
> 무엇과 비교했는지는 `prev_basis`(`previous-month` | `month-start`)로 남겨
> 화면이 "전월 대비"라고 잘못 쓰지 않게 했다.

**아직 진짜 전월 비교는 못 했다.** 데이터가 2026-08부터라 첫 리포트는 월중 비교다.
2026-09 리포트가 최초의 실제 전월 대비가 된다.

### 채권·대체자산 배분 — 2026-08-16 추가

그동안 배분은 `equity/bond/cash` 밴드 세 개가 전부였고 "채권 안에서 무엇을 살지"는 없었다.
소버린/크레딧/이머징, 듀레이션, 대체자산 축을 추가했다.

**새 데이터**(`src/collect.ts`)
- `BOND_ETFS` 10종 — SHY·IEF·TLT(듀레이션 사다리), BWX(미국 외 선진국 국채),
  TIP(물가연동), LQD·HYG·BKLN(크레딧), EMB·EMLC(이머징). 벤치마크는 `AGG`.
- `ALT_ETFS` 9종 — GLD·SLV(귀금속), DBB·DBC(산업금속·원자재),
  PSP·BIZD(상장 PE·BDC), IGF·VNQ·REET(인프라·리츠).
- 각 항목에 **분배수익률**(`fetchDistYield`), AGG 대비 `rel3m`(채권만),
  변동성, **`corrToEquity60d`**(SPY와 60일 상관), 200일선 이격.
- `features.duration` — 사다리 수익률 + `longMinusShort3m`(TLT−SHY) + 양쪽 변동성.
- FRED 3종 추가: `igSpread`(BAMLC0A0CM), `realYield10y`(DFII10), `breakeven10y`(T10YIE).
  IG/HY OAS 격차가 크레딧 선택을, 실질금리가 금·듀레이션 판단을 받친다.

**CIO 출력**(`asset_allocation`)에 `alt` 밴드, `fixed_income[]`, `duration`, `alternatives[]` 추가.
sleeve 내부 비중은 **합 100**이며 검증기가 강제한다 — 전체 포트폴리오 비중으로 착각해
합 25 같은 값을 내면 배분표가 조용히 틀리기 때문이다.

> **함정 7 — `distYield`는 만기수익률(YTM)이 아니다.** Yahoo `summaryDetail.yield`는
> 최근 12개월 분배 기준이다. 특히 **TIP은 물가연동 원금상승분이 섞여 실질금리와 전혀 다르다**
> (실측 분배 4.47% vs 실질금리 2.39%). 프롬프트에 "같은 채권끼리 상대 비교에만 쓰고
> 절대 수준을 YTM처럼 인용하지 마라"를 명시했고, 실질금리는 `macro.realYield10y`를 쓰게 했다.
>
> **함정 8 — 유럽 단독 소버린 ETF는 USD 표시가 없다.** XETRA/암스테르담 상장분(IEGA·EUNH 등)은
> 전부 EUR 표시라 USD ETF들과 섞으면 환율 효과가 빠진 비교가 된다(REGION_ETFS와 같은 이유).
> BWX(미국 외 선진국, 무헤지)로 대신하되 **일본이 상당히 들어 있어 "유럽"이라 부르면 안 되고**,
> 유럽 고유 금리는 기존 `regionMacro.EU.bond10y`(분트)를 쓰라고 프롬프트에 못박았다.
>
> **함정 9 — 분산은 자산군 이름이 아니라 `corrToEquity60d`로 판단한다.** 2026-08-16 실측에서
> 금의 주식 상관이 0.52로 분산재가 아니었고, 오히려 VNQ(-0.13)·DBC(-0.19)가 분산재였다.
> 프롬프트 초안에 "PSP·BIZD는 대체로 상관 0.8 초과"라고 썼다가 실측(0.61/0.40)과 달라 지웠다 —
> **프롬프트에 특정 숫자를 단정해 넣으면 모델이 데이터 대신 그 문장을 인용한다.**

### 근거 옆 미니 차트 — 2026-08-15 추가

`DriverCard`(근거 데이터 한 줄한 줄)와 `MarketCard`(시장 카드 상단)에 가격 미니 차트를 붙였다.
`market_snapshots(kind='prices')`는 매일 한 행에 심볼당 최근 1년 가까운 OHLCV가 통째로
들어있는데, 지금까지 anon 정책이 없어서(0001의 "원시 데이터 비공개") 웹이 못 읽었다.
`kind='prices'`만 여는 정책을 새로 추가했다(`features`/`macro`는 계속 비공개 — 최소 노출 유지).

- `web/lib/queries.ts`의 `getPriceHistory()`가 최신 행 하나를 읽어 심볼별 종가만 잘라 낸다.
  실패해도 빈 객체를 반환한다 — 차트는 부가 기능이라 죽으면 페이지 전체가 죽으면 안 된다.
- `web/lib/format.ts`의 `extractChartSymbol(source)`가 evidence의 `source` 경로 문자열
  (`"features.assets['SPY'].rsi14"`, `"features.valuation.US.per"` 등)에서 차트를 그릴
  티커를 뽑는다. 매크로 곡선·상관계수처럼 단일 자산으로 설명 안 되는 근거는 `null`이라
  차트가 안 붙는다 — 실측에서 evidence 95개 중 61개(64%)가 차트로 나갔다.
- `web/components/PriceSparkline.tsx`가 실제 recharts 렌더링, `EvidenceChart.tsx`는
  그 위에 source 파싱만 얹은 얇은 래퍼다. `MarketCard`는 `regionEtf(code)`로 그 시장
  대표 ETF를 직접 그린다.

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

1. **`web/` 재배포 대기** — 홈·히스토리 페이지를 `force-dynamic`으로 바꾼 커밋(49d4014)이
   아직 배포되지 않았다. Vercel 무료 티어 일일 배포 한도(100회)에 걸렸고
   **2026-08-09 09:10 KST**에 풀린다. 그때 §6 방식으로 재배포하면 캐시 지연이 사라진다.
   지금은 ISR 1시간이라 발행 직후 최대 한 시간 어제 것이 보인다.
2. ~~스크리너 섹터 쏠림~~ → **해결됨 (2026-08-08, 커밋 528c934)**
   `rankByMomentum`과 `scoreCandidates` 둘 다 섹터 라운드로빈으로 바꿨다.
   2026-08-07 데이터 기준 12/12 기술주 → **4/4/4**(기술·헬스케어·금융)로 바뀐 것을 실측 확인했다.
   **두 단계 모두에 넣어야 한다** — 24종목 단계에만 넣었더니 최종 12에서 점수순 재정렬로
   기술주가 8/12로 되돌아왔다. CIO가 보는 것은 최종 12다.
3. **2026-11초에 밸류에이션 백분위가 켜진다** — 코드는 이미 들어가 있고(커밋 e09bf65)
   `market_snapshots`에 매일 쌓이는 중이다. 60거래일이 모이면 자동으로 `perPctile`이
   null에서 숫자로 바뀐다. `npm run collect` 로그에 `밸류에이션 히스토리 N일`로 진행도가 찍힌다.
   그때 fundamental 데스크의 "횡단면 비교뿐" 한계가 사라지므로 결과를 한 번 확인할 것.
4. spec §8.2 리포트 요청 큐 (`report_requests` INSERT + API 라우트)
5. (선택) Vercel GitHub 연동으로 전환 — §6 참조. 지금은 코드 변경 시 수동 재배포가 필요하다.
6. ~~지역별 섹터 데이터~~ → **부분 해결됨 (2026-08-15)**. 한국 8개(모멘텀만, Yahoo에
   밸류에이션이 없음 확인됨) · 유럽 12개(iShares STOXX Europe 600, 모멘텀+밸류에이션 둘 다
   실측)를 추가했다(`SECTOR_ETFS_KR`/`SECTOR_ETFS_EU`, `src/collect.ts`).
   `features.relative.sectors`에 `region` 태그가 붙었고, rel3m은 각자 지역 벤치마크
   (US=SPY, KR=EWY, EU=VGK) 대비로 계산된다. 종목 스크리너는 여전히 US 11개 GICS
   영어명 어휘만 받으므로(KR·US 유니버스 공용) EU 섹터 콜은 스크리닝이 아니라 CIO의
   `sectors[]` 하우스뷰(자문성) 쪽으로만 흐른다. 일본·이머징 섹터 ETF는 이번에 찾아보지
   않았다 — 요청 범위가 한국·유럽이었다. 필요해지면 같은 방식(Yahoo 심볼 탐색 →
   `SECTOR_ETFS_JP`/`SECTOR_ETFS_EM` 추가)으로 확장하면 된다.

---

## 10. 이 시스템이 하지 않는 것

- **주문 실행을 하지 않는다.** 코드에 주문 경로가 없다. 매수·매도는 사용자가 증권사 앱에서 직접 한다.
- **백테스트 성능을 주장하지 않는다.** 참고한 TradingAgents 논문의 Sharpe 8.21은 저자도 낙폭이 거의
  없던 3개월 구간 때문이라고 인정했다. 이건 공개 데이터를 정리·해석하는 리서치 도구다.
- **투자자문이 아니다.** 라이선스 있는 자문이 아니며, 전 페이지에 고정 디스클레이머를 둔다
  (`web/components/Disclaimer.tsx`, 레이아웃 레벨에 배치됨).
