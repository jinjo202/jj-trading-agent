---
description: 오늘의 시장 판단을 생성한다 (수집 → 데스크 6개 → CIO 하우스뷰 → DB 발행)
---

오늘의 투자 판단을 생성한다. 아래 순서를 그대로 따른다.

## 0. 날짜 확인

```bash
node -e "console.log(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}))"
```

이 값을 `<DATE>`로 쓴다. **오늘 날짜로 돌린다** — 과거 날짜를 재사용하지 않는다.

## 1. 수집 (LLM 없음)

```bash
npm run collect
```

실패하면 멈추고 사용자에게 보고한다. 오래된 스냅샷으로 판단을 만들지 않는다.

## 2. A단계 번들

```bash
npm run prepare:bundle
```

## 3. 데스크 6개 실행

`runs/<DATE>/bundle-a.json`을 읽는다. `prompts/README.md`의 공통 규칙을 먼저 읽는다.
그다음 아래 6개를 실행한다. 각각 해당 프롬프트 파일을 읽고, 번들을 입력으로
`AgentOutput` 하나씩 만든다.

1. `prompts/macro.md`
2. `prompts/technical.md`
3. `prompts/news.md`
4. `prompts/allocation.md` — 1의 결과를 함께 본다
5. `prompts/fundamental.md`
6. `prompts/sector.md`

**각 데스크는 `markets` 배열에 5개 시장(US/KR/JP/EU/EM) 전부를 담아야 한다.**
하나라도 빠지면 발행 단계에서 거부된다.

여섯 결과를 배열로 묶어 `runs/<DATE>/agents-a.json`에 쓴다.

**주의**: `sector`의 `evidence`에 `label: "sector:<섹터명>", value: "OW"` 항목이
최소 1개 있어야 다음 단계가 돈다. 없으면 그 데스크를 다시 실행한다.

## 4. 후보 선정 (LLM 없음)

```bash
npm run candidates -- <DATE>
```

`OW 섹터가 하나도 없습니다` 오류가 나면 3단계로 돌아간다.

## 5. B단계 실행

`runs/<DATE>/bundle-b.json`을 읽고 순서대로:

1. `prompts/counter.md` → `AgentOutput` (데스크 6개 전부를 입력으로)
2. `prompts/cio.md` → `DailyVerdict` (데스크 + 반대의견 전부)
3. `prompts/company_report.md` → `verdict.picks` 상위 5종목 각각에 대해 `CompanyReport`.
   `bundle-b.json`의 `company_reports_for`에 항목이 있으면 그것도 포함한다.
   기업 리포트는 최대 5건까지만 만든다.

결과를 하나의 객체로 `runs/<DATE>/agents-b.json`에 쓴다:

```json
{
  "agents": [ <counter> ],
  "verdict": { ... },
  "company_reports": [ ... ]
}
```

## 6. 발행

```bash
npm run publish:run -- <DATE>
```

검증 오류가 나면 어느 필드가 왜 거부됐는지 메시지에 나온다. 해당 출력을 고쳐
`agents-b.json`을 수정하고 다시 실행한다. **검증을 우회하지 않는다.**

자주 걸리는 검증:
- `markets.weight_pct 합이 100이 아닙니다` → 5개 시장 비중을 다시 맞춘다
- `빠진 시장: ...` → 5개 시장 전부 필요
- `asset_allocation 밴드 중앙값 합` → equity/bond/cash 중앙값 합이 100 근처여야 한다

## 7. 공개

발행은 `published=false`로 저장된다. 사용자가 검토한 뒤 공개하겠다고 하면:

```sql
update daily_verdicts set published = true where date = '<DATE>';
```

## 8. 보고

사용자에게 한국어로 요약한다: `regime`, `equity_score`, `signal`, 자산배분,
DM/EM 선호, 5개 시장 스탠스와 비중, 섹터 콜, 트레이드, `counter_case` 한 줄.
마지막에 `published=false`라는 사실과 공개하려면 플래그를 바꿔야 한다는 것을 알린다.

## 지켜야 할 것

- 번들에 없는 숫자를 쓰지 않는다.
- 매수/매도를 지시하지 않는다. 이 결과는 리서치 자료다.
- 어떤 단계가 실패하면 다음 단계로 넘어가지 않는다. 부분 결과를 발행하지 않는다.
