### Task 2: 타입 + 조회/포맷 순수 함수 (TDD)

**Files:**
- Create: `web/lib/types.ts`
- Create: `web/lib/format.ts`
- Test: `web/lib/format.test.ts`
- Create: `web/lib/queries.ts`
- Test: `web/lib/queries.test.ts`

**Interfaces:**
- Consumes: `web/lib/supabase.ts`의 `supabase`
- Produces:
  - `types.ts`: `DailyVerdict`, `AgentOutput`, `CompanyReport` (설계서 §6.1/§7/§8.1과 동일한 최소 형태)
  - `format.ts`: `equityWeightLabel(range: [number, number]): string`, `signalLabel(signal: DailyVerdict['signal']): { text: string; className: string }`, `stanceClassName(stance: 'OW' | 'N' | 'UW'): string`, `scoreGaugeColor(score: number): string`
  - `queries.ts`: `getLatestPublishedVerdict(): Promise<{ date: string; verdict: DailyVerdict } | null>`, `getVerdictHistory(limit?: number): Promise<{ date: string; verdict: DailyVerdict }[]>`, `getAgentReports(date: string): Promise<{ agent: string; output: AgentOutput }[]>`, `isPublished(date: string): Promise<boolean>`, `getLatestCompanyReport(ticker: string, market: 'KR' | 'US'): Promise<CompanyReport | null>`, `historyPoint(row: { date: string; verdict: DailyVerdict }): { date: string; score: number }`

- [ ] **Step 1: 타입 작성**

`web/lib/types.ts` — 루트 `src/types.ts`와 패키지 경계가 다르므로 import하지 않고 이 앱이 실제로 쓰는
필드만 최소로 옮겨 적는다. 필드 이름은 루트 타입과 반드시 일치해야 한다(DB의 jsonb 컬럼을 그대로 읽으므로).

```ts
export type AgentOutput = {
  agent: string
  score: number
  confidence: number
  signal: 'bullish' | 'neutral' | 'bearish'
  headline: string
  reasoning: string
  evidence: { label: string; value: string; source: string }[]
  flags: string[]
}

export type DailyVerdict = {
  date: string
  equity_score: number
  signal: 'increase' | 'hold' | 'reduce'
  suggested_equity_weight: [number, number]
  conviction: 'low' | 'medium' | 'high'
  drivers: { agent: string; direction: '+' | '-'; weight: number; point: string }[]
  counter_case: string
  countries: { code: 'KR' | 'US'; stance: 'OW' | 'N' | 'UW'; rationale: string }[]
  sectors: { name: string; stance: 'OW' | 'N' | 'UW'; etf: string; rationale: string }[]
  picks: {
    ticker: string; name: string; market: 'KR' | 'US'; sector: string
    thesis: string
    scores: { tech: number; fund: number; news: number }
    risk: string
  }[]
  invalidation: string[]
  disclaimer: string
}

export type CompanyReport = {
  ticker: string; name: string; market: 'KR' | 'US'; sector: string
  generated_at: string
  snapshot: {
    price: number; change_1d: number; change_1m: number; change_12m: number
    market_cap: number
    per: number | null; pbr: number | null; roe: number | null
    per_pctile_in_sector: number | null
    debt_to_equity: number | null
    week52: { high: number; low: number; position: number }
    revenue_trend: { period: string; value: number }[]
    op_margin_trend: { period: string; value: number }[]
  }
  business: string
  thesis: string[]
  bear_points: string[]
  catalysts: string[]
  technical_read: string
  news: { title: string; url: string; date: string; takeaway: string }[]
  verdict: { stance: 'positive' | 'neutral' | 'cautious'; one_liner: string; confidence: number }
  invalidation: string[]
  disclaimer: string
}
```

- [ ] **Step 2: 포맷 함수 실패하는 테스트 작성**

`web/lib/format.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { equityWeightLabel, scoreGaugeColor, signalLabel, stanceClassName } from './format.ts'

test('equityWeightLabel은 [하한,상한]을 "60-70%"로 표시한다', () => {
  assert.equal(equityWeightLabel([60, 70]), '60-70%')
})

test('equityWeightLabel은 하한==상한이면 단일 숫자로 표시한다', () => {
  assert.equal(equityWeightLabel([65, 65]), '65%')
})

test('signalLabel은 세 신호를 각각 다른 문구/색으로 매핑한다', () => {
  assert.equal(signalLabel('increase').text, '비중 확대')
  assert.equal(signalLabel('reduce').text, '비중 축소')
  assert.equal(signalLabel('hold').text, '유지')
  assert.notEqual(signalLabel('increase').className, signalLabel('reduce').className)
})

test('stanceClassName은 OW/N/UW를 서로 다른 클래스로 매핑한다', () => {
  const ow = stanceClassName('OW')
  const uw = stanceClassName('UW')
  const n = stanceClassName('N')
  assert.notEqual(ow, uw)
  assert.notEqual(ow, n)
  assert.notEqual(n, uw)
})

test('scoreGaugeColor는 50 미만/이상에서 다른 색을 낸다', () => {
  assert.notEqual(scoreGaugeColor(30), scoreGaugeColor(70))
})

test('scoreGaugeColor는 0-100 경계에서 던지지 않는다', () => {
  assert.doesNotThrow(() => scoreGaugeColor(0))
  assert.doesNotThrow(() => scoreGaugeColor(100))
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd web && npm test
```

Expected: FAIL — `Cannot find module './format.ts'`

- [ ] **Step 4: `format.ts` 구현**

```ts
import type { DailyVerdict } from './types.ts'

export function equityWeightLabel([lo, hi]: [number, number]): string {
  return lo === hi ? `${lo}%` : `${lo}-${hi}%`
}

const SIGNAL_LABELS: Record<DailyVerdict['signal'], { text: string; className: string }> = {
  increase: { text: '비중 확대', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  hold: { text: '유지', className: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300' },
  reduce: { text: '비중 축소', className: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
}

export function signalLabel(signal: DailyVerdict['signal']) {
  return SIGNAL_LABELS[signal]
}

const STANCE_CLASSES: Record<'OW' | 'N' | 'UW', string> = {
  OW: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  N: 'bg-neutral-500/20 text-neutral-600 dark:text-neutral-300',
  UW: 'bg-rose-500/20 text-rose-700 dark:text-rose-300',
}

export function stanceClassName(stance: 'OW' | 'N' | 'UW'): string {
  return STANCE_CLASSES[stance]
}

// 50이 중립. 낮을수록 붉게, 높을수록 푸르게.
export function scoreGaugeColor(score: number): string {
  return score >= 50 ? '#059669' : '#e11d48'
}
```

- [ ] **Step 5: 포맷 테스트 통과 확인**

```bash
cd web && npm test
```

Expected: PASS — 6개

- [ ] **Step 6: 조회 함수 실패하는 테스트 작성**

`historyPoint`만 순수 함수라 네트워크 없이 테스트한다. 나머지 조회 함수는 Task 3에서 실제 라이브 DB로 확인한다
(이 프로젝트는 DB 접근 함수를 목으로 감싸지 않는다 — P1/P2도 라이브 확인을 택했다).

`web/lib/queries.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historyPoint } from './queries.ts'
import type { DailyVerdict } from './types.ts'

const verdict = (equity_score: number): DailyVerdict => ({
  date: '2026-07-31', equity_score, signal: 'hold', suggested_equity_weight: [60, 65],
  conviction: 'medium', drivers: [], counter_case: 'c', countries: [], sectors: [],
  picks: [], invalidation: ['i'], disclaimer: 'd',
})

test('historyPoint는 {date, verdict}를 {date, score}로 요약한다', () => {
  assert.deepEqual(historyPoint({ date: '2026-07-31', verdict: verdict(68) }), { date: '2026-07-31', score: 68 })
})
```

- [ ] **Step 7: 테스트 실패 확인**

```bash
cd web && npm test
```

Expected: FAIL — `Cannot find module './queries.ts'`

- [ ] **Step 8: `queries.ts` 구현**

```ts
import { supabase } from './supabase.ts'
import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

export async function getLatestPublishedVerdict(): Promise<{ date: string; verdict: DailyVerdict } | null> {
  const { data, error } = await supabase
    .from('daily_verdicts')
    .select('date,verdict')
    .order('date', { ascending: false })
    .limit(1)
  if (error) throw new Error(`daily_verdicts 조회 실패: ${error.message}`)
  const row = data?.[0]
  return row ? { date: row.date as string, verdict: row.verdict as DailyVerdict } : null
}

export async function getVerdictHistory(
  limit = 90,
): Promise<{ date: string; verdict: DailyVerdict }[]> {
  const { data, error } = await supabase
    .from('daily_verdicts')
    .select('date,verdict')
    .order('date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`daily_verdicts 히스토리 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => ({ date: r.date as string, verdict: r.verdict as DailyVerdict }))
}

export function historyPoint(row: { date: string; verdict: DailyVerdict }): { date: string; score: number } {
  return { date: row.date, score: row.verdict.equity_score }
}

// agent_reports는 RLS가 이미 전체 SELECT를 허용하므로, "발행 여부" 판단은
// daily_verdicts를 따로 조회해 앱 레벨에서 화면 노출을 결정한다.
export async function isPublished(date: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_verdicts')
    .select('date')
    .eq('date', date)
    .limit(1)
  if (error) throw new Error(`발행 여부 확인 실패: ${error.message}`)
  return (data?.length ?? 0) > 0
}

export async function getAgentReports(
  date: string,
): Promise<{ agent: string; output: AgentOutput }[]> {
  const { data, error } = await supabase
    .from('agent_reports')
    .select('agent,output')
    .eq('date', date)
    .order('agent', { ascending: true })
  if (error) throw new Error(`agent_reports 조회 실패: ${error.message}`)
  return (data ?? []).map((r) => ({ agent: r.agent as string, output: r.output as AgentOutput }))
}

export async function getLatestCompanyReport(
  ticker: string,
  market: 'KR' | 'US',
): Promise<CompanyReport | null> {
  const { data, error } = await supabase
    .from('company_reports')
    .select('payload')
    .eq('ticker', ticker)
    .eq('market', market)
    .order('date', { ascending: false })
    .limit(1)
  if (error) throw new Error(`company_reports 조회 실패 (${ticker}): ${error.message}`)
  const row = data?.[0]
  return row ? (row.payload as CompanyReport) : null
}
```

- [ ] **Step 9: 테스트 통과 확인 + 타입체크**

```bash
cd web && npm test && npm run typecheck && cd ..
```

Expected: PASS 7개(포맷 6 + `historyPoint` 1), typecheck 클린

- [ ] **Step 10: 커밋**

```bash
git add web/lib/types.ts web/lib/format.ts web/lib/format.test.ts web/lib/queries.ts web/lib/queries.test.ts
git commit -m "feat: add dashboard data queries and formatting helpers"
```

---

