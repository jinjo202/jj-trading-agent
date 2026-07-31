# P1 — 수집 파이프라인 + 지표 계산 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한·미 시장의 가격·매크로 데이터를 매일 결정론적으로 수집하고 지표를 계산해 Supabase `market_snapshots`에 저장하는 파이프라인을 만든다. LLM은 이 단계에 전혀 개입하지 않는다.

**Architecture:** 순수 TypeScript 모듈 3층 — `sources/*`(외부 fetch) → `indicators.ts`(순수 함수 계산) → `collect.ts`(오케스트레이션 후 스냅샷 payload 조립) → `db.ts`(Supabase 쓰기). CLI 엔트리 `src/bin/collect.ts`가 로컬 러너이고, 같은 모듈을 나중에 Edge Function이 import한다(P4). 지표는 전부 순수 함수라 네트워크 없이 단위 테스트한다.

**Tech Stack:** Node 24.18 (TypeScript 네이티브 타입 스트리핑, `node --test`, `--env-file`), `yahoo-finance2@4`, `@supabase/supabase-js`, Supabase Postgres.

## Global Constraints

- 런타임: Node 24. TypeScript 파일을 트랜스파일 없이 `node`로 직접 실행한다(타입 스트리핑). 따라서 `enum`, `namespace`, 생성자 파라미터 프로퍼티를 쓰지 않는다. 타입 전용 import는 `import type`으로 쓴다.
- 테스트 러너는 Node 내장 `node:test` + `node:assert/strict`. vitest/jest/tsx/ts-node/dotenv 등 추가 의존성을 넣지 않는다.
- 프로덕션 의존성은 `yahoo-finance2`와 `@supabase/supabase-js` 둘뿐이다.
- Yahoo 데이터는 반드시 `yahoo-finance2` 라이브러리 경유로 가져온다. `v10/quoteSummary`·`v7/quote` raw 호출은 `Invalid Crumb`으로 실패하므로 금지.
- 결측값은 `null`로 둔다. 0이나 추정치로 채우지 않는다. 백분위·z-score 계산에서 `null`은 제외한다.
- Supabase 프로젝트: `jsxhcqnupvvctnjiaric` (ap-northeast-2). 기존 테이블 `todos`/`daily_market`/`credit_split_raw`/`analysis_snapshot`/`ai_commentary`/`lending_balance_raw`는 다른 앱 소유이므로 건드리지 않는다.
- `service_role` 키는 로컬 러너 전용이며 `.env`에만 존재한다. 커밋 금지.
- 날짜 키는 KST 기준 `YYYY-MM-DD` 문자열이다.
- 주문 실행 코드 경로를 만들지 않는다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `package.json` | 의존성 2개, `test`/`collect` 스크립트 |
| `tsconfig.json` | 타입체크 전용(`noEmit`). 실행은 node가 직접 |
| `.gitignore` | `node_modules`, `.env` |
| `.env.example` | 필요한 환경변수 목록 |
| `src/types.ts` | `Ohlcv`, `Fundamentals`, `SnapshotKind`, `FeatureSet` 등 공유 타입 |
| `src/indicators.ts` | SMA/EMA/RSI/MACD/ATR/변동성/모멘텀/z-score/백분위. 순수 함수만 |
| `src/indicators.test.ts` | 위 함수 단위 테스트 |
| `src/sources/yahoo.ts` | `yahoo-finance2` 경유 일봉·펀더멘털 |
| `src/sources/naver.ts` | 네이버 `siseJson` 일봉 + 외국인소진율 (한국 폴백) |
| `src/sources/fred.ts` | FRED 시계열 |
| `src/sources/smoke.ts` | 세 소스가 실제로 응답하는지 확인하는 네트워크 스모크 체크 |
| `src/db.ts` | Supabase 클라이언트 + `market_snapshots` upsert |
| `src/collect.ts` | 심볼 목록, 수집 오케스트레이션, feature 조립 |
| `src/collect.test.ts` | `buildFeatures`를 고정 입력으로 검증 (네트워크 없음) |
| `src/bin/collect.ts` | CLI 엔트리 |

---

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
  volume: number | null
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
  // length 253이면 t = index 252. t-252 = index 0, t-21 = index 231.
  const values = Array.from({ length: 253 }, (_, i) => (i === 0 ? 100 : i === 231 ? 150 : 1))
  assert.ok(Math.abs(momentum12_1(values)! - 0.5) < 1e-9)
  assert.equal(momentum12_1([1, 2, 3]), null)
})

test('week52Position: 고가 = 1, 저가 = 0', () => {
  const bars = [bar(50, 50, 50), bar(150, 150, 150), bar(150, 150, 150)]
  assert.equal(week52Position(bars), 1)
})

test('distFromSma는 SMA 대비 퍼센트', () => {
  // 20 / 12.5 - 1. IEEE 754에서 정확히 0.6이 아니므로 epsilon 비교
  assert.ok(Math.abs(distFromSma([10, 10, 10, 20], 4)! - 0.6) < 1e-9)
})

test('pctChange는 lookback봉 전 대비 수익률', () => {
  assert.ok(Math.abs(pctChange([100, 110], 1)! - 0.1) < 1e-9)
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
  const end = values[values.length - 22]
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

### Task 2: Supabase 스키마 + RLS + DB 쓰기 모듈

**Files:**
- Create: `supabase/migrations/0001_trading_agent_schema.sql` (기록용 사본)
- Create: `src/db.ts`

**Interfaces:**
- Consumes: `types.ts`의 `SnapshotKind`
- Produces: `db.ts`: `db(): SupabaseClient`, `kstDate(): string`, `upsertSnapshot(kind: SnapshotKind, date: string, payload: unknown): Promise<void>`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/0001_trading_agent_schema.sql`. 설계서 §9 스키마에 `market_snapshots(date, kind)` 유니크 제약을 추가한다 — 같은 날 수집을 재실행해도 행이 중복되지 않아야 하기 때문이다.

```sql
create table if not exists market_snapshots (
  id bigint generated always as identity primary key,
  date date not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (date, kind)
);

create table if not exists agent_reports (
  id bigint generated always as identity primary key,
  date date not null,
  agent text not null,
  output jsonb not null,
  created_at timestamptz not null default now(),
  unique (date, agent)
);

create table if not exists daily_verdicts (
  id bigint generated always as identity primary key,
  date date not null unique,
  verdict jsonb not null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists company_reports (
  id bigint generated always as identity primary key,
  ticker text not null,
  market text not null check (market in ('KR', 'US')),
  date date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (ticker, market, date)
);

create table if not exists report_requests (
  id bigint generated always as identity primary key,
  ticker text not null,
  market text not null check (market in ('KR', 'US')),
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create table if not exists universe (
  ticker text not null,
  market text not null check (market in ('KR', 'US')),
  name text not null,
  sector text,
  active boolean not null default true,
  primary key (ticker, market)
);

create index if not exists market_snapshots_date_idx on market_snapshots (date desc);
create index if not exists agent_reports_date_idx on agent_reports (date desc);
create index if not exists company_reports_ticker_idx on company_reports (ticker, market, date desc);
create index if not exists report_requests_open_idx on report_requests (requested_at) where fulfilled_at is null;

alter table market_snapshots enable row level security;
alter table agent_reports    enable row level security;
alter table daily_verdicts   enable row level security;
alter table company_reports  enable row level security;
alter table report_requests  enable row level security;
alter table universe         enable row level security;

-- anon 읽기. daily_verdicts는 published된 행만.
create policy anon_read_agent_reports    on agent_reports    for select to anon using (true);
create policy anon_read_company_reports  on company_reports  for select to anon using (true);
create policy anon_read_universe         on universe         for select to anon using (true);
create policy anon_read_published_verdict on daily_verdicts   for select to anon using (published);

-- 웹에서 리포트 요청만 가능. 읽기/수정 불가.
create policy anon_insert_report_request on report_requests for insert to anon with check (true);

-- market_snapshots에는 anon 정책을 만들지 않는다(원시 데이터 비공개).
-- service_role은 RLS를 우회하므로 별도 정책이 필요 없다.
```

- [ ] **Step 2: 마이그레이션 적용**

Supabase MCP `apply_migration`을 project_id `jsxhcqnupvvctnjiaric`, name `trading_agent_schema`, query = 위 SQL로 호출한다.

- [ ] **Step 3: 스키마 적용 확인**

Supabase MCP `list_tables` (project_id `jsxhcqnupvvctnjiaric`, schemas `["public"]`, verbose `false`) 호출.
Expected: `market_snapshots`, `agent_reports`, `daily_verdicts`, `company_reports`, `report_requests`, `universe` 6개 테이블이 모두 `rls_enabled: true`로 나온다. 기존 테이블 6개는 그대로 남아 있다.

이어서 Supabase MCP `get_advisors` (type `security`)를 호출해 RLS 관련 경고가 새로 생기지 않았는지 본다. 새 테이블에 대한 "RLS disabled" 경고가 있으면 그 테이블의 `enable row level security`가 누락된 것이므로 고친다.

- [ ] **Step 4: `.env` 준비**

`.env.example`을 `.env`로 복사한 뒤 `SUPABASE_SERVICE_ROLE_KEY`를 Supabase 대시보드 Project Settings → API에서 복사해 채운다. `.env`는 `.gitignore`에 있으므로 커밋되지 않는다.

- [ ] **Step 5: DB 모듈 작성**

`src/db.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SnapshotKind } from './types.ts'

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다')
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}

// 수집 기준일은 항상 KST. 'sv-SE' 로케일이 YYYY-MM-DD를 준다.
export function kstDate(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export async function upsertSnapshot(kind: SnapshotKind, date: string, payload: unknown): Promise<void> {
  const { error } = await db()
    .from('market_snapshots')
    .upsert({ date, kind, payload }, { onConflict: 'date,kind' })
  if (error) throw new Error(`market_snapshots upsert 실패 (${kind}): ${error.message}`)
}
```

- [ ] **Step 6: 왕복 확인**

```bash
node --env-file=.env --input-type=module -e "const {upsertSnapshot,kstDate,db}=await import('./src/db.ts');await upsertSnapshot('prices',kstDate(),{smoke:true});const{data}=await db().from('market_snapshots').select('date,kind').eq('kind','prices');console.log(data);await db().from('market_snapshots').delete().eq('kind','prices')"
```

Expected: `[ { date: '2026-..-..', kind: 'prices' } ]` 출력 후 정리됨. 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/0001_trading_agent_schema.sql src/db.ts
git commit -m "feat: add supabase schema, RLS policies and snapshot writer"
```

---

### Task 3: Yahoo + Naver 소스 모듈

Yahoo가 메인, Naver가 한국 폴백 겸 외국인 수급 소스다.

**Files:**
- Create: `src/sources/yahoo.ts`
- Create: `src/sources/naver.ts`
- Create: `src/sources/smoke.ts`

**Interfaces:**
- Consumes: `types.ts`의 `Ohlcv`, `Fundamentals`
- Produces:
  - `yahoo.ts`: `fetchDaily(symbol: string, days?: number): Promise<Ohlcv[]>`, `fetchFundamentals(symbol: string): Promise<Fundamentals>`
  - `naver.ts`: `fetchNaverDaily(code: string, days?: number): Promise<Ohlcv[]>`, `fetchForeignRatio(code: string): Promise<number | null>`
  - `smoke.ts`: 실행형 스크립트 (export 없음)

- [ ] **Step 1: Yahoo 모듈 작성**

`src/sources/yahoo.ts`:

```ts
import YahooFinance from 'yahoo-finance2'
import type { Fundamentals, Ohlcv } from '../types.ts'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export async function fetchDaily(symbol: string, days = 420): Promise<Ohlcv[]> {
  const period1 = new Date(Date.now() - days * 24 * 3600 * 1000)
  const res = await yf.chart(symbol, { period1, interval: '1d' })
  return res.quotes
    .filter((q) => q.close !== null && q.open !== null && q.high !== null && q.low !== null)
    .map((q) => ({
      date: new Date(q.date).toISOString().slice(0, 10),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: q.volume ?? null,
    }))
}

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const s = await yf.quoteSummary(symbol, {
    modules: ['price', 'summaryProfile', 'defaultKeyStatistics', 'financialData'],
  })
  return {
    symbol,
    name: s.price?.longName ?? s.price?.shortName ?? null,
    sector: s.summaryProfile?.sector ?? null,
    price: num(s.price?.regularMarketPrice),
    marketCap: num(s.price?.marketCap),
    forwardPE: num(s.defaultKeyStatistics?.forwardPE),
    priceToBook: num(s.defaultKeyStatistics?.priceToBook),
    roe: num(s.financialData?.returnOnEquity),
    debtToEquity: num(s.financialData?.debtToEquity),
    revenueGrowth: num(s.financialData?.revenueGrowth),
    operatingMargin: num(s.financialData?.operatingMargins),
  }
}
```

- [ ] **Step 2: Naver 모듈 작성**

`siseJson.naver`는 JSON이 아니라 JS 리터럴을 돌려준다(키·문자열이 홑따옴표). 홑따옴표를 겹따옴표로 바꾼 뒤 파싱한다.
행 형식: `[날짜, 시가, 고가, 저가, 종가, 거래량, 외국인소진율]`, 첫 행은 헤더.

`src/sources/naver.ts`:

```ts
import type { Ohlcv } from '../types.ts'

type Row = [string, number, number, number, number, number, number]

async function fetchRows(code: string, days: number): Promise<Row[]> {
  const end = new Date()
  const start = new Date(Date.now() - days * 24 * 3600 * 1000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${code}&requestType=1&startTime=${fmt(start)}&endTime=${fmt(end)}&timeframe=day`
  const res = await fetch(url, { headers: { referer: 'https://finance.naver.com/' } })
  if (!res.ok) throw new Error(`Naver ${code} HTTP ${res.status}`)
  const rows = JSON.parse((await res.text()).replace(/'/g, '"')) as unknown[][]
  return rows.slice(1) as Row[]
}

export async function fetchNaverDaily(code: string, days = 420): Promise<Ohlcv[]> {
  const rows = await fetchRows(code, days)
  return rows.map((r) => ({
    date: `${r[0].slice(0, 4)}-${r[0].slice(4, 6)}-${r[0].slice(6, 8)}`,
    open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5],
  }))
}

// 외국인소진율(%). Yahoo에 없는 한국 수급 지표.
export async function fetchForeignRatio(code: string): Promise<number | null> {
  const rows = await fetchRows(code, 10)
  const last = rows.at(-1)
  const v = last?.[6]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
```

- [ ] **Step 3: 스모크 체크 스크립트 작성**

`src/sources/smoke.ts`:

```ts
import { fetchDaily, fetchFundamentals } from './yahoo.ts'
import { fetchNaverDaily, fetchForeignRatio } from './naver.ts'
import { fetchFredSeries } from './fred.ts'

const checks: [string, () => Promise<unknown>][] = [
  ['yahoo chart ^GSPC', async () => (await fetchDaily('^GSPC', 30)).length],
  ['yahoo chart ^KS11', async () => (await fetchDaily('^KS11', 30)).length],
  ['yahoo fundamentals AAPL', async () => (await fetchFundamentals('AAPL')).sector],
  ['yahoo fundamentals 005930.KS', async () => (await fetchFundamentals('005930.KS')).roe],
  ['naver daily 005930', async () => (await fetchNaverDaily('005930', 30)).length],
  ['naver foreign ratio 005930', async () => await fetchForeignRatio('005930')],
  ['fred DGS10', async () => (await fetchFredSeries('DGS10', '2026-01-01')).at(-1)],
]

let failed = 0
for (const [name, fn] of checks) {
  try {
    console.log(`OK   ${name}:`, await fn())
  } catch (e) {
    failed++
    console.error(`FAIL ${name}:`, (e as Error).message)
  }
}
process.exit(failed > 0 ? 1 : 0)
```

`fred.ts`는 Task 4에서 만든다. 그때까지 스모크는 import 에러로 실패한다 — Task 4 Step 3에서 실행한다.

- [ ] **Step 4: Yahoo/Naver만 먼저 확인**

```bash
node --input-type=module -e "const y=await import('./src/sources/yahoo.ts');const n=await import('./src/sources/naver.ts');console.log('gspc',(await y.fetchDaily('^GSPC',30)).at(-1));console.log('aapl',await y.fetchFundamentals('AAPL'));console.log('naver',(await n.fetchNaverDaily('005930',30)).at(-1),await n.fetchForeignRatio('005930'))"
```

Expected: `^GSPC` 최근 봉의 OHLCV, AAPL의 `sector: 'Technology'`와 숫자 지표들, 삼성전자 최근 봉과 외국인소진율(0-100 사이 숫자). 하나라도 `null`/에러면 그 소스를 고친 뒤 진행한다.

- [ ] **Step 5: 타입체크**

```bash
npm run typecheck
```

Expected: `fred.ts` 미존재로 `src/sources/smoke.ts`에서만 에러. 나머지 파일은 깨끗해야 한다.

- [ ] **Step 6: 커밋**

```bash
git add src/sources/yahoo.ts src/sources/naver.ts src/sources/smoke.ts
git commit -m "feat: add yahoo and naver data sources"
```

---

### Task 4: FRED 매크로 소스

**Files:**
- Create: `src/sources/fred.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `fred.ts`: `fetchFredSeries(id: string, start: string): Promise<{ date: string; value: number | null }[]>`, `hasFredKey(): boolean`

- [ ] **Step 1: 모듈 작성**

키가 없으면 던진다. 호출자(`collect.ts`)가 잡아서 매크로 필드를 `null`로 두고 진행한다 — 매크로 하나 때문에 가격 수집 전체가 죽으면 안 된다.

`src/sources/fred.ts`:

```ts
export function hasFredKey(): boolean {
  return Boolean(process.env.FRED_API_KEY)
}

export async function fetchFredSeries(
  id: string,
  start: string,
): Promise<{ date: string; value: number | null }[]> {
  const key = process.env.FRED_API_KEY
  if (!key) throw new Error('FRED_API_KEY 없음')
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&observation_start=${start}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED ${id} HTTP ${res.status}`)
  const json = (await res.json()) as { observations: { date: string; value: string }[] }
  // FRED는 결측을 '.'로 표기한다.
  return json.observations.map((o) => ({
    date: o.date,
    value: o.value === '.' ? null : Number(o.value),
  }))
}
```

- [ ] **Step 2: FRED 키 발급**

https://fredaccount.stlouisfed.org/apikeys 에서 무료 키를 발급받아 `.env`의 `FRED_API_KEY`에 넣는다.

- [ ] **Step 3: 전체 스모크 실행**

```bash
npm run smoke
```

Expected: 7개 체크가 전부 `OK`. 종료코드 0.

- [ ] **Step 4: 타입체크**

```bash
npm run typecheck
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/sources/fred.ts
git commit -m "feat: add FRED macro source and source smoke check"
```

---

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
// high/low를 종가와 같게 두어야 52주 밴드가 종가 범위와 일치하고
// 상승 추세의 마지막 봉이 정확히 52주 고점(position 1)이 된다.
function series(start: number, step: number, n = 300): Ohlcv[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + step * i
    return { date: `d${i}`, open: c, high: c, low: c, close: c, volume: 1000 }
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

---

## 실행 중 확정된 변경 (2026-07-31)

이 계획서의 코드 블록은 실행 전 초안이다. 리뷰가 결함 3건을 잡아 계획서 본문을 고쳤고,
최종 브랜치 리뷰가 5건을 더 잡아 코드에만 반영했다. **코드가 최종 기준이다.**

계획서 본문과 실제 코드가 다른 지점:

| 항목 | 계획서 | 최종 코드 | 이유 |
|---|---|---|---|
| `db.ts` 쓰기 함수 | `upsertSnapshot(kind, date, payload)` 3회 호출 | `upsertSnapshots(rows)` 1회 호출 | 3회 순차 쓰기 중간 실패 시 부분 스냅샷이 남음. 같은 코드량으로 원자적 |
| `collectMacro` | `Promise.all` | `Promise.allSettled`, 시리즈별 독립 null, `available`는 1개라도 성공하면 true | 7개 중 1개 실패가 나머지 6개를 버리는 문제 |
| `missing`의 매크로 표기 | `'fred'` 하나 | 블록 전체 실패면 `'fred'`, 부분 실패면 필드별 `'fred:dgs2'` 등 | 어느 매크로 입력이 없는지 agent가 알아야 함 |
| `pctRank` | 클램프 없음 | `Math.min(below, v.length - 1)` | 배열에 없는 값을 넣으면 150 같은 백분위가 나옴 |
| `week52Position` | 최소 봉 수 가드 없음 | `bars.length < 200`이면 null | 3봉으로 "52주 위치"를 계산하던 문제. P2의 신규상장 종목에서 터짐 |
| `macd` 가드 | `< 35` | `< 34` | 34봉이면 signal 계산에 충분 |
| `prices` 저장 payload | 260봉 트림만 | 260봉 트림 + OHLC 4자리 반올림 | 트림만으론 903KB→816KB(10%). 반올림까지 하면 565KB |
| Naver 폴백 | 빈 결과 가드 없음 | Yahoo 분기와 동일하게 `bars.length > 0` 확인 | 빈 응답이 `[]`로 저장되고 완료 로그의 심볼 수가 부풀려짐 |
| `smoke.ts` | 네이버 체크 1개(종목) | KOSPI·KOSDAQ 지수 체크 2개 추가 | 실제 폴백 경로가 커버되지 않았음 |
| `.gitignore` | 2줄 | `node_modules/`, `.next/`, `.env*`, `!.env.example`, `.vercel`, `dist/` | 2줄 버전이 `.env.local`을 무시하지 않아 P3에서 키 커밋 위험 |

리뷰가 잡은 계획서 자체의 결함 3건 (본문은 이미 수정됨):
`momentum12_1`의 t-21 인덱스 off-by-one, `volume ?? 0`의 null 정책 위반,
`series()` 픽스처의 high/low 패딩으로 `week52Position === 1`이 도달 불가였던 것.

**P1 완료 기준은 아직 미충족**: `SUPABASE_SERVICE_ROLE_KEY`와 `FRED_API_KEY`가 비어 있어
`market_snapshots`에 실제 행이 들어간 적이 없고 FRED가 데이터를 반환한 적이 없다.
키가 채워지면 `npm run collect`를 두 번 돌리고 §14의 확인 쿼리를 실행하면 닫힌다.
