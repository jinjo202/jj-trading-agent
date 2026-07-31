### Task 7: agent 프롬프트 9개

**Files:**
- Create: `prompts/macro.md`, `prompts/allocation.md`, `prompts/country_sector.md`, `prompts/technical.md`, `prompts/news.md`, `prompts/fundamental.md`, `prompts/counter.md`, `prompts/synthesizer.md`, `prompts/company_report.md`
- Create: `prompts/README.md`

**Interfaces:**
- Consumes: `BundleA` / `BundleB`의 필드 경로, `AgentOutput` / `DailyVerdict` / `CompanyReport` 스키마
- Produces: 파일뿐. `/daily` 커맨드가 이 파일들을 읽어 LLM에게 준다.

- [ ] **Step 1: 공통 규칙 문서 작성**

`prompts/README.md`:

```markdown
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
```

- [ ] **Step 2: 매크로/배분/국가섹터 프롬프트**

`prompts/macro.md`:

```markdown
# macro agent

`features.macro`와 `features.regime`을 읽고 현재 매크로 레짐을 판정한다.

## 보는 값

- `features.macro.curve2s10s`, `curve3m10y` — 장단기 금리차. 음수는 역전
- `features.macro.cpiYoY`, `coreCpiYoY` — 전년동월 대비 물가
- `features.macro.unrate` — 실업률
- `features.macro.hySpread` — 하이일드 스프레드. 확대는 신용 스트레스
- `features.regime.vixLevel`, `vixTerm` — VIX 수준과 기간구조.
  `vixTerm`이 1을 넘으면 백워데이션이고 단기 스트레스 신호다
- `features.regime.usdkrw`, `usdkrwChange20d` — 원달러 수준과 20일 변화

## 판단

레짐을 확장/둔화/침체/회복 중 하나로 부르고 그 근거를 댄다.
`score`는 주식에 우호적일수록 높다. 금리차 역전 + HY 스프레드 확대 + VIX 백워데이션이
겹치면 40 아래로, 셋 다 반대면 60 위로 간다.

`headline`에 레짐 이름을 반드시 포함한다.
`features.macro.available`이 false이거나 `features.missing`에 `fred`가 있으면
매크로 없이 판단하고 있다는 사실을 `flags` 첫 항목에 적고 `confidence`를 0.4 이하로 둔다.
```

`prompts/allocation.md`:

```markdown
# allocation agent

`macro` agent의 결과와 지수 추세를 합쳐 권장 주식비중 범위를 낸다.

## 보는 값

- 직전 `macro` agent의 `score`와 `signal`
- `features.assets['^GSPC']`, `features.assets['^KS11']`의
  `distSma200`(200일선 이격), `distSma60`, `realizedVol20`, `mom12_1`
- `features.regime.breadth` — RSP/SPY 비율의 60일 평균 대비 이격.
  음수는 소수 종목이 지수를 끌고 있다는 뜻

## 판단

`headline`에 권장 비중 범위를 `60-70%` 형태로 적는다.
`reasoning`에서 그 범위를 고른 이유를 매크로 점수, 200일선 이격, 실현변동성 순으로 설명한다.

원칙:
- 지수가 200일선 위 + 매크로 60 이상 → 비중 상단
- 지수가 200일선 아래 + 실현변동성 상승 → 비중 하단
- 브레드스가 음수면 상단을 낮춘다. 지수가 올라도 폭이 좁으면 취약하다

`score`는 비중 범위 중앙값을 그대로 쓴다(예: 60-70%면 65).
```

`prompts/country_sector.md`:

```markdown
# country_sector agent

한국과 미국 중 어디를, 11개 섹터 중 어디를 늘릴지 정한다.

## 보는 값

- `features.relative.krVsUs3m` — EWY 3개월 수익률 − SPY 3개월 수익률. 양수면 한국 우위
- `features.relative.sectors` — `{etf, rel3m}` 배열. SPY 대비 3개월 초과수익
- `features.regime.usdkrw`, `usdkrwChange20d` — 원화 약세는 한국 주식의 달러 수익률을 깎는다
- `features.foreignRatioSamsung` — 외국인 수급의 대리 지표
- `features.assets`의 각 섹터 ETF 항목 — `distSma200`, `rsi14`로 과열 여부 확인

## ETF ↔ 섹터 대응

XLK=Technology, XLF=Financial Services, XLE=Energy, XLV=Healthcare,
XLI=Industrials, XLY=Consumer Cyclical, XLP=Consumer Defensive,
XLU=Utilities, XLB=Basic Materials, XLRE=Real Estate, XLC=Communication Services

## 출력에서 반드시 지킬 형식

**이 agent의 `evidence`는 다음 단계의 스크리너가 기계적으로 읽는다.** 자유 서술이 아니다.

- 섹터 스탠스는 `label`을 `sector:<위 표의 섹터명>`, `value`를 `OW`/`N`/`UW`로 적는다.
- 국가 스탠스는 `label`을 `country:KR` 또는 `country:US`, `value`를 `OW`/`N`/`UW`로 적는다.
- `source`는 그 판단의 근거가 된 번들 경로다.

**OW 섹터를 최소 1개, 최대 3개 낸다.** 하나도 없으면 다음 단계가 멈춘다.
확신이 없으면 상대모멘텀이 가장 높은 섹터 하나를 OW로 두고 `confidence`를 낮춘다.

예:

```json
{
  "label": "sector:Technology",
  "value": "OW",
  "source": "features.relative.sectors[0].rel3m"
}
```
```

- [ ] **Step 3: 기술/뉴스/펀더멘털 프롬프트**

`prompts/technical.md`:

```markdown
# technical agent

지수의 추세와 모멘텀을 읽는다. 개별 종목은 보지 않는다 — 그건 B단계 몫이다.

## 보는 값

`features.assets['^GSPC']`, `['^IXIC']`, `['^KS11']`, `['^KQ11']` 각각의:
- `distSma20`, `distSma60`, `distSma200` — 이동평균 이격(비율). 0.05면 5% 위
- `rsi14` — 70 위 과열, 30 아래 과매도
- `macdHist` — 양수면 상승 모멘텀 강화
- `realizedVol20` — 연율화 실현변동성
- `week52Position` — 0이 52주 저점, 1이 고점
- `ret1m`, `ret3m`

## 판단

네 지수의 신호가 엇갈리면 그 사실 자체가 중요한 정보다. `reasoning`에 어긋나는 지점을 적는다.
`score`는 추세가 강할수록 높다. 다만 `rsi14`가 75를 넘는 지수가 둘 이상이면
과열을 `flags`에 적고 점수를 80 위로 올리지 않는다.

`week52Position`이 null인 지수는 데이터가 200봉 미만이라는 뜻이므로 판단에서 제외하고 `flags`에 적는다.
```

`prompts/news.md`:

```markdown
# news agent

`news.market`(미국 지수 ETF 헤드라인)과 `news.korea`(연합뉴스 경제) 헤드라인을 읽는다.

## 판단

1. 시장 방향에 실제로 영향을 줄 사건 **3개**를 고른다. 주가와 무관한 기사는 버린다.
2. 각 사건이 강세 요인인지 약세 요인인지 밝힌다.
3. `score`는 전반적 심리다. 50이 중립이다.

## 제약

- **헤드라인 제목만 주어진다. 본문은 없다.** 제목에 없는 내용을 추측해 쓰지 않는다.
- 같은 사건이 여러 매체에 중복되면 하나로 센다.
- `evidence`의 `source`는 `news.korea[2].title` 처럼 배열 인덱스까지 적는다.
- 헤드라인이 5개 미만이면 `flags`에 적고 `confidence`를 0.3 이하로 둔다.
- 기사 제목을 인용할 때는 원문 그대로 옮긴다. 요약해서 바꿔 쓰지 않는다.
```

`prompts/fundamental.md`:

```markdown
# fundamental agent

`candidates` 배열(12종목)의 퀄리티와 밸류를 평가한다.

## 보는 값

각 후보의 `roe`, `operatingMargin`, `forwardPE`, `priceToBook`, `yearChangePct`,
`turnover`(현지통화 거래대금), `sector`, `market`, `score`(코드가 계산한 모멘텀+퀄리티 z합),
그리고 `tech`(코드가 일봉으로 계산한 `distSma200`, `distSma60`, `rsi14`, `macdHist`,
`week52Position`, `realizedVol20`).

## 판단

- `score`는 후보군 전체의 퀄리티 수준이다. 개별 종목 점수가 아니다.
- `reasoning`에서 후보군에서 **가장 두드러진 3종목**을 이름과 숫자로 짚는다.
- 밸류에이션이 부담스러운 종목이 있으면 `flags`에 티커와 함께 적는다.

## 제약

- **한국과 미국 종목의 PER/PBR을 직접 비교하지 않는다.** 회계 관행과 시장 구조가 다르다.
  비교는 같은 시장, 같은 섹터 안에서만 한다.
- `priceToBook`이 null인 한국 종목이 흔하다. 없는 값으로 판단을 만들지 말고 `flags`에 적는다.
- `turnover`는 통화 단위가 시장마다 다르다. 시장 간 크기 비교에 쓰지 않는다.
```

- [ ] **Step 4: 반대의견/종합/기업리포트 프롬프트**

`prompts/counter.md`:

```markdown
# counter agent (반대의견)

지금까지 나온 agent 결과 전부를 읽고 **우세한 결론의 반대편**을 세운다.

이 단계의 목적은 균형 잡힌 시각이 아니다. **확증편향을 깨는 것**이다.
따라서 다수 의견에 동의하는 문장을 쓰지 않는다.

## 방법

1. `agents_a`와 `fundamental` 결과에서 우세한 방향을 확인한다.
2. **그 반대 방향의 논거를 만든다.** 같은 번들의 숫자로.
   같은 데이터가 반대 결론을 지지할 수 있는 지점을 찾는다.
3. 우세 결론이 무너지려면 무엇이 사실이어야 하는지 적는다.

## 출력

`AgentOutput` 형식이되 `agent`는 `"counter"`.
- `signal`은 우세 방향의 반대로 둔다.
- `score`는 반대 논거의 설득력이다. 억지스러우면 낮게 준다 —
  약한 반대의견을 강한 척 포장하는 것이 이 단계에서 가장 나쁜 실패다.
- `evidence`는 우세 결론이 근거로 쓴 것과 **같은 숫자를 다르게 읽은 것**이면 가장 좋다.
- `flags`에 "이 반대의견이 성립하려면 필요한 조건"을 적는다.
```

`prompts/synthesizer.md`:

```markdown
# synthesizer agent

모든 agent 결과 + 반대의견을 읽고 최종 `DailyVerdict`을 만든다. 출력 스키마는 `src/types.ts`의 `DailyVerdict`.

## 반드시 지킬 것

1. **`counter_case`에 반대의견을 요약하고, 왜 수용했는지 또는 왜 반박하는지 적는다.**
   반대의견을 무시하고 넘어가면 안 된다. 반박한다면 어떤 숫자로 반박하는지 밝힌다.
2. **`drivers`는 agent 카드로 역추적 가능해야 한다.** `agent` 필드는 실제 agent 이름
   (`macro`, `allocation`, `country_sector`, `technical`, `news`, `fundamental`)이어야 하고,
   `weight`의 합은 1.0 근처여야 한다.
3. **`invalidation`은 구체적이고 관측 가능해야 한다.**
   "시장이 나빠지면"은 안 된다. "HY 스프레드가 5.0%를 넘으면", "^GSPC가 200일선 아래로 마감하면"처럼
   숫자와 조건으로 쓴다. 최소 2개.
4. `picks`는 `candidates`에서 최대 5종목. 각 `ticker`/`name`/`market`/`sector`는
   후보 배열의 값을 그대로 복사한다. 새 종목을 지어내지 않는다.
   `scores.tech`는 그 후보의 `tech` 블록(`distSma200`, `rsi14`, `macdHist`, `week52Position`)을
   0-100으로 해석한 값이다. `tech`가 null인 후보는 `scores.tech`를 50(중립)으로 두고
   그 사실을 `risk`에 적는다. `scores.fund`는 `roe`/`operatingMargin`/밸류에이션에서,
   `scores.news`는 `news` agent 결과와 `candidate_news`에서 나온다.
   **세 점수 모두 번들의 숫자를 근거로 해야 한다.** 근거 없이 숫자를 배정하지 않는다.
5. `sectors`의 `etf` 필드는 `country_sector` agent가 쓴 ETF 티커와 일치해야 한다.
6. `disclaimer`는 번들의 `disclaimer` 문자열을 그대로 복사한다.

## 점수와 신호

- `equity_score`는 agent 점수들의 가중 평균에 가깝게 두되, 반대의견이 강하면(counter score 65 이상) 낮춘다.
- `signal`: `increase` / `hold` / `reduce`.
- `conviction`: agent들이 서로 어긋나거나 `features.missing`이 비어 있지 않으면 `low`.

## 금지

- 수익률·목표주가 제시 금지.
- 백테스트 성과 언급 금지.
- 매수/매도 주문 지시 금지. 이 문서는 리서치 자료다.
```

`prompts/company_report.md`:

```markdown
# company_report agent

종목 하나의 1장짜리 기업분석 리포트를 만든다. 출력 스키마는 `src/types.ts`의 `CompanyReport`.

## 역할 분담

`snapshot` 블록은 **코드가 계산해 번들에 넣어준 값**이다. 그대로 복사한다.
숫자를 다시 계산하거나 반올림하거나 채워 넣지 않는다. null은 null로 남긴다.

너는 서술만 쓴다: `business`, `thesis`, `bear_points`, `catalysts`, `technical_read`,
`news[].takeaway`, `verdict`, `invalidation`.

## 순서 (Data → Concept → Thesis)

1. `snapshot`과 `candidate_news`의 사실을 먼저 읽는다.
2. `business`: 이 회사가 무엇으로 돈을 버는지 2-3문장. 아는 범위에서 쓰고,
   모르면 섹터 수준의 서술로 남기고 `flags` 대신 `bear_points`에 정보 부족을 적는다.
3. `thesis` 3개와 `bear_points` 3개. **개수는 같아야 한다.**
   강세 논거만 3개 쓰고 약세를 1개 쓰면 이 리포트는 쓸모가 없다.
4. `technical_read`: `snapshot.week52.position`과 가격 변화율로 차트상 위치를 해석한다.
5. `news[].takeaway`: 제목에서 읽히는 함의만 쓴다. 본문은 주어지지 않았다.
6. `verdict.one_liner`: 한 문장. `verdict.confidence`는 0-1.
7. `invalidation`: 이 논지가 깨지는 관측 가능한 조건 최소 2개.

## 제약

- `generated_at`은 ISO 8601 문자열로 쓴다.
- `disclaimer`는 번들의 문자열을 그대로 복사한다.
- 목표주가를 쓰지 않는다. 매수/매도를 지시하지 않는다.
- 실적 수치를 기억에서 꺼내 쓰지 않는다. 번들에 있는 것만 쓴다.
```

- [ ] **Step 5: 프롬프트가 스키마와 어긋나지 않는지 확인**

프롬프트에 적힌 필드 경로가 실제 타입과 맞는지 눈으로 대조한다:

```bash
grep -o "features\.[a-zA-Z_.\[\]0-9']*" prompts/*.md | sort -u
```

Expected: 출력된 경로가 전부 `src/types.ts`의 `FeatureSet`에 실재해야 한다.
`features.regime.breadth`, `features.macro.curve2s10s`, `features.relative.sectors`,
`features.assets['^GSPC'].distSma200` 등. 없는 경로가 나오면 프롬프트를 고친다.

- [ ] **Step 6: 커밋**

```bash
git add prompts/
git commit -m "docs: add agent prompts with evidence-path contract"
```

---

