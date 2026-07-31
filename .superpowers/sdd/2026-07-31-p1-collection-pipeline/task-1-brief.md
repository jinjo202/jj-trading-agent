### Task 1: 프로젝트 스캐폴드 + 지표 모듈 (TDD)

지표가 틀리면 전체 결론이 조용히 틀린다. 그래서 이 태스크가 첫 번째이고, 테스트가 먼저다.

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`
- Create: `src/types.ts`
- Create: `src/indicators.ts`
- Test: `src/indicators.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `types.ts`: `type Ohlcv = { date: string; open: number; high: number; low: number; close: number; volume: number }`
  - `indicators.ts`: `sma(values: number[], period: number): number | null`, `ema(values: number[], period: number): number | null`, `rsi(values: number[], period?: number): number | null`, `macd(values: number[]): { macd: number; signal: number; hist: number } | null`, `atr(bars: Ohlcv[], period?: number): number | null`, `realizedVol(values: number[], period?: number): number | null`, `momentum12_1(values: number[]): number | null`, `week52Position(bars: Ohlcv[]): number | null`, `distFromSma(values: number[], period: number): number | null`, `pctChange(values: number[], lookback: number): number | null`, `zscore(values: (number | null)[], value: number): number | null`, `pctRank(values: (number | null)[], value: number): number | null`

- [ ] **Step 1: 프로젝트 파일 생성**

`package.json`:

```json
{
  "name": "trading-agent",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "node --test",
    "typecheck": "tsc --noEmit",
    "collect": "node --env-file=.env src/bin/collect.ts",
    "smoke": "node --env-file=.env src/sources/smoke.ts"
  },
  "dependencies": {
    "yahoo-finance2": "^4.0.0",
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^24.0.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`.gitignore`:

```
node_modules
.env
```

`.env.example`:

```
SUPABASE_URL=https://jsxhcqnupvvctnjiaric.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
FRED_API_KEY=
```

그리고 설치:

```bash
npm install
```

- [ ] **Step 2: 공유 타입 작성**

`src/types.ts`:

```ts
export type Ohlcv = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Fundamentals = {
  symbol: string
  name: string | null
  sector: string | null
  price: number | null
  marketCap: number | null
  forwardPE: number | null
  priceToBook: number | null
  roe: number | null
  debtToEquity: number | null
  revenueGrowth: number | null
  operatingMargin: number | null
}

export type SnapshotKind = 'prices' | 'macro' | 'features'
```

- [ ] **Step 3: 실패하는 테스트 작성**

`src/indicators.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sma, ema, rsi, macd, atr, realizedVol, momentum12_1,
  week52Position, distFromSma, pctChange, zscore, pctRank,
} from './indicators.ts'
import type { Ohlcv } from './types.ts'

const bar = (close: number, high = close, low = close): Ohlcv => ({
  date: '2026-01-01', open: close, high, low, close, volume: 1000,
})

test('sma는 마지막 period개의 평균', () => {
  assert.equal(sma([1, 2, 3, 4, 5], 3), 4)
  assert.equal(sma([1, 2], 3), null, '데이터가 부족하면 null')
})

test('ema는 SMA로 시드한 뒤 k=2/(n+1)로 갱신', () => {
  // seed = sma([1,2],2) = 1.5, k = 2/3 -> 3*(2/3) + 1.5*(1/3) = 2.5
  assert.equal(ema([1, 2, 3], 2), 2.5)
})

test('rsi: 계속 오르면 100, 계속 내리면 0, 손계산 케이스와 일치', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i)
  const down = Array.from({ length: 30 }, (_, i) => 100 - i)
  assert.equal(rsi(up, 14), 100)
  assert.equal(rsi(down, 14), 0)

  // period=2, [10,11,10,11]: 시드 gain=loss=0.5 -> 마지막 +1로 gain=0.75, loss=0.25 -> RS=3 -> 75
  assert.ok(Math.abs(rsi([10, 11, 10, 11], 2)! - 75) < 1e-9)
})

test('rsi는 period+1개 미만이면 null', () => {
  assert.equal(rsi([1, 2, 3], 14), null)
})

test('macd hist = macd - signal', () => {
  const values = Array.from({ length: 120 }, (_, i) => 100 + i * 0.5)
  const m = macd(values)!
  assert.ok(Math.abs(m.hist - (m.macd - m.signal)) < 1e-9)
  assert.ok(m.macd > 0, '상승 추세에서 MACD는 양수')
})

test('atr: 레인지가 일정하면 ATR은 그 레인지', () => {
  const bars = Array.from({ length: 30 }, () => bar(100, 102, 98))
  assert.ok(Math.abs(atr(bars, 14)! - 4) < 1e-9)
})

test('realizedVol: 가격이 일정하면 0', () => {
  const flat = Array.from({ length: 40 }, () => 100)
  assert.equal(realizedVol(flat, 20), 0)
})

test('momentum12_1은 t-252 대비 t-21 수익률', () => {
  // 253개 중 index 0 = 100, index 232(=252-20) = 150
  const values = Array.from({ length: 253 }, (_, i) => (i === 0 ? 100 : i === 232 ? 150 : 1))
  assert.ok(Math.abs(momentum12_1(values)! - 0.5) < 1e-9)
  assert.equal(momentum12_1([1, 2, 3]), null)
})

test('week52Position: 고가 = 1, 저가 = 0', () => {
  const bars = [bar(50, 50, 50), bar(150, 150, 150), bar(150, 150, 150)]
  assert.equal(week52Position(bars), 1)
})

test('distFromSma는 SMA 대비 퍼센트', () => {
  assert.equal(distFromSma([10, 10, 10, 20], 4), 0.6) // 20 / 12.5 - 1
})

test('pctChange는 lookback봉 전 대비 수익률', () => {
  assert.equal(pctChange([100, 110], 1), 0.1)
  assert.equal(pctChange([100], 5), null)
})

test('zscore는 모집단 표준편차 기준', () => {
  assert.ok(Math.abs(zscore([1, 2, 3, 4, 5], 5)! - Math.SQRT2) < 1e-9)
  assert.equal(zscore([2, 2, 2], 2), null, '표준편차 0이면 null')
})

test('pctRank는 null을 제외하고 0-100 백분위', () => {
  assert.equal(pctRank([10, 20, 30, 40, 50], 30), 50)
  assert.equal(pctRank([10, null, 30, null, 50], 50), 100)
  assert.equal(pctRank([null, null], 5), null)
})
```

- [ ] **Step 4: 테스트가 실패하는지 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './indicators.ts'`

- [ ] **Step 5: 지표 구현**

`src/indicators.ts`:

```ts
import type { Ohlcv } from './types.ts'

const tail = (values: number[], n: number): number[] | null =>
  values.length < n ? null : values.slice(values.length - n)

export function sma(values: number[], period: number): number | null {
  const w = tail(values, period)
  return w === null ? null : w.reduce((a, b) => a + b, 0) / period
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null
  const k = 2 / (period + 1)
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (const v of values.slice(period)) e = v * k + e * (1 - k)
  return e
}

// Wilder 평활. 상승분/하락분의 지수평활 평균 비율.
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
  }
  if (loss === 0) return gain === 0 ? 50 : 100
  return 100 - 100 / (1 + gain / loss)
}

export function macd(values: number[]): { macd: number; signal: number; hist: number } | null {
  if (values.length < 35) return null
  const line: number[] = []
  for (let i = 26; i <= values.length; i++) {
    const slice = values.slice(0, i)
    line.push(ema(slice, 12)! - ema(slice, 26)!)
  }
  const signal = ema(line, 9)
  if (signal === null) return null
  const m = line[line.length - 1]
  return { macd: m, signal, hist: m - signal }
}

export function atr(bars: Ohlcv[], period = 14): number | null {
  if (bars.length < period + 1) return null
  const tr: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i]
    const prev = bars[i - 1].close
    tr.push(Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev)))
  }
  let a = tr.slice(0, period).reduce((x, y) => x + y, 0) / period
  for (const t of tr.slice(period)) a = (a * (period - 1) + t) / period
  return a
}

// 연율화 실현변동성. 일간 로그수익률 표준편차 * sqrt(252)
export function realizedVol(values: number[], period = 20): number | null {
  const w = tail(values, period + 1)
  if (w === null) return null
  const rets = w.slice(1).map((v, i) => Math.log(v / w[i]))
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length
  return Math.sqrt(variance) * Math.sqrt(252)
}

// 12개월 전(252봉) 대비 1개월 전(21봉) 수익률. 최근 1개월 반전 효과를 뺀 표준 정의.
export function momentum12_1(values: number[]): number | null {
  if (values.length < 253) return null
  const start = values[values.length - 253]
  const end = values[values.length - 21]
  return start === 0 ? null : end / start - 1
}

export function week52Position(bars: Ohlcv[]): number | null {
  const w = bars.slice(Math.max(0, bars.length - 252))
  if (w.length === 0) return null
  const high = Math.max(...w.map((b) => b.high))
  const low = Math.min(...w.map((b) => b.low))
  if (high === low) return null
  return (w[w.length - 1].close - low) / (high - low)
}

export function distFromSma(values: number[], period: number): number | null {
  const s = sma(values, period)
  if (s === null || s === 0) return null
  return values[values.length - 1] / s - 1
}

export function pctChange(values: number[], lookback: number): number | null {
  if (values.length < lookback + 1) return null
  const base = values[values.length - 1 - lookback]
  return base === 0 ? null : values[values.length - 1] / base - 1
}

const clean = (values: (number | null)[]): number[] =>
  values.filter((v): v is number => v !== null && Number.isFinite(v))

export function zscore(values: (number | null)[], value: number): number | null {
  const v = clean(values)
  if (v.length < 2) return null
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / v.length)
  return sd === 0 ? null : (value - mean) / sd
}

// 결측을 제외한 뒤 value보다 작은 값의 비율(0-100).
export function pctRank(values: (number | null)[], value: number): number | null {
  const v = clean(values)
  if (v.length < 2) return null
  const below = v.filter((x) => x < value).length
  return (below / (v.length - 1)) * 100
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 13개 테스트 전부 통과

- [ ] **Step 7: 타입체크**

```bash
npm run typecheck
```

Expected: 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example src/types.ts src/indicators.ts src/indicators.test.ts
git commit -m "feat: add indicator module with unit tests"
```

---

