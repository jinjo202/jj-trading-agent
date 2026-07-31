# 멀티에이전트 투자 분석 대시보드 — 설계 문서

- 작성일: 2026-07-31
- 상태: 승인됨 (구현 착수)

## 1. 목적

매일 아침 다음 4가지 질문에 근거와 함께 답하는 웹 대시보드를 만든다.

1. 지금 주식 비중을 늘릴 타이밍인가?
2. 늘린다면 왜인가? — 차트·뉴스·매크로·펀더멘털을 결합한 근거
3. 어느 국가, 어느 섹터를 늘릴 것인가?
4. 종목 단에서는 무엇을 볼 것인가? 그리고 그 종목의 1장짜리 기업분석 리포트

**비목표 (명시적으로 하지 않는 것)**

- 주문 실행. 매수/매도는 사용자가 증권사 앱에서 직접 한다. 코드에 주문 경로를 만들지 않는다.
- 백테스트 성능 주장. 이 시스템은 공개 데이터를 정리·해석하는 리서치 도구다.
- 투자자문. 라이선스 있는 자문이 아니며, 앱 전면에 고정 디스클레이머를 둔다.

## 2. 제약 조건

| 항목 | 결정 |
|---|---|
| 시장 | 한국(KOSPI/KOSDAQ) + 미국(S&P500/나스닥) |
| 데이터 | 무료 소스만 |
| LLM 추가 비용 | 0원. 분석은 로컬 Claude Code 구독 안에서 실행 |
| 웹 호스팅 | Vercel Hobby (무료) |
| DB | 기존 Supabase 프로젝트 `super-use-project` (ref `jsxhcqnupvvctnjiaric`, ap-northeast-2) 재사용 |
| 런타임 | Node 24, TypeScript. 로컬에 Python 없음 |
| 주문 실행 | 없음 |

## 3. 레퍼런스 조사 결과

| 레퍼런스 | 채택한 것 | 버린 것과 이유 |
|---|---|---|
| [TradingAgents](https://github.com/TauricResearch/TradingAgents) — 애널리스트팀(펀더멘털·심리·뉴스·기술) → 리서치팀 강세/약세 n라운드 토론 → 트레이더 → 리스크팀 3인 토론 → 펀드매니저. LangGraph, 공유 상태. | 자유 대화가 아닌 **구조화된 리포트 핸드오프**. **반대의견을 강제로 생성**시켜 확증편향을 깨는 단계. | n라운드 토론. 예측 1건당 LLM 11회 + 툴 20회 호출은 과잉이고, 논문 자체가 예산 제약으로 3개월밖에 백테스트하지 못했다고 밝힘. 1패스 반대의견으로 압축. |
| [ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) — 인물 페르소나 agent + Valuation/Sentiment/Fundamentals/Technicals + Risk Manager(포지션 한도) + Portfolio Manager(종합). | **모든 agent가 동일한 출력 계약** `{signal, confidence, reasoning}`. **시그널 생성과 비중 결정의 분리.** | 인물 페르소나(버핏·버리·우드 등). 재미있지만 "왜 이 점수인가"를 데이터로 역추적할 수 없다. 우리는 근거 숫자와 출처를 요구한다. |
| [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) — 4계층. Data-CoT → Concept-CoT → Thesis-CoT. | **데이터수집 → 추론 → 논지작성의 단계 분리.** 기업 1장 리포트에 이 순서를 그대로 적용. | LLMOps/파인튜닝 계층. FinGPT 학습이 필요하고 무료 제약과 맞지 않음. |
| [Macrosynergy 글로벌 주식배분 스코어카드](https://macrosynergy.com/research/a-macro-quantamental-scorecard-for-global-equity-allocation/), 매크로 레짐 필터 문헌 — VIX 수준+기간구조, 2s10s·3m10y, 크레딧 스프레드, 시장 브레드스를 중립값 기준 z-score로 정규화 후 등가중 평균. | **매크로/타이밍 레이어는 결정론적 합성점수로 계산.** 등가중은 매크로 효과 분산 목적. | 마르코프 스위칭 레짐 피팅. 데이터·검증 부담이 크고 소규모 무료 파이프라인에서 과적합 위험. |

### 조사에서 나온 단 하나의 핵심 원칙

**숫자는 코드가 계산하고, 해석만 LLM이 한다.**

위 오픈소스들의 공통 약점은 지표 계산까지 LLM에게 맡겨 숫자가 실행마다 흔들리는 것이다.
우리 agent는 이미 계산이 끝난 feature JSON을 입력으로 받아 해석과 서술만 담당한다.
이로써 (a) 숫자 환각 제거, (b) 동일 입력에 대한 재현성, (c) LLM 호출 수 최소화를 동시에 얻는다.

## 4. 데이터 소스 — 실측 검증 완료 (2026-07-31)

| 소스 | 검증 결과 | 용도 | 키 |
|---|---|---|---|
| `yahoo-finance2` v4 npm (`new YahooFinance()`) | **성공.** 쿠키/크럼을 내부 처리. `quoteSummary`로 AAPL `PBR 45.9 / fwdPE 34.5 / ROE 1.41 / D/E 79.5 / revG 16.6% / opMargin 32.3% / Technology`, 삼성전자 `005930.KS` `fwdPE 3.81 / ROE 18.9% / D/E 5.78 / revG 69.2% / opMargin 42.8% / Technology` | **한·미 가격 + 펀더멘털 메인** | 불필요 |
| Yahoo `v8/finance/chart` raw | 200. 브라우저 User-Agent 필수(없으면 429). OHLCV + 52주 고저 + longName | 지수·ETF 시계열 (라이브러리 우회 경로) | 불필요 |
| Naver `api.finance.naver.com/siseJson.naver` | 200. 무키. OHLCV + **외국인소진율** | 한국 폴백 + **외국인 수급** (Yahoo에 없는 값) | 불필요 |
| FRED `api.stlouisfed.org` | 도달 확인 (400 = 키 없음) | 미국 매크로 | 무료 발급 |
| 네이버 뉴스 (Claude Code MCP) | 세션에 연결됨 | 한국 뉴스 | MCP |
| US 뉴스 RSS | — | 미국 뉴스 | 불필요 |
| ~~Yahoo `v10/quoteSummary` raw curl~~ | `Invalid Crumb`. `v7/quote`도 `Unauthorized` | raw 호출 금지, 반드시 라이브러리 경유 | — |
| ~~Stooq~~ | **차단.** JS proof-of-work 챌린지 | 사용하지 않음 | — |
| DART OpenAPI / SEC EDGAR XBRL | 둘 다 200 도달 확인 | **P1 범위에서 제외.** 선택적 보강 | DART 무료 발급 |
| 한국은행 ECOS | 미검증 | 선택적 보강 (한국 기준금리·수출) | 무료 발급 |

**DART/SEC를 P1에서 뺀 이유**: 애초에 한국은 DART, 미국은 SEC로 펀더멘털을 나눠 가져올 계획이었다.
그러려면 DART는 ZIP으로 배포되는 `corp_code` 매핑, SEC는 `company_tickers.json` CIK 매핑과 XBRL 태그
정규화가 각각 필요하다. 실측 결과 `yahoo-finance2` 하나가 두 시장의 성장률·마진·ROE·부채비율·섹터를
같은 형태로 반환하므로, 매핑 계층 두 개와 소스 두 개가 통째로 불필요해진다.
DART/SEC는 원문 공시가 필요해질 때 보강한다.

한국 PBR은 `priceToBook`이 비어 있는 경우가 확인되었다. 없으면 `null`로 두고 해당 지표를
백분위 계산에서 제외한다. 결측을 0이나 추정치로 채우지 않는다.

시장 브레드스는 500개 종목을 매일 긁는 대신 ETF 프록시(RSP/SPY 비율)로 근사한다.
rate limit과 실행시간을 줄이는 의도적 단순화이며, 방향성은 동일하다.

## 5. 아키텍처 — 3개 프로세스

```
① 수집 (LLM 없음, 결정론적)
   Supabase Edge Function `collect` + pg_cron, 매일 06:00 KST
   Yahoo/Naver/FRED/DART/SEC/뉴스 fetch → 지표 계산 → market_snapshots INSERT
                    ↓
② 분석 (LLM = 로컬 Claude Code, 구독 안에서 실행 → 추가 비용 0)
   최신 스냅샷 읽기 → agent 7개 파이프라인 → agent_reports + daily_verdicts INSERT
                    ↓
③ 표시 (LLM 없음)
   Next.js on Vercel → Supabase 읽기 전용
```

**웹앱에는 LLM 키가 존재하지 않는다.** 따라서 방문자 수와 비용이 무관하다.
분석은 하루 1회 미리 계산되어 DB에 저장되고, 웹은 뷰어다.

수집 코드는 순수 TypeScript 모듈로 작성해 Edge Function과 로컬 러너가 같은 모듈을 import한다.
서버 크론이 죽어도 로컬에서 동일 수집을 재실행할 수 있다.

## 6. Agent 설계

### 6.1 공통 출력 계약

모든 분석 agent가 동일한 형태를 반환한다.

```ts
type AgentOutput = {
  agent: string
  score: number       // 0-100, 50 = 중립
  confidence: number  // 0-1
  signal: 'bullish' | 'neutral' | 'bearish'
  headline: string    // 한 줄 요약
  reasoning: string   // 3-6문장
  evidence: { label: string; value: string; source: string }[]  // 근거 숫자 + 출처 필수
  flags: string[]     // 리스크·주의사항
}
```

동일 계약의 효과: 종합 agent가 파싱 분기 없이 합칠 수 있고, 대시보드 카드 컴포넌트도 하나를 재사용한다.
`evidence`에 출처를 강제하는 것이 환각 방지 장치다. 스냅샷에 없는 숫자는 쓸 수 없다.

### 6.2 Agent 목록

| # | agent | 입력 feature | 출력 |
|---|---|---|---|
| 1 | `macro` | 2s10s, 3m10y, CPI/코어CPI, 실업률, DXY, WTI, HY 스프레드, VIX 수준+기간구조, 한국 기준금리·수출증감 | 레짐 라벨(확장/둔화/침체/회복) + score |
| 2 | `allocation` | macro score + 지수 200일선 이격 + 실현변동성 + 12-1 모멘텀 | 권장 주식비중 % 범위 |
| 3 | `country_sector` | KR vs US 상대강도·밸류에이션·원달러, 11개 섹터 ETF 상대모멘텀 | 국가/섹터 OW·N·UW 랭킹 |
| 4 | `technical` | 지수 및 후보종목의 SMA(20/60/200), RSI, MACD, ATR, 52주 위치, 거래량 추세 | 추세·모멘텀 score |
| 5 | `news` | 네이버 뉴스 MCP + US RSS 헤드라인 | 심리 score + 핵심 이벤트 3개 |
| 6 | `fundamental` | `yahoo-finance2 quoteSummary`: 매출성장률, 영업이익률, ROE, 부채비율, forwardPE/PBR의 후보군 내 백분위 | 종목별 퀄리티/밸류 score |
| 7 | `synthesizer` | 위 6개 리포트 전부 + 반대의견 | 최종 `DailyVerdict` |

### 6.3 반대의견 단계 (필수)

`synthesizer` 직전에 LLM 1회를 써서 **현재 우세한 결론의 반대 논거**를 생성한다.
`synthesizer`는 그 반대 논거를 반박하거나 수용해야 하며, 결과를 `counter_case`에 남긴다.
TradingAgents의 강세/약세 토론에서 가장 값어치 있는 부분만 저비용으로 가져온 것이다.

### 6.4 종목 후보 좁히기 (비용이 터지는 지점)

전 종목에 LLM을 돌리면 실행시간과 비용이 폭발한다. 2단 스크리닝을 쓴다.

1. **결정론적 스크리너 (코드, LLM 0)**: `country_sector`가 OW로 뽑은 섹터 내에서 유동성 필터 → 모멘텀 + 퀄리티 랭킹 → 상위 12개
2. **LLM은 12개만** 평가 → 최종 top 5

유니버스는 KOSPI200 + S&P500. 티커 리스트는 리포지토리의 정적 JSON으로 두고 분기마다 갱신한다.

## 7. 최종 산출물 스키마

```ts
type DailyVerdict = {
  date: string
  // Q1 — 지금 늘릴 타이밍인가
  equity_score: number                        // 0-100
  signal: 'increase' | 'hold' | 'reduce'
  suggested_equity_weight: [number, number]   // 예: [60, 70] (%)
  conviction: 'low' | 'medium' | 'high'
  // Q2 — 왜인가
  drivers: { agent: string; direction: '+' | '-'; weight: number; point: string }[]
  counter_case: string
  // Q3 — 어느 국가·섹터
  countries: { code: 'KR' | 'US'; stance: 'OW' | 'N' | 'UW'; rationale: string }[]
  sectors:   { name: string; stance: 'OW' | 'N' | 'UW'; etf: string; rationale: string }[]
  // Q4 — 어느 종목
  picks: {
    ticker: string; name: string; market: 'KR' | 'US'; sector: string
    thesis: string
    scores: { tech: number; fund: number; news: number }
    risk: string
  }[]
  // 항상
  invalidation: string[]   // 이 논리가 깨지는 구체적 조건
  disclaimer: string
}
```

`drivers`가 있어 "왜 점수가 68인가"를 agent 카드 단위로 역추적할 수 있다.
`invalidation`은 결론을 반증 가능하게 만드는 장치다.

## 8. 기업 1장 리포트

종목을 클릭하면 `/stock/[market]/[ticker]`로 이동해 1장짜리 기업분석 리포트를 본다.

### 8.1 스키마

```ts
type CompanyReport = {
  ticker: string; name: string; market: 'KR' | 'US'; sector: string
  generated_at: string
  snapshot: {                      // 코드가 계산, LLM 관여 없음
    price: number; change_1d: number; change_1m: number; change_12m: number
    market_cap: number
    per: number | null; pbr: number | null; roe: number | null
    per_pctile_in_sector: number | null   // 섹터 내 백분위
    debt_to_equity: number | null
    week52: { high: number; low: number; position: number }  // position 0-1
    revenue_trend: { period: string; value: number }[]        // 최근 8분기
    op_margin_trend: { period: string; value: number }[]
  }
  business: string        // 무엇으로 돈을 버는가, 2-3문장
  thesis: string[]        // 투자 논지 3개
  bear_points: string[]   // 반대 논거 3개
  catalysts: string[]     // 향후 촉매
  technical_read: string  // 차트 위치 해석
  news: { title: string; url: string; date: string; takeaway: string }[]  // 최근 3건
  verdict: { stance: 'positive' | 'neutral' | 'cautious'; one_liner: string; confidence: number }
  invalidation: string[]
  disclaimer: string
}
```

FinRobot의 Data-CoT → Concept-CoT → Thesis-CoT 순서를 그대로 적용한다.
`snapshot`은 코드가 채우고(Data), LLM은 `business`/`thesis`/`bear_points`를 쓴다(Concept→Thesis).

### 8.2 생성 정책 — 웹앱에 LLM이 없다는 제약의 해결

| 대상 | 시점 |
|---|---|
| 최종 top 5 종목 | 매일 자동 생성 |
| 그 밖의 모든 유니버스 종목 (후보 12개 포함) | 웹에서 "리포트 요청" → `report_requests` 테이블에 큐잉 → 다음 `/daily` 실행에서 생성 |

일일 LLM 호출 예산: 분석 agent 6 + 반대의견 1 + 종합 1 + 기업 리포트 5 = **13회**.
후보 12개 전부에 리포트를 매일 만들면 20회를 넘어 실행시간이 길어지므로 요청 기반으로 돌린다.
후보 12개는 이미 `technical`/`fundamental` agent가 배치로 평가하므로 점수는 대시보드에 나온다.

캐시 7일. 7일 이내 리포트가 있으면 `snapshot`(코드 계산분)만 갱신하고 서술은 재사용한다.
웹앱이 LLM을 호출하지 않으므로 즉시 생성은 불가능하다. 이는 비용 0원 제약의 직접적 결과이며,
큐잉된 요청은 다음 일일 실행에서 처리된다.

## 9. 데이터베이스 (Supabase)

```sql
market_snapshots (id, date, kind, payload jsonb, created_at)   -- 원시 + 계산된 feature
agent_reports    (id, date, agent, output jsonb, created_at)
daily_verdicts   (id, date unique, verdict jsonb, published bool, created_at)
company_reports  (id, ticker, market, date, payload jsonb, created_at)  -- unique(ticker, market, date)
report_requests  (id, ticker, market, requested_at, fulfilled_at null)
universe         (ticker, market, name, sector, active)         -- pk(ticker, market)
```

**RLS**

- `anon`: `daily_verdicts`는 `published = true`인 행만 SELECT. `agent_reports`/`company_reports`/`universe`는 SELECT 허용. `report_requests`는 INSERT만 허용.
- 모든 쓰기는 `service_role` (로컬 러너와 Edge Function만 보유).
- `service_role` 키는 웹앱 번들에 절대 포함하지 않는다. 웹은 `anon` 키만 사용한다.

## 10. 웹 프론트엔드

Next.js 15 App Router + Tailwind + shadcn/ui + Recharts. 모바일 우선.
데이터는 하루 1회만 바뀌므로 `revalidate`로 정적 재생성한다.

| 라우트 | 내용 |
|---|---|
| `/` | 오늘의 결론. 점수 게이지, 시그널 배지, 권장 주식비중, `drivers` 카드, 반대의견, 국가·섹터 히트맵, 종목 테이블 |
| `/history` | 점수 추이 차트 + 과거 결론 목록 |
| `/agents/[date]` | 그날의 agent 6개 리포트 원문 (`evidence` 출처 포함) |
| `/stock/[market]/[ticker]` | 기업 1장 리포트 |

디스클레이머는 레이아웃 레벨에 고정 배치해 모든 페이지에 나타나게 한다.

## 11. 실행 방식

### v1 — 수동 (오늘 바로 작동, 인증 작업 불필요)

리포지토리의 슬래시 커맨드 `/daily`를 Claude Code에서 실행한다.
Claude Code가 스냅샷을 읽고 agent 7개를 순서대로 돌린 뒤 Supabase MCP로 결과를 쓴다.

### v2 — 자동 (승급)

`claude -p` 헤드리스 + Windows 작업 스케줄러.

**검증된 제약**: 현재 `claude -p`는 `"Not logged in · Please run /login"`을 반환한다.
자동화 전에 사용자가 터미널에서 `claude login`을 한 번 실행해야 한다.
agent 프롬프트는 파일로 분리되어 v1과 v2가 같은 파일을 쓰므로 재작업은 없다.

수집(①)은 pg_cron으로 서버에서 매일 돌기 때문에 PC가 꺼져 있어도 데이터는 신선하게 유지된다.
분석(②)만 로컬 실행에 의존한다.

## 12. 리스크와 완화

| 리스크 | 완화 |
|---|---|
| `claude -p` 미인증 | v1은 슬래시 커맨드 수동 실행으로 시작. `claude login` 후 v2 승급 |
| Yahoo 비공식 API — UA 필수, 예고 없는 변경 가능 | 브라우저 UA 고정, 실패 시 Naver 폴백, 지수 백오프 재시도, 스냅샷 캐시로 하루치 유실 방지 |
| Supabase 무료티어 7일 무활동 시 프로젝트 pause | 일일 pg_cron이 keepalive 역할을 겸함. pause되면 크론도 멈추므로 웹에서 "마지막 갱신 시각"을 항상 노출 |
| 무료 API rate limit | 배치 요청, 일일 1회 수집, 스냅샷 재사용 |
| 결과 과신 | 모든 결론에 `invalidation` 조건과 `counter_case` 필수. 백테스트 성능 주장 금지 |
| 투자자문 오인 | 전 페이지 고정 디스클레이머. 주문 실행 경로 없음 |

TradingAgents 논문이 보고한 Sharpe 8.21은 저자도 "낙폭이 거의 없던 구간" 때문이라고 인정했다.
이 시스템은 수익률을 약속하지 않는다.

## 13. 단계별 계획

| Phase | 내용 | 완료 기준 |
|---|---|---|
| P1 | Supabase 스키마 + RLS, 수집 모듈, 지표 계산 | 실제 한·미 데이터가 담긴 `market_snapshots` 1행이 존재하고 지표 계산에 자체 검증 통과 |
| P2 | agent 프롬프트 7개 + 반대의견 + `/daily` 러너 + 2단 스크리너 | 실데이터 기반 `daily_verdicts` 1행 + `company_reports` 여러 행 생성 |
| P3 | Next.js 대시보드 4개 라우트 + Vercel 배포 | 배포 URL에서 오늘의 결론과 기업 1장 리포트가 보임 |
| P4 | pg_cron 수집 자동화 + (`claude login` 후) 작업 스케줄러 | 사람 개입 없이 수집이 매일 돌고, 분석이 스케줄로 실행됨 |

## 14. 검증 방식

- 지표 계산(SMA/RSI/MACD/z-score, 백분위)은 알려진 입력에 대한 기대값을 assert하는 자체 검증을 붙인다. 지표가 틀리면 전체 결론이 조용히 틀리기 때문이다.
- 수집 모듈은 각 소스가 실제로 응답하는지 확인하는 스모크 체크를 둔다.
- `AgentOutput` / `DailyVerdict` / `CompanyReport`는 파싱 시점에 스키마 검증한다. LLM 출력은 신뢰 경계다.
- 웹 배포 후 실제 URL에서 4개 라우트를 눌러 확인한다.
