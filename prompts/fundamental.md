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
