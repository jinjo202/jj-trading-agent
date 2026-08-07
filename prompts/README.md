# agent 프롬프트

각 파일은 agent 하나의 지시문이다. `/daily` 커맨드가 번들 JSON과 함께 읽는다.

## 구조 (2026-08 개편)

리서치 데스크 6개가 각각 **5개 시장 전부**에 코멘트를 남기고, CIO가 그것을 모아 하우스뷰를 만든다.

| 단계 | agent | 역할 |
|---|---|---|
| A | `macro` | 매크로 애널리스트 — 금리·물가·신용·환율 국면 |
| A | `technical` | 차트 애널리스트 — 추세·모멘텀·과열 |
| A | `news` | 뉴스플로우 애널리스트 — 헤드라인 촉매 |
| A | `allocation` | 자산배분 애널리스트 — 리스크 예산 |
| A | `fundamental` | 펀더멘털 애널리스트 — 지역 밸류에이션 |
| A | `sector` | 섹터 애널리스트 — 섹터 상대강도 |
| B | `counter` | 반대의견 — 우세 결론을 깬다 |
| B | `cio` | CIO — 최종 하우스뷰(`DailyVerdict`) |
| B | `company_report` | 종목 1장 리포트 |

## 5개 시장

`US`(미국) `KR`(한국) `JP`(일본) `EU`(유럽) `EM`(이머징)

지역 비교는 전부 **USD 표시 ETF** 기준이다: SPY / EWY / EWJ / VGK / EEM.
현지통화 지수(^KS11, ^N225 등)는 그 나라 안에서의 추세를 볼 때만 쓴다 —
지역 간 비교에 쓰면 환율 효과가 빠져 "달러로 얼마 벌었나"에 답하지 못한다.

상대성과의 기준(benchmark)은 **ACWI**(전세계)다. SPY 기준으로 재면 미국의 상대성과가
항상 0이 되어 비교가 성립하지 않는다.

## 모든 agent에 적용되는 규칙

1. **숫자를 만들지 않는다.** 번들에 있는 숫자만 쓴다. 번들에 없는 값이 필요하면
   그 사실을 `flags`에 적고 없는 채로 판단한다. 추정치를 지어내면 안 된다.
2. **`evidence`의 `source`는 번들 안의 실제 경로**여야 한다.
   예: `features.macro.curve2s10s`, `features.relative.regions[2].rel3m`,
   `features.valuation.JP.per`, `news.regions.EU[1].title`.
   경로가 없는 evidence는 검증기가 거부한다.
3. `null`은 "모른다"는 뜻이다. 0으로 읽지 않는다.
   `features.missing`에 있는 항목은 아예 수집되지 않았다는 뜻이므로,
   그 항목에 의존하는 판단은 `flags`에 한계를 적는다.
4. 출력은 **JSON 하나**다. 마크다운 코드펜스도, 설명 문장도 붙이지 않는다.
5. `score`는 0-100이고 50이 중립이다. `confidence`는 0-1이다.
   확신이 약하면 점수를 극단으로 밀지 말고 `confidence`를 낮춘다.
6. 한국어로 쓴다. 종목명·티커·지표명은 원문 그대로 둔다.
7. 수익률을 약속하거나 "반드시", "확실히" 같은 표현을 쓰지 않는다.

## 데스크 6개의 출력 계약

`macro` `technical` `news` `allocation` `fundamental` `sector`는 `AgentOutput`을 내되,
**`markets` 배열에 5개 시장 전부**를 담아야 한다. 하나라도 빠지면 검증기가 거부한다.

```json
{
  "agent": "macro",
  "score": 62,
  "confidence": 0.7,
  "signal": "bullish",
  "headline": "한 줄 요약",
  "reasoning": "이 데스크의 글로벌 관점 3-6문장",
  "markets": [
    { "market": "US", "stance": "bullish", "comment": "미국에 대한 이 데스크의 판단 2-3문장" },
    { "market": "KR", "stance": "neutral", "comment": "..." },
    { "market": "JP", "stance": "neutral", "comment": "..." },
    { "market": "EU", "stance": "bearish", "comment": "..." },
    { "market": "EM", "stance": "neutral", "comment": "..." }
  ],
  "evidence": [{ "label": "2s10s", "value": "+0.47%p", "source": "features.macro.curve2s10s" }],
  "flags": ["주의사항"]
}
```

`markets[].comment`는 **그 시장에 대한 이 데스크의 고유한 판단**이어야 한다.
5개 시장에 같은 말을 복붙하면 이 구조는 쓸모가 없다. 시장마다 다른 숫자를 근거로 대라.

`score`와 `signal`은 이 데스크의 **글로벌 종합** 관점이다. 시장별 방향은 `markets[].stance`에 있다.

## 그 외 출력 계약

`counter`는 `AgentOutput`을 내지만 `markets`는 비운다(시장을 나누지 않는다).
`cio`는 `DailyVerdict`, `company_report`는 `CompanyReport`를 낸다.
정확한 필드는 `src/types.ts`에 있고 `src/schema.ts`가 강제한다.
