### Task 5: 수집 오케스트레이션 + feature 계산 + CLI

**Files:**
- Create: `src/collect.ts`
- Test: `src/collect.test.ts`
- Create: `src/bin/collect.ts`
- Modify: `src/types.ts` (`FeatureSet` 타입 추가)

**Interfaces:**
- Consumes: `indicators.ts` 전체, `sources/yahoo.ts`의 `fetchDaily`, `sources/naver.ts`의 `fetchNaverDaily`·`fetchForeignRatio`, `sources/fred.ts`의 `fetchFredSeries`·`hasFredKey`, `db.ts`의 `upsertSnapshot`·`kstDate`
- Produces: `collect.ts`: `SYMBOLS: Record<string, string>`, `SECTOR_ETFS: Record<string, string>`, `collectPrices(): Promise<Record<string, Ohlcv[]>>`, `collectMacro(): Promise<MacroBlock>`, `buildFeatures(prices: Record<string, Ohlcv[]>, macro: MacroBlock, date?: string, foreignRatioSamsung?: number | null): FeatureSet` (date 기본값 `kstDate()`, foreignRatioSamsung 기본값 `null`), `runCollect(): Promise<void>`

- [ ] **Step 1: `types.ts`에 타입 추가**

`src/types.ts` 끝에 덧붙인다:

```ts
export type MacroBlock = {
  available: boolean
  dgs2: number | null
  dgs10: number | null
  dgs3mo: number | null
  cpiYoY: number | null
  coreCpiYoY: number | null
  unrate: number | null
  hySpread: number | null
}

export type AssetFeature = {
  symbol: string
  close: number
  distSma20: number | null
  distSma60: number | null
  distSma200: number | null
  rsi14: number | null
  macdHist: number | null
  atr14: number | null
  realizedVol20: number | null
  mom12_1: number | null
  week52Position: number | null
  ret1m: number | null
  ret3m: number | null
}

export type FeatureSet = {
  date: string
  assets: Record<string, AssetFeature>
  macro: MacroBlock & { curve2s10s: number | null; curve3m10y: number | null }
  regime: {
    vixLevel: number | null
    vixTerm: number | null        // ^VIX / ^VIX3M. 1 초과 = 백워데이션(스트레스)
    breadth: number | null        // RSP/SPY 비율의 60일 SMA 대비 이격
    usdkrw: number | null
    usdkrwChange20d: number | null
  }
  relative: {
    krVsUs3m: number | null       // EWY 3개월 수익률 - SPY 3개월 수익률
    sectors: { etf: string; rel3m: number | null }[]  // 각 섹터 ETF 3개월 수익률 - SPY
  }
  foreignRatioSamsung: number | null
  missing: string[]               // 수집 실패한 심볼/시리즈. 다운스트림 agent가 flag로 쓴다
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`buildFeatures`는 순수 함수라 네트워크 없이 고정 입력으로 검증한다.

`src/collect.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFeatures } from './collect.ts'
import type { MacroBlock, Ohlcv } from './types.ts'

// 100에서 시작해 매일 +0.1씩 오르는 300봉. 상승 추세.
function series(start: number, step: number, n = 300): Ohlcv[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + step * i
    return { date: `d${i}`, open: c, high: c + 1, low: c - 1, close: c, volume: 1000 }
  })
}

const macro: MacroBlock = {
  available: true, dgs2: 3.5, dgs10: 4.2, dgs3mo: 4.5,
  cpiYoY: 0.025, coreCpiYoY: 0.03, unrate: 4.1, hySpread: 3.2,
}

test('buildFeatures는 금리차를 계산한다', () => {
  const f = buildFeatures({ '^GSPC': series(100, 0.1) }, macro)
  assert.ok(Math.abs(f.macro.curve2s10s! - 0.7) < 1e-9)
  assert.ok(Math.abs(f.macro.curve3m10y! - -0.3) < 1e-9)
})

test('상승 추세 자산은 이동평균 위, RSI 100', () => {
  const f = buildFeatures({ '^GSPC': series(100, 0.1) }, macro)
  const a = f.assets['^GSPC']
  assert.ok(a.distSma200! > 0)
  assert.equal(a.rsi14, 100)
  assert.equal(a.week52Position, 1)
})

test('빠진 심볼은 missing에 기록되고 관련 feature는 null', () => {
  const f = buildFeatures({ '^GSPC': series(100, 0.1) }, macro)
  assert.ok(f.missing.includes('^VIX'))
  assert.equal(f.regime.vixLevel, null)
  assert.equal(f.regime.breadth, null)
})

test('macro가 없으면 곡선도 null이고 missing에 남는다', () => {
  const empty: MacroBlock = {
    available: false, dgs2: null, dgs10: null, dgs3mo: null,
    cpiYoY: null, coreCpiYoY: null, unrate: null, hySpread: null,
  }
  const f = buildFeatures({ '^GSPC': series(100, 0.1) }, empty)
  assert.equal(f.macro.curve2s10s, null)
  assert.ok(f.missing.includes('fred'))
})

test('VIX 기간구조는 VIX/VIX3M 비율', () => {
  const f = buildFeatures(
    { '^VIX': series(20, 0), '^VIX3M': series(25, 0) },
    macro,
  )
  assert.ok(Math.abs(f.regime.vixTerm! - 0.8) < 1e-9)
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './collect.ts'`

- [ ] **Step 4: `collect.ts` 구현**

`src/collect.ts`:

```ts
import {
  atr, distFromSma, macd, momentum12_1, pctChange,
  realizedVol, rsi, sma, week52Position,
} from './indicators.ts'
import { fetchDaily } from './sources/yahoo.ts'
import { fetchForeignRatio, fetchNaverDaily } from './sources/naver.ts'
import { fetchFredSeries, hasFredKey } from './sources/fred.ts'
import { kstDate, upsertSnapshot } from './db.ts'
import type { AssetFeature, FeatureSet, MacroBlock, Ohlcv } from './types.ts'

export const SYMBOLS: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': '나스닥 종합',
  '^KS11': 'KOSPI',
  '^KQ11': 'KOSDAQ',
  SPY: 'S&P 500 ETF',
  RSP: 'S&P 500 동일가중 ETF',
  EWY: '한국 ETF (USD)',
  '^VIX': 'VIX',
  '^VIX3M': 'VIX 3M',
  'KRW=X': '원달러',
  'DX-Y.NYB': '달러인덱스',
  'CL=F': 'WTI',
}

export const SECTOR_ETFS: Record<string, string> = {
  XLK: '기술', XLF: '금융', XLE: '에너지', XLV: '헬스케어',
  XLI: '산업재', XLY: '경기소비재', XLP: '필수소비재', XLU: '유틸리티',
  XLB: '소재', XLRE: '리츠', XLC: '커뮤니케이션',
}

// 한국 지수는 Yahoo가 실패하면 네이버로 폴백한다.
const KR_FALLBACK: Record<string, string> = { '^KS11': 'KOSPI', '^KQ11': 'KOSDAQ' }

export async function collectPrices(): Promise<Record<string, Ohlcv[]>> {
  const symbols = [...Object.keys(SYMBOLS), ...Object.keys(SECTOR_ETFS)]
  const out: Record<string, Ohlcv[]> = {}
  // 순차 수집. rate limit 회피가 속도보다 중요하다.
  for (const s of symbols) {
    try {
      const bars = await fetchDaily(s)
      if (bars.length > 0) out[s] = bars
      else throw new Error('빈 시계열')
    } catch (e) {
      const fallback = KR_FALLBACK[s]
      if (!fallback) {
        console.error(`price fetch 실패 ${s}: ${(e as Error).message}`)
        continue
      }
      try {
        out[s] = await fetchNaverDaily(fallback)
        console.error(`${s}는 네이버 폴백 사용`)
      } catch (e2) {
        console.error(`price fetch 실패 ${s} (폴백도 실패): ${(e2 as Error).message}`)
      }
    }
  }
  return out
}

const last = (obs: { value: number | null }[]): number | null =>
  [...obs].reverse().find((o) => o.value !== null)?.value ?? null

// 월간 시리즈의 전년동월 대비 변화율
function yoy(obs: { value: number | null }[]): number | null {
  const v = obs.filter((o) => o.value !== null)
  if (v.length < 13) return null
  const now = v.at(-1)!.value!
  const yearAgo = v.at(-13)!.value!
  return yearAgo === 0 ? null : now / yearAgo - 1
}

export async function collectMacro(): Promise<MacroBlock> {
  const empty: MacroBlock = {
    available: false, dgs2: null, dgs10: null, dgs3mo: null,
    cpiYoY: null, coreCpiYoY: null, unrate: null, hySpread: null,
  }
  if (!hasFredKey()) {
    console.error('FRED_API_KEY 없음 — 매크로 블록을 건너뜁니다')
    return empty
  }
  const start = new Date(Date.now() - 800 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  try {
    const [dgs2, dgs10, dgs3mo, cpi, core, unrate, hy] = await Promise.all([
      fetchFredSeries('DGS2', start),
      fetchFredSeries('DGS10', start),
      fetchFredSeries('DGS3MO', start),
      fetchFredSeries('CPIAUCSL', start),
      fetchFredSeries('CPILFESL', start),
      fetchFredSeries('UNRATE', start),
      fetchFredSeries('BAMLH0A0HYM2', start),
    ])
    return {
      available: true,
      dgs2: last(dgs2), dgs10: last(dgs10), dgs3mo: last(dgs3mo),
      cpiYoY: yoy(cpi), coreCpiYoY: yoy(core),
      unrate: last(unrate), hySpread: last(hy),
    }
  } catch (e) {
    console.error(`FRED 수집 실패: ${(e as Error).message}`)
    return empty
  }
}

function assetFeature(symbol: string, bars: Ohlcv[]): AssetFeature {
  const closes = bars.map((b) => b.close)
  const m = macd(closes)
  return {
    symbol,
    close: closes[closes.length - 1],
    distSma20: distFromSma(closes, 20),
    distSma60: distFromSma(closes, 60),
    distSma200: distFromSma(closes, 200),
    rsi14: rsi(closes, 14),
    macdHist: m ? m.hist : null,
    atr14: atr(bars, 14),
    realizedVol20: realizedVol(closes, 20),
    mom12_1: momentum12_1(closes),
    week52Position: week52Position(bars),
    ret1m: pctChange(closes, 21),
    ret3m: pctChange(closes, 63),
  }
}

export function buildFeatures(
  prices: Record<string, Ohlcv[]>,
  macro: MacroBlock,
  date = kstDate(),
  foreignRatioSamsung: number | null = null,
): FeatureSet {
  const missing: string[] = []
  const expected = [...Object.keys(SYMBOLS), ...Object.keys(SECTOR_ETFS)]
  for (const s of expected) if (!prices[s] || prices[s].length === 0) missing.push(s)
  if (!macro.available) missing.push('fred')
  if (foreignRatioSamsung === null) missing.push('naver:foreignRatio')

  const assets: Record<string, AssetFeature> = {}
  for (const [symbol, bars] of Object.entries(prices)) {
    if (bars.length > 0) assets[symbol] = assetFeature(symbol, bars)
  }

  const closesOf = (s: string): number[] | null => {
    const bars = prices[s]
    return bars && bars.length > 0 ? bars.map((b) => b.close) : null
  }
  const lastOf = (s: string): number | null => closesOf(s)?.at(-1) ?? null

  // 브레드스: RSP/SPY 비율이 자신의 60일 평균 대비 어디인가.
  // 500종목을 매일 긁는 대신 쓰는 의도적 근사다.
  let breadth: number | null = null
  const rsp = closesOf('RSP')
  const spy = closesOf('SPY')
  if (rsp && spy) {
    const n = Math.min(rsp.length, spy.length)
    const ratio = Array.from({ length: n }, (_, i) => rsp[rsp.length - n + i] / spy[spy.length - n + i])
    breadth = distFromSma(ratio, 60)
  }

  const vix = lastOf('^VIX')
  const vix3m = lastOf('^VIX3M')
  const usdkrwCloses = closesOf('KRW=X')

  const spy3m = assets['SPY']?.ret3m ?? null
  const rel = (etf: string): number | null => {
    const r = assets[etf]?.ret3m
    return r === undefined || r === null || spy3m === null ? null : r - spy3m
  }

  return {
    date,
    assets,
    macro: {
      ...macro,
      curve2s10s: macro.dgs10 !== null && macro.dgs2 !== null ? macro.dgs10 - macro.dgs2 : null,
      curve3m10y: macro.dgs10 !== null && macro.dgs3mo !== null ? macro.dgs10 - macro.dgs3mo : null,
    },
    regime: {
      vixLevel: vix,
      vixTerm: vix !== null && vix3m !== null && vix3m !== 0 ? vix / vix3m : null,
      breadth,
      usdkrw: usdkrwCloses?.at(-1) ?? null,
      usdkrwChange20d: usdkrwCloses ? pctChange(usdkrwCloses, 20) : null,
    },
    relative: {
      krVsUs3m: rel('EWY'),
      sectors: Object.keys(SECTOR_ETFS).map((etf) => ({ etf, rel3m: rel(etf) })),
    },
    foreignRatioSamsung,
    missing,
  }
}

export async function runCollect(): Promise<void> {
  const date = kstDate()
  const [prices, macro] = await Promise.all([collectPrices(), collectMacro()])

  let foreignRatio: number | null = null
  try {
    foreignRatio = await fetchForeignRatio('005930')
  } catch (e) {
    console.error(`외국인소진율 수집 실패: ${(e as Error).message}`)
  }

  // 원시 시계열은 마지막 260봉만 저장한다. 200일선 계산에 충분하고 payload가 작다.
  const trimmed = Object.fromEntries(
    Object.entries(prices).map(([s, bars]) => [s, bars.slice(-260)]),
  )
  await upsertSnapshot('prices', date, trimmed)
  await upsertSnapshot('macro', date, macro)

  const features = buildFeatures(prices, macro, date, foreignRatio)
  await upsertSnapshot('features', date, features)

  console.log(
    `수집 완료 ${date}: 심볼 ${Object.keys(prices).length}개, 매크로 ${macro.available ? 'OK' : '없음'}, 결측 ${features.missing.length}건`,
  )
  if (features.missing.length > 0) console.log(`결측: ${features.missing.join(', ')}`)
}
```

`sma`가 import되었지만 직접 쓰이지 않으면 import에서 뺀다.

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 지표 13개 + collect 5개 전부 통과

- [ ] **Step 6: CLI 엔트리 작성**

`src/bin/collect.ts`:

```ts
import { runCollect } from '../collect.ts'

try {
  await runCollect()
} catch (e) {
  console.error('수집 실패:', (e as Error).message)
  process.exit(1)
}
```

- [ ] **Step 7: 실제 수집 1회 실행**

```bash
npm run collect
```

Expected: `수집 완료 2026-..-..: 심볼 23개, 매크로 OK, 결측 0건`. 결측이 있으면 어떤 심볼인지 출력되고, 해당 소스를 고친 뒤 재실행한다.

- [ ] **Step 8: DB에 실데이터가 들어갔는지 확인**

Supabase MCP `execute_sql` (project_id `jsxhcqnupvvctnjiaric`):

```sql
select kind,
       date,
       jsonb_array_length(coalesce(payload->'missing', '[]'::jsonb)) as missing_count,
       payload->'assets'->'^KS11'->>'close' as kospi_close,
       payload->'assets'->'^GSPC'->>'close' as spx_close,
       payload->'macro'->>'curve2s10s' as curve_2s10s
from market_snapshots
where date = (select max(date) from market_snapshots)
order by kind;
```

Expected: `features`/`macro`/`prices` 3행. `features` 행의 `kospi_close`가 실제 KOSPI 지수대(수천), `spx_close`가 실제 S&P 지수대, `curve_2s10s`가 숫자. `missing_count` 0.

- [ ] **Step 9: 재실행 멱등성 확인**

```bash
npm run collect
```

이어서 `execute_sql`로:

```sql
select date, kind, count(*) from market_snapshots group by date, kind order by date desc;
```

Expected: 각 (date, kind) 조합의 count가 1. 중복 행이 없어야 한다.

- [ ] **Step 10: 타입체크 + 커밋**

```bash
npm run typecheck
```

```bash
git add src/types.ts src/collect.ts src/collect.test.ts src/bin/collect.ts
git commit -m "feat: add collection orchestration, feature builder and CLI"
```

---

## P1 완료 기준

설계서 §13 P1 기준: **"실제 한·미 데이터가 담긴 `market_snapshots` 1행이 존재하고 지표 계산에 자체 검증 통과"**

- [ ] `npm test` — 18개 테스트 전부 통과 (지표 13, collect 5)
- [ ] `npm run smoke` — 7개 소스 체크 전부 OK
- [ ] `npm run collect` 후 `market_snapshots`에 오늘자 `prices`/`macro`/`features` 3행 존재, `features.missing` 비어 있음
- [ ] 새 테이블 6개 전부 `rls_enabled: true`, `get_advisors(security)`에 새 경고 없음
- [ ] `.env`가 커밋되지 않음 (`git ls-files .env` 출력이 비어 있음)

## P1에서 의도적으로 뺀 것

| 뺀 것 | 이유 | 추가 시점 |
|---|---|---|
| DART / SEC EDGAR | `yahoo-finance2` 하나가 한·미 펀더멘털을 같은 형태로 준다. 매핑 계층 2개가 통째로 불필요 | 원문 공시가 필요해질 때 |
| 한국은행 ECOS | 미검증. 한국 매크로 없이도 미국 매크로 + 원달러로 레짐 판단 가능 | 한국 금리 사이클이 결론을 바꾸기 시작하면 |
| `universe` 테이블 시딩 (KOSPI200/S&P500 티커) | P1은 지수·ETF 레벨. 종목 스크리닝은 P2 범위 | P2 스크리너 |
| 종목 단위 `fetchFundamentals` 배치 수집 | 후보 12개를 정하는 스크리너가 P2에 있어야 무엇을 수집할지 정해진다 | P2 |
| pg_cron 자동화 | 수집 모듈이 손으로 돌아가는 걸 먼저 확인해야 한다 | P4 |
| 뉴스 수집 | `news` agent 입력이고 agent는 P2 | P2 |
