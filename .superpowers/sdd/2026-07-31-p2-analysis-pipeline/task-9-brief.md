### Task 9: 기업 리포트 스냅샷 데이터 원천 (최종 리뷰가 잡은 계획 자체의 구멍)

Task 1-8을 각각 리뷰할 때는 안 보이던 문제였다: `CompanyReport.snapshot`을 채울 데이터가
번들 어디에도 없다. `BundleB`는 `features`/`candidates`/`candidate_news`만 담고 있고,
`Candidate`는 가격·시가총액·52주 고저·부채비율을 담지 않는다. `company_report.md`는
"snapshot 블록은 코드가 계산해 번들에 넣어준 값이다. 그대로 복사한다"고 LLM에게 말하지만
복사할 게 없다. 검증기는 범위 안의 숫자면 통과시키므로, **LLM이 지어낸 가격이 스키마를 그대로 통과한다.**
"숫자는 코드가 계산하고 LLM은 해석만 한다"는 이 프로젝트의 핵심 원칙이 정확히 이 지점에서 깨진다.

**Files:**
- Create: `src/snapshot.ts`
- Test: `src/snapshot.test.ts`
- Modify: `src/types.ts` (`BundleB`에 `company_snapshots` 필드 추가)
- Modify: `src/bin/candidates.ts` (스냅샷 조립 + 요청 큐 종목 조회)
- Modify: `prompts/company_report.md` (번들 경로 정정)

**Interfaces:**
- Consumes: `indicators.ts`의 `pctChange`, `pctRank`; `types.ts`의 `Ohlcv`, `Fundamentals`, `CompanyReport`
- Produces: `snapshot.ts`: `type CompanySnapshot = CompanyReport['snapshot']`, `buildSnapshot(bars: Ohlcv[], funds: Fundamentals, sectorForwardPEs: (number | null)[]): CompanySnapshot | null`

- [ ] **Step 1: `src/types.ts`에 `company_snapshots` 추가**

```ts
export type BundleB = {
  date: string
  features: FeatureSet
  agents_a: AgentOutput[]
  candidates: Candidate[]
  candidate_news: Record<string, NewsItem[]>
  company_snapshots: Record<string, CompanyReport['snapshot']>
  company_reports_for: { ticker: string; market: 'KR' | 'US' }[]
  agents_to_run: string[]
  disclaimer: string
}
```

(기존 필드 순서에서 `company_reports_for` 앞에 `company_snapshots`를 끼워 넣는다.)

- [ ] **Step 2: 실패하는 테스트 작성**

`src/snapshot.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshot } from './snapshot.ts'
import type { Fundamentals, Ohlcv } from './types.ts'

const bar = (close: number, high = close, low = close): Ohlcv => ({
  date: 'd', open: close, high, low, close, volume: 1000,
})

// 253봉짜리 완만한 상승 추세. change_12m 계산에 필요한 최소 길이다.
function series(start: number, step: number, n = 260): Ohlcv[] {
  return Array.from({ length: n }, (_, i) => bar(start + step * i))
}

const funds = (over: Partial<Fundamentals> = {}): Fundamentals => ({
  symbol: 'X', name: null, sector: null, price: null, marketCap: 1e12,
  forwardPE: 15, priceToBook: 2, roe: 0.15, debtToEquity: 40,
  revenueGrowth: null, operatingMargin: 0.2, ...over,
})

test('buildSnapshot은 가격·변화율·52주 밴드를 봉에서 계산한다', () => {
  const bars = series(100, 0.5)
  const snap = buildSnapshot(bars, funds(), [10, 15, 20])!
  assert.ok(snap !== null)
  assert.equal(snap.price, bars.at(-1)!.close)
  assert.ok(snap.change_12m > 0, '상승 추세라 12개월 변화율이 양수')
  assert.equal(snap.week52.position, 1, '상승 추세의 마지막 봉은 52주 고점')
  assert.equal(snap.market_cap, 1e12)
  assert.equal(snap.per, 15)
  assert.equal(snap.pbr, 2)
  assert.equal(snap.debt_to_equity, 40)
  assert.deepEqual(snap.revenue_trend, [])
  assert.deepEqual(snap.op_margin_trend, [])
})

test('buildSnapshot은 253봉 미만이면 null — 지어내지 않고 건너뛴다', () => {
  assert.equal(buildSnapshot(series(100, 0.5, 100), funds(), []), null)
})

test('buildSnapshot은 marketCap이 null이면 null', () => {
  assert.equal(buildSnapshot(series(100, 0.5), funds({ marketCap: null }), []), null)
})

test('buildSnapshot은 봉이 없으면 null', () => {
  assert.equal(buildSnapshot([], funds(), []), null)
})

test('per_pctile_in_sector는 동료군 forwardPE 대비 백분위, forwardPE가 null이면 null', () => {
  const bars = series(100, 0.5)
  const snap = buildSnapshot(bars, funds({ forwardPE: 20 }), [10, 15, 20, 25])!
  assert.equal(snap.per_pctile_in_sector, 50) // 4개 중 2개가 20보다 작음 -> 2/3*100

  const noPE = buildSnapshot(bars, funds({ forwardPE: null }), [10, 15, 20])!
  assert.equal(noPE.per_pctile_in_sector, null)
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './snapshot.ts'`

- [ ] **Step 4: `src/snapshot.ts` 구현**

```ts
import { pctChange, pctRank } from './indicators.ts'
import type { Fundamentals, Ohlcv, CompanyReport } from './types.ts'

export type CompanySnapshot = CompanyReport['snapshot']

// 스냅샷을 만들 수 없으면 null을 반환한다. 0이나 추정치로 채우지 않는다 —
// LLM이 여기 없는 숫자를 지어내는 것보다 그 종목의 리포트를 하루 건너뛰는 편이 낫다.
export function buildSnapshot(
  bars: Ohlcv[],
  funds: Fundamentals,
  sectorForwardPEs: (number | null)[],
): CompanySnapshot | null {
  if (bars.length === 0 || funds.marketCap === null) return null

  const closes = bars.map((b) => b.close)
  const change_1d = pctChange(closes, 1)
  const change_1m = pctChange(closes, 21)
  const change_12m = pctChange(closes, 252)
  if (change_1d === null || change_1m === null || change_12m === null) return null

  const w = bars.slice(-252)
  const high = Math.max(...w.map((b) => b.high))
  const low = Math.min(...w.map((b) => b.low))
  const position = high === low ? 0.5 : (bars.at(-1)!.close - low) / (high - low)

  return {
    price: bars.at(-1)!.close,
    change_1d,
    change_1m,
    change_12m,
    market_cap: funds.marketCap,
    per: funds.forwardPE,
    pbr: funds.priceToBook,
    roe: funds.roe,
    per_pctile_in_sector:
      funds.forwardPE === null ? null : pctRank(sectorForwardPEs, funds.forwardPE),
    debt_to_equity: funds.debtToEquity,
    week52: { high, low, position },
    // 분기 실적 시계열은 quoteSummary의 별도 모듈이 필요하다. P2 범위 밖 —
    // 빈 배열로 두고 지어내지 않는다. 스키마는 빈 배열을 허용한다.
    revenue_trend: [],
    op_margin_trend: [],
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS

- [ ] **Step 6: `src/bin/candidates.ts`에 스냅샷 조립 연결**

기존 "확정된 12종목만 일봉을 받아 기술적 지표를 코드가 계산한다" 블록을 봉을 보관하도록 바꾸고,
그 뒤에 스냅샷 조립과 요청 큐 종목 처리를 추가한다.

```ts
import { readOpenReportRequests, readUniverse } from '../db.ts'
import { fetchDaily, fetchFundamentals } from '../sources/yahoo.ts'
import { fetchSymbolNews } from '../sources/news.ts'
import {
  computeTech, fetchQuotes, filterByLiquidity, rankByMomentum, scoreCandidates,
} from '../screener.ts'
import { buildSnapshot } from '../snapshot.ts'
import { buildBundleB, owSectorsFrom } from '../prepare.ts'
import { validateAgentOutput } from '../schema.ts'
import type { BundleA, CompanyReport, Fundamentals, NewsItem, Ohlcv } from '../types.ts'
```

`computeTech`를 계산하던 루프를 봉도 함께 저장하도록 바꾼다:

```ts
  // 확정된 12종목만 일봉을 받아 기술적 지표를 코드가 계산한다. 봉은 스냅샷 조립에도 쓴다.
  const barsByTicker = new Map<string, Ohlcv[]>()
  for (const c of candidates) {
    try {
      const bars = await fetchDaily(c.ticker)
      barsByTicker.set(c.ticker, bars)
      c.tech = computeTech(bars)
    } catch (e) {
      console.error(`일봉 ${c.ticker} 실패: ${(e as Error).message}`)
    }
  }
```

뉴스 수집 블록 뒤, `requested` 계산 앞에 스냅샷 조립을 추가한다:

```ts
  // 섹터별 forwardPE 동료군 — per_pctile_in_sector 계산에 쓴다.
  const peersBySector = new Map<string, (number | null)[]>()
  for (const c of candidates) {
    const key = c.sector ?? ''
    const arr = peersBySector.get(key) ?? []
    arr.push(funds.get(c.ticker)?.forwardPE ?? null)
    peersBySector.set(key, arr)
  }

  const snapshots: Record<string, CompanyReport['snapshot']> = {}
  for (const c of candidates) {
    const bars = barsByTicker.get(c.ticker)
    const f = funds.get(c.ticker)
    if (!bars || !f) continue
    const snap = buildSnapshot(bars, f, peersBySector.get(c.sector ?? '') ?? [])
    if (snap) snapshots[c.ticker] = snap
    else console.error(`스냅샷 ${c.ticker} 생성 실패 — 데이터 부족 (기업 리포트에서 제외됨)`)
  }
```

`requested` 계산을 스냅샷 조립 뒤로 옮기고, 후보 12개 밖의 요청 종목은 따로 조회해서 채운다:

```ts
  const requested = (await readOpenReportRequests(5)).map((r) => ({ ticker: r.ticker, market: r.market }))
  for (const r of requested) {
    if (snapshots[r.ticker]) continue
    try {
      const bars = await fetchDaily(r.ticker)
      const f = await fetchFundamentals(r.ticker)
      const snap = buildSnapshot(bars, f, [])
      if (snap) snapshots[r.ticker] = snap
      else console.error(`스냅샷 ${r.ticker} 생성 실패 — 데이터 부족 (요청 리포트에서 제외됨)`)
    } catch (e) {
      console.error(`요청 종목 ${r.ticker} 조회 실패: ${(e as Error).message}`)
    }
  }

  const bundle = buildBundleB(bundleA, agents, candidates, news, snapshots, requested)
```

- [ ] **Step 7: `buildBundleB` 시그니처에 `snapshots` 추가**

`src/prepare.ts`의 `buildBundleB`를 수정한다:

```ts
export function buildBundleB(
  bundleA: BundleA,
  agents: AgentOutput[],
  candidates: Candidate[],
  news: Record<string, NewsItem[]>,
  snapshots: Record<string, CompanyReport['snapshot']>,
  requested: { ticker: string; market: 'KR' | 'US' }[],
): BundleB {
  return {
    date: bundleA.date,
    features: bundleA.features,
    agents_a: agents,
    candidates,
    candidate_news: news,
    company_snapshots: snapshots,
    company_reports_for: requested,
    agents_to_run: ['fundamental', 'counter', 'synthesizer', 'company_report'],
    disclaimer: DISCLAIMER,
  }
}
```

`src/prepare.test.ts`의 `buildBundleB` 관련 테스트 두 곳에 `snapshots` 인자(빈 객체 `{}`로 충분)를
추가해서 시그니처를 맞춘다.

- [ ] **Step 8: `prompts/company_report.md` 정정**

"snapshot 블록은 코드가 계산해 번들에 넣어준 값이다. 그대로 복사한다"는 문장 뒤에 실제 경로를 명시한다:

```markdown
`bundle.company_snapshots[ticker]`가 그 값이다. 이 객체가 그대로 `snapshot` 필드가 된다 —
계산하거나 반올림하거나 채워 넣지 않는다. `revenue_trend`/`op_margin_trend`는 P2에서는 항상
빈 배열이다 — 분기 실적 시계열은 아직 수집하지 않는다.

`bundle.company_snapshots`에 해당 종목이 없으면 (데이터 부족으로 스냅샷 생성이 실패한 경우)
그 종목의 리포트는 만들지 않는다. 없는 숫자를 지어내 리포트를 완성하지 않는다.
```

- [ ] **Step 9: 라이브 확인 (DB 없이)**

`SUPABASE_SERVICE_ROLE_KEY`가 없으면 `readUniverse`/`readOpenReportRequests`가 실패한다.
대신 순수 함수 경로만 라이브 데이터로 확인한다:

```bash
node --input-type=module -e "const y=await import('./src/sources/yahoo.ts');const s=await import('./src/snapshot.ts');const bars=await y.fetchDaily('AAPL');const f=await y.fetchFundamentals('AAPL');const snap=s.buildSnapshot(bars,f,[f.forwardPE]);console.log(JSON.stringify(snap,null,2))"
```

Expected: 실제 AAPL 가격·변화율·52주 밴드·PER/PBR이 담긴 객체. `null`이 아니어야 한다.

- [ ] **Step 10: 타입체크 + 커밋**

```bash
npm test
```

```bash
npm run typecheck
```

```bash
git add src/types.ts src/snapshot.ts src/snapshot.test.ts src/bin/candidates.ts src/prepare.ts src/prepare.test.ts prompts/company_report.md
git commit -m "feat: add company snapshot data source so company_report never fabricates numbers"
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

