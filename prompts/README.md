# agent 프롬프트

각 파일은 agent 하나의 지시문이다. `/daily` 커맨드가 번들 JSON과 함께 읽는다.

## 모든 agent에 적용되는 규칙

1. **숫자를 만들지 않는다.** 번들에 있는 숫자만 쓴다. 번들에 없는 값이 필요하면
   그 사실을 `flags`에 적고 없는 채로 판단한다. 추정치를 지어내면 안 된다.
2. **`evidence`의 `source`는 번들 안의 실제 경로**여야 한다.
   예: `features.macro.curve2s10s`, `features.regime.vixTerm`, `candidates[3].roe`,
   `news.korea[2].title`. 경로가 없는 evidence는 검증기가 거부한다.
3. `null`은 "모른다"는 뜻이다. 0으로 읽지 않는다.
   `features.missing`에 있는 항목은 그 값이 아예 수집되지 않았다는 뜻이므로,
   그 항목에 의존하는 판단은 `flags`에 한계를 적는다.
4. 출력은 **JSON 하나**다. 마크다운 코드펜스도, 설명 문장도 붙이지 않는다.
5. `score`는 0-100이고 50이 중립이다. `confidence`는 0-1이다.
   확신이 약하면 점수를 극단으로 밀지 말고 `confidence`를 낮춘다.
6. 한국어로 쓴다. 종목명·티커·지표명은 원문 그대로 둔다.
7. 수익률을 약속하거나 "반드시", "확실히" 같은 표현을 쓰지 않는다.

## 출력 계약

`macro`, `allocation`, `country_sector`, `technical`, `news`, `fundamental`, `counter`는
`AgentOutput` 하나를 낸다:

```json
{
  "agent": "macro",
  "score": 62,
  "confidence": 0.7,
  "signal": "bullish",
  "headline": "한 줄 요약",
  "reasoning": "3-6문장",
  "evidence": [{ "label": "2s10s", "value": "0.70%p", "source": "features.macro.curve2s10s" }],
  "flags": ["주의사항"]
}
```

`synthesizer`는 `DailyVerdict`, `company_report`는 `CompanyReport`를 낸다.
정확한 필드는 `src/types.ts`에 있고 `src/schema.ts`가 강제한다.
