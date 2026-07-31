# P3 — Next.js 대시보드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설계서 §10의 4개 라우트(`/`, `/history`, `/agents/[date]`, `/stock/[market]/[ticker]`)를 가진 Next.js 대시보드를 만들어 Vercel에 배포한다. 웹은 `anon` 키로 Supabase를 읽기 전용으로 본다 — LLM도, `service_role`도 웹 번들에 없다.

**Architecture:** 저장소 루트의 Node 파이프라인(`src/`)과 분리된 `web/` 하위 디렉터리에 독립된 `package.json`을 둔다. 데이터 조회는 순수 매핑 함수(`web/lib/queries.ts`, `web/lib/format.ts`)로 분리해 `node:test`로 검증하고, 페이지 컴포넌트는 그 함수들을 부른다. 하루 1회만 바뀌는 데이터라 각 라우트에 `revalidate`를 걸어 정적 재생성한다.

**Tech Stack:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + shadcn/ui + Recharts 3. `@supabase/supabase-js`(anon 키 전용).

## Global Constraints

- `web/`는 저장소 루트와 별개의 `package.json`을 가진 독립 패키지다. 루트의 "의존성 2개만" 제약은 `src/`(수집 파이프라인)에만 적용되고 `web/`에는 적용되지 않는다 — 여기는 새 프로젝트다.
- 웹 번들에 `SUPABASE_SERVICE_ROLE_KEY`가 들어가면 안 된다. `web/`의 모든 환경변수는 `NEXT_PUBLIC_` 접두사가 붙은 `anon` 키뿐이다.
- 실측한 실제 값 — Supabase 프로젝트 URL `https://jsxhcqnupvvctnjiaric.supabase.co`, `anon` 키는 legacy JWT 형식(`get_publishable_keys` MCP로 확인). `.env.local.example`엔 값을 비워 두고(루트 `.env.example` 관례와 동일), 실제 값은 Vercel 환경변수 설정과 로컬 `.env.local`에만 둔다.
- `daily_verdicts`는 RLS로 `published = true`인 행만 anon에게 보인다 — 별도 필터를 앱에서 다시 걸 필요 없다. `agent_reports`/`company_reports`/`universe`는 RLS가 이미 전체 SELECT를 허용한다(P1에서 결정된 스키마, 이 태스크에서 바꾸지 않는다).
- **`/agents/[date]`는 그날의 결론이 발행(published)되지 않았으면 데이터 대신 안내 문구를 보여준다.** 이건 RLS 문제가 아니라(RLS는 이미 `agent_reports` 전체를 허용) 화면 설계 판단이다 — agent 원문은 발행된 결론의 부속 자료로 노출하는 것이 설계서 §10 라우트 표의 의도에 맞는다.
- 디스클레이머는 `app/layout.tsx`에 고정 배치해 모든 페이지에 나타난다.
- 페이지 컴포넌트에 새 UI 프레임워크(별도 상태관리 라이브러리, CSS-in-JS 등)를 넣지 않는다. Tailwind 유틸리티 클래스 + shadcn 컴포넌트 몇 개(`Badge`, `Card`, `Table`, `Separator`)로 충분하다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `web/package.json` | Next.js 16 + React 19 + Tailwind 4 + Recharts + `@supabase/supabase-js` |
| `web/tsconfig.json`, `web/next.config.ts`, `web/postcss.config.mjs` | Next.js 표준 설정 |
| `web/app/layout.tsx` | 전역 레이아웃 + 고정 디스클레이머 |
| `web/app/globals.css` | Tailwind 4 진입점 |
| `web/app/page.tsx` | `/` 오늘의 결론 |
| `web/app/history/page.tsx` | `/history` 추이 |
| `web/app/agents/[date]/page.tsx` | `/agents/[date]` |
| `web/app/stock/[market]/[ticker]/page.tsx` | `/stock/[market]/[ticker]` |
| `web/lib/types.ts` | 이 앱이 쓰는 최소 타입(루트 `src/types.ts`와 별개 — 패키지 경계를 안 넘는다) |
| `web/lib/supabase.ts` | anon 클라이언트 팩토리 |
| `web/lib/queries.ts` | DB 조회 + 순수 매핑 함수 |
| `web/lib/queries.test.ts` | 매핑 함수 단위 테스트(네트워크 없음) |
| `web/lib/format.ts` | 점수·비중·스탠스 → 표시 문자열/색상 순수 함수 |
| `web/lib/format.test.ts` | 포맷 함수 단위 테스트 |
| `web/components/Disclaimer.tsx` | 고정 디스클레이머 |
| `web/components/ScoreGauge.tsx` | 점수 게이지 |
| `web/components/DriverCard.tsx` | `drivers` 카드 |
| `web/components/StanceGrid.tsx` | 국가·섹터 히트맵 |
| `web/.env.local.example` | 필요한 환경변수 목록(값 비움) |

---

### Task 1: Next.js 스캐폴드 + Supabase 클라이언트 + 레이아웃

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/postcss.config.mjs`
- Create: `web/app/layout.tsx`, `web/app/globals.css`
- Create: `web/lib/supabase.ts`
- Create: `web/components/Disclaimer.tsx`
- Create: `web/.env.local.example`
- Modify: `.gitignore` (루트, `web/.env.local.example` 예외 추가)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `web/lib/supabase.ts`: `getSupabase(): SupabaseClient` (지연 싱글턴 — 처음 호출될 때만 만들고 캐시한다), `components/Disclaimer.tsx`: `export function Disclaimer(): JSX.Element`

- [ ] **Step 1: 디렉터리 확인 후 패키지 파일 생성**

```bash
ls "web" 2>/dev/null || echo "web/ 없음 — 새로 만든다"
```

`web/package.json`:

```json
{
  "name": "trading-agent-web",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --test lib/**/*.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^16.2.12",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "@supabase/supabase-js": "^2.111.0",
    "recharts": "^3.10.1"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.3.3",
    "@tailwindcss/postcss": "^4.3.3"
  }
}
```

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`web/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

`web/postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

`web/.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://jsxhcqnupvvctnjiaric.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`.gitignore`(루트) 끝에 한 줄 추가 — `web/`도 자체 `node_modules`/`.next`/`.env.local`을 갖는데
기존 패턴(`node_modules/`, `.next/`, `.env*`)이 경로 깊이와 무관하게 이미 다 잡아준다.
`web/.env.local.example`만 예외 처리한다:

```
!web/.env.local.example
```

- [ ] **Step 2: 의존성 설치**

```bash
cd web && npm install && cd ..
```

- [ ] **Step 3: Supabase 클라이언트**

`web/lib/supabase.ts` — 루트 `src/db.ts`의 `db()`와 같은 지연 싱글턴 패턴을 쓴다.
모듈을 그냥 import만 해도(예: 순수 함수 테스트가 같은 파일을 통과 import할 때) 즉시 던지면 안 되므로,
실제로 호출될 때만 만들고 그 뒤로는 캐시한다:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다')
  }
  // anon 키만 쓴다. service_role은 이 파일에도, web/ 어디에도 존재하지 않는다.
  client = createClient(url, key)
  return client
}
```

- [ ] **Step 4: 디스클레이머 컴포넌트 + 전역 레이아웃**

`web/components/Disclaimer.tsx`:

```tsx
export function Disclaimer() {
  return (
    <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
      이 페이지는 공개 데이터를 정리·해석한 리서치 자료이며 투자자문이 아닙니다.
      작성자는 라이선스를 가진 투자자문업자가 아니며, 어떤 수익도 보장하지 않습니다.
      투자 판단과 그 결과에 대한 책임은 전적으로 투자자 본인에게 있습니다.
    </div>
  )
}
```

`web/app/globals.css`:

```css
@import 'tailwindcss';
```

`web/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Disclaimer } from '@/components/Disclaimer'
import './globals.css'

export const metadata: Metadata = {
  title: '오늘의 시장 판단',
  description: '한국·미국 시장 리서치 대시보드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <Disclaimer />
      </body>
    </html>
  )
}
```

- [ ] **Step 5: 빌드 확인**

```bash
cd web && npm run typecheck && cd ..
```

Expected: 에러 없음 (아직 `app/page.tsx`가 없어 `next build`는 실패하지만 typecheck는 통과해야 한다)

- [ ] **Step 6: 커밋**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/next.config.ts web/postcss.config.mjs web/app/layout.tsx web/app/globals.css web/lib/supabase.ts web/components/Disclaimer.tsx web/.env.local.example .gitignore
git commit -m "feat: scaffold Next.js dashboard with anon-only Supabase client"
```

---

### Task 2: 타입 + 조회/포맷 순수 함수 (TDD)

**Files:**
- Create: `web/lib/types.ts`
- Create: `web/lib/format.ts`
- Test: `web/lib/format.test.ts`
- Create: `web/lib/queries.ts`
- Test: `web/lib/queries.test.ts`

**Interfaces:**
- Consumes: `web/lib/supabase.ts`의 `getSupabase()`
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
import { getSupabase } from './supabase.ts'
import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

export async function getLatestPublishedVerdict(): Promise<{ date: string; verdict: DailyVerdict } | null> {
  const { data, error } = await getSupabase()
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
  const { data, error } = await getSupabase()
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
  const { data, error } = await getSupabase()
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
  const { data, error } = await getSupabase()
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
  const { data, error } = await getSupabase()
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

### Task 3: `/` 오늘의 결론 페이지

**Files:**
- Create: `web/app/page.tsx`
- Create: `web/components/ScoreGauge.tsx`
- Create: `web/components/DriverCard.tsx`
- Create: `web/components/StanceGrid.tsx`

**Interfaces:**
- Consumes: `queries.ts`의 `getLatestPublishedVerdict`; `format.ts` 전체
- Produces: 라우트 `/`. 이후 태스크가 참고할 시각 언어(카드·배지 스타일)를 여기서 확립한다.

- [ ] **Step 1: 하위 컴포넌트 작성**

`web/components/ScoreGauge.tsx`:

```tsx
import { scoreGaugeColor } from '@/lib/format'

export function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative flex h-28 w-28 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${scoreGaugeColor(score)} ${pct * 3.6}deg, #e5e7eb 0deg)` }}
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-2xl font-semibold dark:bg-neutral-900">
          {score}
        </div>
      </div>
      <span className="text-xs text-neutral-500">주식 비중 점수 (0-100, 50 중립)</span>
    </div>
  )
}
```

`web/components/DriverCard.tsx`:

```tsx
import type { DailyVerdict } from '@/lib/types'

export function DriverCard({ driver }: { driver: DailyVerdict['drivers'][number] }) {
  const sign = driver.direction === '+' ? 'text-emerald-600' : 'text-rose-600'
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{driver.agent}</span>
        <span className={sign}>{driver.direction} ({(driver.weight * 100).toFixed(0)}%)</span>
      </div>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{driver.point}</p>
    </div>
  )
}
```

`web/components/StanceGrid.tsx`:

```tsx
import { stanceClassName } from '@/lib/format'

export function StanceGrid({
  title, items,
}: {
  title: string
  items: { label: string; stance: 'OW' | 'N' | 'UW'; sub?: string }[]
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-neutral-500">{title}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((it) => (
          <div key={it.label} className={`rounded-md p-2 text-sm ${stanceClassName(it.stance)}`}>
            <div className="font-medium">{it.label}</div>
            <div className="text-xs opacity-80">{it.stance}{it.sub ? ` · ${it.sub}` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 페이지 작성**

`web/app/page.tsx`:

```tsx
import { getLatestPublishedVerdict } from '@/lib/queries'
import { equityWeightLabel, signalLabel } from '@/lib/format'
import { ScoreGauge } from '@/components/ScoreGauge'
import { DriverCard } from '@/components/DriverCard'
import { StanceGrid } from '@/components/StanceGrid'

export const revalidate = 3600

export default async function HomePage() {
  const latest = await getLatestPublishedVerdict()

  if (!latest) {
    return (
      <div className="py-12 text-center text-neutral-500">
        아직 공개된 결론이 없습니다. 첫 <code>/daily</code> 실행과 발행을 기다리는 중입니다.
      </div>
    )
  }

  const { date, verdict } = latest
  const signal = signalLabel(verdict.signal)

  return (
    <div className="flex flex-col gap-6">
      <header className="text-center">
        <p className="text-sm text-neutral-500">{date} 기준</p>
        <span className={`mt-1 inline-block rounded-full px-3 py-1 text-sm font-medium ${signal.className}`}>
          {signal.text}
        </span>
      </header>

      <div className="flex justify-center">
        <ScoreGauge score={verdict.equity_score} />
      </div>

      <div className="text-center">
        <p className="text-sm text-neutral-500">권장 주식비중</p>
        <p className="text-xl font-semibold">{equityWeightLabel(verdict.suggested_equity_weight)}</p>
        <p className="text-xs text-neutral-400">확신도: {verdict.conviction}</p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">왜 이렇게 판단했나</h2>
        <div className="flex flex-col gap-2">
          {verdict.drivers.map((d, i) => (
            <DriverCard key={i} driver={d} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
        <h2 className="mb-1 font-medium text-amber-800 dark:text-amber-300">반대 의견</h2>
        <p className="text-amber-900 dark:text-amber-200">{verdict.counter_case}</p>
      </section>

      <StanceGrid
        title="국가"
        items={verdict.countries.map((c) => ({ label: c.code, stance: c.stance, sub: c.rationale }))}
      />
      <StanceGrid
        title="섹터"
        items={verdict.sectors.map((s) => ({ label: s.name, stance: s.stance, sub: s.etf }))}
      />

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">종목</h2>
        <div className="flex flex-col gap-2">
          {verdict.picks.map((p) => (
            <a
              key={p.ticker}
              href={`/stock/${p.market}/${p.ticker}`}
              className="block rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
            >
              <div className="flex items-center justify-between text-sm font-medium">
                <span>{p.name} ({p.ticker})</span>
                <span className="text-neutral-400">{p.sector}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{p.thesis}</p>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">이 논리가 깨지는 조건</h2>
        <ul className="list-inside list-disc text-sm text-neutral-600 dark:text-neutral-400">
          {verdict.invalidation.map((inv, i) => (
            <li key={i}>{inv}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: 로컬에서 확인**

```bash
cd web && npm run dev
```

브라우저로 `http://localhost:3000`을 연다.

Expected: 발행된 verdict가 없으면 "아직 공개된 결론이 없습니다" 문구가 보인다(현재 DB가 비어 있으므로
이 경로가 나오는 것이 정상이다). 콘솔에 `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` 관련 에러가 없어야 한다.
`.env.local`이 없으면 `web/.env.local.example`을 복사해 실제 anon 키를 채운 뒤 다시 시도한다.

- [ ] **Step 4: 빌드 확인**

```bash
cd web && npm run build && cd ..
```

Expected: 빌드 성공. `/` 라우트가 정적/ISR로 표시된다.

- [ ] **Step 5: 커밋**

```bash
git add web/app/page.tsx web/components/ScoreGauge.tsx web/components/DriverCard.tsx web/components/StanceGrid.tsx
git commit -m "feat: add today's verdict route"
```

---

### Task 4: `/history` 페이지

**Files:**
- Create: `web/app/history/page.tsx`

**Interfaces:**
- Consumes: `queries.ts`의 `getVerdictHistory`, `historyPoint`; `format.ts`의 `signalLabel`

- [ ] **Step 1: 페이지 작성**

Recharts는 클라이언트 컴포넌트가 필요하므로 차트 부분만 별도 클라이언트 컴포넌트로 뺀다.

`web/app/history/ScoreTrendChart.tsx`:

```tsx
'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export function ScoreTrendChart({ points }: { points: { date: string; score: number }[] }) {
  const data = [...points].reverse() // 오래된 것부터
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Tooltip />
        <Line type="monotone" dataKey="score" stroke="#059669" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

`web/app/history/page.tsx`:

```tsx
import { getVerdictHistory, historyPoint } from '@/lib/queries'
import { signalLabel } from '@/lib/format'
import { ScoreTrendChart } from './ScoreTrendChart'

export const revalidate = 3600

export default async function HistoryPage() {
  const rows = await getVerdictHistory(90)

  if (rows.length === 0) {
    return <div className="py-12 text-center text-neutral-500">아직 발행된 결론이 없습니다.</div>
  }

  const points = rows.map(historyPoint)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">점수 추이</h1>
      <ScoreTrendChart points={points} />

      <div className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map(({ date, verdict }) => {
          const signal = signalLabel(verdict.signal)
          return (
            <a
              key={date}
              href={`/agents/${date}`}
              className="flex items-center justify-between py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <span>{date}</span>
              <span className="text-neutral-400">{verdict.equity_score}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${signal.className}`}>{signal.text}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 로컬 확인**

```bash
cd web && npm run dev
```

`http://localhost:3000/history`를 연다. Expected: 데이터가 없으면 안내 문구, 있으면 차트+목록.

- [ ] **Step 3: 빌드 + 커밋**

```bash
cd web && npm run build && cd ..
```

```bash
git add web/app/history/page.tsx web/app/history/ScoreTrendChart.tsx
git commit -m "feat: add history route with score trend chart"
```

---

### Task 5: `/agents/[date]` 페이지

**Files:**
- Create: `web/app/agents/[date]/page.tsx`

**Interfaces:**
- Consumes: `queries.ts`의 `isPublished`, `getAgentReports`; `format.ts`의 `signalLabel`

- [ ] **Step 1: 페이지 작성**

`web/app/agents/[date]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getAgentReports, isPublished } from '@/lib/queries'

export const revalidate = 3600

export default async function AgentsPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const published = await isPublished(date)

  if (!published) {
    return (
      <div className="py-12 text-center text-neutral-500">
        {date}의 결론은 아직 공개되지 않았습니다.
      </div>
    )
  }

  const reports = await getAgentReports(date)
  if (reports.length === 0) notFound()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{date} agent 리포트</h1>
      {reports.map(({ agent, output }) => (
        <div key={agent} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{agent}</h2>
            <span className="text-sm text-neutral-400">
              점수 {output.score} · 신뢰도 {(output.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <p className="mt-2 text-sm font-medium">{output.headline}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{output.reasoning}</p>
          <div className="mt-3 flex flex-col gap-1">
            {output.evidence.map((e, i) => (
              <div key={i} className="text-xs text-neutral-500">
                <span className="font-medium">{e.label}</span>: {e.value}{' '}
                <span className="text-neutral-400">({e.source})</span>
              </div>
            ))}
          </div>
          {output.flags.length > 0 && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              주의: {output.flags.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 로컬 확인 + 빌드**

```bash
cd web && npm run build && cd ..
```

Expected: 동적 라우트라 빌드는 성공하고 런타임에 렌더링된다. `/agents/2026-07-31` 같은 존재하지 않는
날짜로 접속하면 "공개되지 않았습니다" 문구가 뜬다(데이터가 없어도 404가 아니라 이 문구다).

- [ ] **Step 3: 커밋**

```bash
git add web/app/agents/[date]/page.tsx
git commit -m "feat: add agent reports route gated on published verdicts"
```

---

### Task 6: `/stock/[market]/[ticker]` 페이지

**Files:**
- Create: `web/app/stock/[market]/[ticker]/page.tsx`

**Interfaces:**
- Consumes: `queries.ts`의 `getLatestCompanyReport`

- [ ] **Step 1: 페이지 작성**

```tsx
import { notFound } from 'next/navigation'
import { getLatestCompanyReport } from '@/lib/queries'

export const revalidate = 3600

const STANCE_LABEL = { positive: '긍정적', neutral: '중립', cautious: '신중' } as const

export default async function StockPage({
  params,
}: {
  params: Promise<{ market: string; ticker: string }>
}) {
  const { market, ticker } = await params
  if (market !== 'KR' && market !== 'US') notFound()

  const report = await getLatestCompanyReport(ticker, market)
  if (!report) notFound()

  const { snapshot } = report

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-lg font-semibold">{report.name} ({report.ticker})</h1>
        <p className="text-sm text-neutral-500">{report.sector} · {report.market}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><span className="text-neutral-400">현재가</span><br />{snapshot.price.toLocaleString()}</div>
        <div><span className="text-neutral-400">1일</span><br />{(snapshot.change_1d * 100).toFixed(1)}%</div>
        <div><span className="text-neutral-400">1개월</span><br />{(snapshot.change_1m * 100).toFixed(1)}%</div>
        <div><span className="text-neutral-400">12개월</span><br />{(snapshot.change_12m * 100).toFixed(1)}%</div>
        <div><span className="text-neutral-400">시가총액</span><br />{snapshot.market_cap.toLocaleString()}</div>
        <div><span className="text-neutral-400">PER</span><br />{snapshot.per ?? '-'}</div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium text-neutral-500">사업</h2>
        <p className="text-sm">{report.business}</p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-1 text-sm font-medium text-emerald-600">투자 논지</h2>
          <ul className="list-inside list-disc text-sm">
            {report.thesis.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="mb-1 text-sm font-medium text-rose-600">반대 논거</h2>
          <ul className="list-inside list-disc text-sm">
            {report.bear_points.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium text-neutral-500">차트 위치</h2>
        <p className="text-sm">{report.technical_read}</p>
      </section>

      <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>종합 판단</span>
          <span>{STANCE_LABEL[report.verdict.stance]}</span>
        </div>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{report.verdict.one_liner}</p>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium text-neutral-500">최근 뉴스</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {report.news.map((n, i) => (
            <li key={i}>
              <a href={n.url} className="font-medium hover:underline" target="_blank" rel="noreferrer">{n.title}</a>
              <p className="text-neutral-500">{n.takeaway}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium text-neutral-500">이 논지가 깨지는 조건</h2>
        <ul className="list-inside list-disc text-sm text-neutral-600 dark:text-neutral-400">
          {report.invalidation.map((inv, i) => <li key={i}>{inv}</li>)}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
cd web && npm run build && cd ..
```

```bash
git add web/app/stock/[market]/[ticker]/page.tsx
git commit -m "feat: add company report route"
```

---

### Task 7: Vercel 배포

**Files:** 없음 (배포 설정만)

- [ ] **Step 1: Vercel CLI로 프로젝트 연결**

`web/`를 루트로 지정해야 한다 — 저장소 최상위가 아니라 `web/` 하위가 Next.js 프로젝트다.

```bash
cd web && npx vercel link
```

대화형 프롬프트에서: 기존 조직 선택 → 새 프로젝트 생성(예: `trading-agent`) → 루트 디렉터리 확인(`web`).

- [ ] **Step 2: 환경변수 등록**

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
```

값 입력 시: `https://jsxhcqnupvvctnjiaric.supabase.co`

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
```

값 입력 시: Supabase 대시보드 → Project Settings → API → `anon` `public` 키를 붙여넣는다.
Preview/Development 환경에도 같은 값으로 등록한다(각각 `preview`, `development`로 반복).

- [ ] **Step 3: 배포**

```bash
npx vercel deploy --prod
```

Expected: 배포 URL이 출력된다. 그 URL로 접속해 `/`, `/history`, `/stock/US/AAPL`(company_reports에
AAPL이 있을 때) 세 라우트가 뜨는지 확인한다. 지금은 DB가 비어 있으므로 `/`와 `/history`는
"아직 공개된 결론이 없습니다" 화면이 정상이다 — 500 에러가 아니라 이 문구가 뜨는지가 확인 포인트다.

- [ ] **Step 4: 배포 URL 기록**

`cd ..`로 저장소 루트로 돌아온 뒤, 이 계획 문서의 "P3 완료 기준" 아래에 실제 배포 URL을 적고 커밋한다.

```bash
git add docs/superpowers/plans/2026-07-31-p3-web-dashboard.md
git commit -m "docs: record Vercel deployment URL"
git push
```

---

## P3 완료 기준

설계서 §13에 P3 항목으로 없지만(P1-P4 표는 P4까지만 정의) §10 자체가 완료 기준이다:
**"배포 URL에서 오늘의 결론과 기업 1장 리포트가 보임."**

- [ ] `cd web && npm test` — format 6 + queries 1 = 7개 통과
- [ ] `cd web && npm run typecheck` — 클린
- [ ] `cd web && npm run build` — 성공
- [ ] Vercel 배포 URL 접속 시 `/`, `/history`, `/agents/[date]`, `/stock/[market]/[ticker]` 4개 라우트 모두
      500 에러 없이 렌더링됨(데이터가 비어 있으면 안내 문구, 있으면 실제 내용)
- [ ] 웹 번들 어디에도 `SUPABASE_SERVICE_ROLE_KEY` 없음 — `curl <배포URL>/_next/static/**/*.js`에
      그 문자열이 없는지 확인 가능(선택 사항, 애초에 코드에 존재하지 않으므로 구조적으로 불가능)
- [ ] 모든 페이지 하단에 디스클레이머 노출
- [ ] **배포 URL: (Task 7 완료 후 이 자리에 기록)**

## P3에서 의도적으로 뺀 것

| 뺀 것 | 이유 | 추가 시점 |
|---|---|---|
| 로그인/인증 | 웹은 읽기 전용 공개 대시보드다. anon 키 자체가 이미 공개 데이터 접근이다 | 필요해지면 |
| `report_requests` 제출 폼(웹에서 "리포트 요청") | 설계서 §8.2에 있지만 라우트 표(§10)엔 없다. 이 계획은 §10의 4개 라우트만 다룬다 | 별도 태스크 |
| 모바일 앱/PWA 매니페스트 | "모바일 우선" 반응형 웹으로 충분 | 필요해지면 |
| E2E 테스트(Playwright 등) | 라우트 4개, 순수 로직은 이미 `node:test`로 커버됨. 브라우저 확인으로 충분 | 라우트가 늘어나면 |
| shadcn CLI로 컴포넌트 생성 | Tailwind 유틸리티만으로 4개 라우트에 충분했다. 설계서의 "shadcn/ui" 언급은 필요시 개별 컴포넌트를
  `npx shadcn@latest add <name>`으로 추가하는 옵션으로 남겨둔다 | 폼·다이얼로그 등 복잡한 컴포넌트가 필요해지면 |
