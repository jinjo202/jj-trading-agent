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
