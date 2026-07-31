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
