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

## 문장 쓰는 법 — 화면에 그대로 나가는 글이다

`reasoning` · `rationale` · `comment` · `headline` · `point` 같은 서술 필드는 사람이 읽는
화면에 그대로 실린다. 다음을 지켜라.

**결론을 먼저 쓴다.** 첫 문장에 판단을 적고, 근거는 그 뒤에 붙인다.
근거를 쌓다가 마지막에 결론이 나오면 읽는 사람은 중간에 길을 잃는다.

**한 문장은 한 가지만 말한다.** 쉼표와 줄표로 세 절을 이어 붙이지 마라.
40자를 넘어가면 끊을 곳이 있는지 먼저 본다.

**숫자는 뜻과 함께 쓴다.** `realizedVol20 0.683`만 쓰면 큰지 작은지 알 수 없다.
`realizedVol20 0.683(SPY의 5.3배)`처럼 비교 대상을 붙여라.

**핵심은 `**굵게**`로 표시한다.** 화면이 이 표기를 굵은 글씨로 렌더한다.
- 한 문단에 **한두 곳만** 굵게 한다. 다 굵으면 아무것도 안 굵은 것과 같다.
- 굵게 할 것: 그 문단의 결론, 판단을 뒤집은 결정적 숫자, 놓치면 안 되는 한계.
- 굵게 하지 말 것: 지표 이름, 티커, 일반적인 서술.
- `**` 짝을 반드시 맞춘다. 짝이 안 맞으면 별표가 화면에 그대로 보인다.
- 굵게는 강조지 제목이 아니다. 문장 전체를 굵게 하지 마라.

예: `EWY 1개월 +10.03%는 주가가 아니라 환율이다 — 같은 기간 ^KS11은 -0.63%였다.
**달러 기준 수익 전부가 원화 강세에서 나왔다.** 그래서 방향이 아니라 크기로 눌렀다.`

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
