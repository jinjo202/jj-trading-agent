### Task 8: `/daily` 슬래시 커맨드 + 엔드투엔드 실행

**Files:**
- Create: `.claude/commands/daily.md`
- Modify: `docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md` (§4 뉴스 소스, §11 실행 방식 정정)

**Interfaces:**
- Consumes: 앞선 모든 태스크
- Produces: 사람이 `/daily`를 실행하면 `daily_verdicts` 1행이 생긴다

- [ ] **Step 1: 슬래시 커맨드 작성**

`.claude/commands/daily.md`:

```markdown
---
description: 오늘의 시장 판단을 생성한다 (수집 → agent 분석 → DB 발행)
---

오늘의 투자 판단을 생성한다. 아래 순서를 그대로 따른다.

## 0. 날짜 확인

```bash
node -e "console.log(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}))"
```

이 값을 `<DATE>`로 쓴다.

## 1. 수집 (LLM 없음)

```bash
npm run collect
```

실패하면 멈추고 사용자에게 보고한다. 오래된 스냅샷으로 판단을 만들지 않는다.

## 2. A단계 번들

```bash
npm run prepare:bundle
```

## 3. A단계 agent 5개 실행

`runs/<DATE>/bundle-a.json`을 읽는다. `prompts/README.md`의 공통 규칙을 먼저 읽는다.
그다음 아래 5개를 **순서대로** 실행한다. 각각 해당 프롬프트 파일을 읽고, 번들을 입력으로
`AgentOutput` JSON 하나씩 만든다.

1. `prompts/macro.md`
2. `prompts/allocation.md` — 1의 결과를 함께 본다
3. `prompts/country_sector.md`
4. `prompts/technical.md`
5. `prompts/news.md`

다섯 결과를 배열로 묶어 `runs/<DATE>/agents-a.json`에 쓴다.

**주의**: `country_sector`의 `evidence`에 `label: "sector:<섹터명>", value: "OW"` 항목이
최소 1개 있어야 다음 단계가 돈다. 없으면 그 agent를 다시 실행한다.

## 4. 후보 선정 (LLM 없음)

```bash
npm run candidates -- <DATE>
```

`OW 섹터가 하나도 없습니다` 오류가 나면 3단계로 돌아간다.

## 5. B단계 agent 실행

`runs/<DATE>/bundle-b.json`을 읽고 순서대로:

1. `prompts/fundamental.md` → `AgentOutput`
2. `prompts/counter.md` → `AgentOutput` (1과 `agents_a` 전부를 입력으로)
3. `prompts/synthesizer.md` → `DailyVerdict` (모든 agent 결과 + 반대의견)
4. `prompts/company_report.md` → `verdict.picks` 상위 5종목 각각에 대해 `CompanyReport`.
   `bundle-b.json`의 `company_reports_for`에 항목이 있으면 그것도 포함한다.
   기업 리포트는 최대 5건까지만 만든다 — 일일 LLM 호출 예산이 13회다.

결과를 하나의 객체로 `runs/<DATE>/agents-b.json`에 쓴다:

```json
{
  "agents": [ <fundamental>, <counter> ],
  "verdict": { ... },
  "company_reports": [ ... ]
}
```

## 6. 발행

```bash
npm run publish:run -- <DATE>
```

검증 오류가 나면 어느 필드가 왜 거부됐는지 메시지에 나온다. 해당 agent 출력을 고쳐
`agents-b.json`을 수정하고 다시 실행한다. **검증을 우회하지 않는다.**

## 7. 보고

사용자에게 한국어로 요약한다: `equity_score`, `signal`, 권장 비중 범위, `counter_case` 한 줄,
OW 국가·섹터, 종목 5개. 마지막에 `daily_verdicts`가 `published=false`로 저장됐다는 사실과,
공개하려면 그 플래그를 직접 바꿔야 한다는 것을 알린다.

## 지켜야 할 것

- 번들에 없는 숫자를 쓰지 않는다.
- 매수/매도를 지시하지 않는다. 이 결과는 리서치 자료다.
- 어떤 단계가 실패하면 다음 단계로 넘어가지 않는다. 부분 결과를 발행하지 않는다.
```

- [ ] **Step 2: 설계서 정정**

`docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md`의 §4 표에서
`네이버 뉴스 (Claude Code MCP) | 세션에 연결됨 | 한국 뉴스 | MCP` 행을 아래 두 행으로 바꾼다:

```markdown
| Yahoo 종목 RSS `feeds.finance.yahoo.com/rss/2.0/headline?s=` | **성공.** `AAPL`·`005930.KS` 모두 20건 | 한·미 종목 뉴스 | 불필요 |
| 연합뉴스 경제 RSS `yna.co.kr/rss/economy.xml` | **성공.** 120건, CDATA 제목 | 한국 매크로 뉴스 | 불필요 |
| ~~네이버 뉴스 MCP~~ | **세션에 그런 서버가 없다.** 설계 시점의 전제가 틀렸음 | 사용하지 않음 | — |
```

같은 문서 §11의 v1 설명에서 "Supabase MCP로 결과를 쓴다"를 아래로 바꾼다:

```markdown
Claude Code가 `prepare`가 만든 번들 파일을 읽고 agent를 순서대로 돌린 뒤 결과 JSON을 파일로 쓴다.
`publish`가 스키마 검증을 통과한 것만 DB에 쓴다. LLM은 DB에 직접 쓰지 않는다 —
검증되지 않은 출력이 DB에 들어가는 경로를 만들지 않기 위해서다.
```

- [ ] **Step 3: 전체 테스트와 타입체크**

```bash
npm test
```

Expected: 82개 전부 통과

```bash
npm run typecheck
```

Expected: 에러 없음

- [ ] **Step 4: 엔드투엔드 실행**

Claude Code에서 `/daily`를 실행한다.

Expected: 7단계가 순서대로 돌고, 마지막에 한국어 요약이 나온다.
중간에 검증 오류가 나면 그것이 정상 동작이다 — 어느 필드가 왜 거부됐는지 보고 프롬프트를 고친다.

- [ ] **Step 5: DB 확인**

Supabase MCP `execute_sql` (project_id `jsxhcqnupvvctnjiaric`):

```sql
select date, published,
       verdict->>'equity_score' as score,
       verdict->>'signal' as signal,
       jsonb_array_length(verdict->'drivers') as drivers,
       jsonb_array_length(verdict->'picks') as picks,
       jsonb_array_length(verdict->'invalidation') as invalidation,
       length(verdict->>'counter_case') as counter_len
from daily_verdicts order by date desc limit 1;

select date, agent, output->>'score' as score, output->>'signal' as signal,
       jsonb_array_length(output->'evidence') as evidence
from agent_reports where date = (select max(date) from agent_reports) order by agent;

select ticker, market, date, length(payload::text) as bytes from company_reports
order by date desc limit 5;
```

Expected: verdict 1행 (`published=false`, drivers ≥ 1, invalidation ≥ 2, counter_len > 50),
agent_reports 7행 (macro/allocation/country_sector/technical/news/fundamental/counter),
company_reports 최대 5행.

- [ ] **Step 6: 커밋**

```bash
git add .claude/commands/daily.md docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md
git commit -m "feat: add /daily slash command and correct design doc's news source"
```

---

## P2 완료 기준

설계서 §13 P2 기준: **"실데이터 기반 `daily_verdicts` 1행 + `company_reports` 여러 행 생성"**

- [ ] `npm test` — 82개 통과 (P1 21 + 뉴스 9 + 유니버스 6+5 + 스크리너 9 + 스키마 15+6 + prepare 5+1 + publish 5)
- [ ] `npm run smoke` — 뉴스 2개 포함 전부 OK
- [ ] `npm run universe` 후 `universe` 테이블에 KOSPI200 + S&P500이 Yahoo 섹터 어휘로 들어 있음
- [ ] `/daily` 1회 실행으로 `daily_verdicts` 1행 + `agent_reports` 7행 + `company_reports` 1행 이상
- [ ] verdict의 `counter_case`가 비어 있지 않고 `invalidation`이 2개 이상
- [ ] 모든 agent 출력의 `evidence[].source`가 번들의 실제 경로를 가리킴
- [ ] LLM 호출 13회 이하

## P2에서 의도적으로 뺀 것

| 뺀 것 | 이유 | 추가 시점 |
|---|---|---|
| 기업 리포트의 `revenue_trend`/`op_margin_trend` 실데이터 | `yahoo-finance2`의 분기 실적 시계열은 `quoteSummary`의 다른 모듈이 필요하고, 스키마는 빈 배열을 허용한다 | 리포트를 실제로 읽어보고 분기 추세가 아쉬우면 |
| `per_pctile_in_sector` 계산 | 섹터 내 전 종목의 PER이 필요하다. `pctRank`는 이미 있으므로 데이터만 붙이면 된다 | 후보 12종목 밖으로 리포트를 넓힐 때 |
| DART/SEC 원문 공시 | P1에서 뺀 이유와 같다. Yahoo가 두 시장을 같은 형태로 준다 | 원문 공시 인용이 필요해질 때 |
| 리포트 7일 캐시 | 웹이 없으므로 요청 큐가 아직 비어 있다. 캐시할 대상이 없다 | P3에서 웹이 요청을 넣기 시작하면 |
| `published=true` 자동 전환 | 사람이 한 번 읽고 공개하는 것이 기본값이어야 한다 | 판단 품질이 안정되면 |
| 반대의견 n라운드 토론 | 설계서가 이미 1패스로 압축하기로 결정했다 | 하지 않는다 |

