import type { MarketCode } from './types.ts'

/**
 * SAA — 전략적 자산배분. 이 시스템의 **기준선**이고, 여기서 벗어난 만큼이 TAA다.
 *
 * 왜 코드 상수인가: SAA는 시장 데이터에 반응해서 바뀌는 값이 아니다. 장기 자본시장
 * 가정이 바뀔 때 사람이 바꾸는 값이라, LLM이 매일 다시 정하면 기준선이 아니게 된다.
 * **검토 주기는 연 1회**(또는 구조적 변화가 있을 때). 바꾸면 아래 REVIEWED를 갱신한다.
 *
 * 세 배분의 출처가 다르고, 그 차이가 신뢰도의 차이다:
 * - 주식: 세계 시가총액 근사. **관측 가능한 사실**에 가깝다.
 * - 채권: 미국 편중 코어 포트폴리오의 업계 관례. 사실이 아니라 관행이다.
 * - 대체자산: 시가총액 중립이라는 것이 존재하지 않는다. **이 시스템이 정한 규약**이며
 *   시장의 사실이 아니다. 화면에도 그렇게 표기한다.
 */
export const SAA_REVIEWED = '2026-08-16'
export const SAA_NEXT_REVIEW = '2027-08'

export const SAA_EQUITY: Record<MarketCode, number> = {
  US: 68, EU: 12, JP: 6, EM: 12, KR: 2,
}

export const SAA_BOND: Record<string, number> = {
  SHY: 10, IEF: 25, TLT: 10, TIP: 5, LQD: 25, HYG: 8, BKLN: 3, BWX: 6, EMB: 6, EMLC: 2,
}

export const SAA_ALT: Record<string, number> = {
  GLD: 25, SLV: 5, DBB: 10, DBC: 10, PSP: 10, BIZD: 5, IGF: 15, VNQ: 12, REET: 8,
}

/** 자산군 자체의 SAA(%). TAA 밴드가 이 기준선에서 얼마나 벗어났는지 재는 데 쓴다. */
export const SAA_ASSET_CLASS = { equity: 60, bond: 25, alt: 10, cash: 5 } as const

export const SAA_SOURCE_NOTE: Record<string, string> = {
  equity: '세계 시가총액 근사',
  bond: '미국 편중 코어 포트폴리오의 업계 관례',
  alt: '시장 사실이 아니라 이 시스템이 정한 기준선',
}

/**
 * "크게 변한 것"의 문턱.
 *
 * 실측으로 정했다. 2026-08-07~16 일간 판단 6개를 재보니 신호는 6일 내내 `hold`,
 * 점수는 57-58로 최상위 뷰가 사실상 고정인데도 **시장 스탠스는 25개 시장-일 중
 * 13개(52%)가 뒤집혔고** 시장 비중은 하루 평균 1.2-2.0%p, 주식 밴드 중앙값은
 * 하루 평균 2.5%p 움직였다. 그래서:
 * - 스탠스 전환 하나만으로는 material이 아니다(절반이 매일 바뀐다).
 * - 자산군·시장 비중은 일간 잡음(~2.5%p)의 두 배인 5%p부터 material로 본다.
 * - sleeve 내부 비중은 분모가 작아 더 크게 움직이므로 10%p로 둔다.
 * - 듀레이션 전환과 신호 변경은 드물고 결과가 커서 크기와 무관하게 material이다.
 */
export const MATERIAL = {
  assetClassPp: 5,
  marketWeightPp: 5,
  sleeveWeightPp: 10,
} as const
