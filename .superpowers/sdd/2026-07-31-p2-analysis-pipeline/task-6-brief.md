### Task 6: 발행 (검증 후 DB 쓰기)

**Files:**
- Create: `src/publish.ts`
- Test: `src/publish.test.ts`
- Create: `src/bin/publish.ts`
- Modify: `src/db.ts` (리포트 쓰기, 요청 완료 표시)
- Modify: `package.json` (`publish` 스크립트)

**Interfaces:**
- Consumes: `schema.ts` 전부; `db.ts`의 `db()`
- Produces:
  - `publish.ts`: `splitOutputs(raw: unknown): { agents: AgentOutput[]; verdict: DailyVerdict; reports: CompanyReport[] }`
  - `db.ts`: `writeAgentReports(date: string, agents: AgentOutput[]): Promise<void>`, `writeDailyVerdict(verdict: DailyVerdict): Promise<void>`, `writeCompanyReports(reports: CompanyReport[]): Promise<void>`, `markRequestsFulfilled(pairs: { ticker: string; market: string }[]): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 작성**

`splitOutputs`가 순수 함수라 네트워크 없이 검증한다. LLM 출력 파일 하나에 세 종류가 섞여 오므로
그 분리와 검증이 이 태스크의 위험 지점이다.

`src/publish.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitOutputs } from './publish.ts'

const agent = {
  agent: 'fundamental', score: 60, confidence: 0.6, signal: 'bullish',
  headline: 'h', reasoning: 'r',
  evidence: [{ label: 'ROE', value: '18.9%', source: 'candidates[0].roe' }], flags: [],
}

const verdict = {
  date: '2026-07-31', equity_score: 68, signal: 'increase',
  suggested_equity_weight: [60, 70], conviction: 'medium',
  drivers: [{ agent: 'macro', direction: '+', weight: 0.3, point: 'p' }],
  counter_case: '반대 논거', countries: [{ code: 'KR', stance: 'OW', rationale: 'r' }],
  sectors: [{ name: 'Technology', stance: 'OW', etf: 'XLK', rationale: 'r' }],
  picks: [], invalidation: ['조건'], disclaimer: 'd',
}

test('splitOutputs는 세 종류를 나눠 담는다', () => {
  const out = splitOutputs({ agents: [agent], verdict, company_reports: [] })
  assert.equal(out.agents.length, 1)
  assert.equal(out.verdict.equity_score, 68)
  assert.equal(out.reports.length, 0)
})

test('splitOutputs는 verdict가 없으면 거부', () => {
  assert.throws(() => splitOutputs({ agents: [agent], company_reports: [] }), /verdict/)
})

test('splitOutputs는 agent 하나가 깨져도 조용히 넘기지 않는다', () => {
  const broken = { ...agent, evidence: [] }
  assert.throws(() => splitOutputs({ agents: [agent, broken], verdict, company_reports: [] }), /evidence/)
})

test('splitOutputs는 최상위가 객체가 아니면 거부', () => {
  assert.throws(() => splitOutputs([agent]), /object/)
})

test('splitOutputs는 company_reports가 없으면 빈 배열로 둔다', () => {
  assert.deepEqual(splitOutputs({ agents: [agent], verdict }).reports, [])
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './publish.ts'`

- [ ] **Step 3: `src/publish.ts` 구현**

```ts
import { validateAgentOutput, validateCompanyReport, validateDailyVerdict } from './schema.ts'
import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

export function splitOutputs(raw: unknown): {
  agents: AgentOutput[]
  verdict: DailyVerdict
  reports: CompanyReport[]
} {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('LLM 출력: 최상위가 object가 아님')
  }
  const o = raw as Record<string, unknown>
  if (o.verdict === undefined) throw new Error('LLM 출력: verdict가 없음')
  const agentsRaw = Array.isArray(o.agents) ? o.agents : []
  const reportsRaw = Array.isArray(o.company_reports) ? o.company_reports : []
  return {
    agents: agentsRaw.map(validateAgentOutput),
    verdict: validateDailyVerdict(o.verdict),
    reports: reportsRaw.map(validateCompanyReport),
  }
}
```

- [ ] **Step 4: `src/db.ts`에 쓰기 함수 추가**

```ts
import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

export async function writeAgentReports(date: string, agents: AgentOutput[]): Promise<void> {
  if (agents.length === 0) return
  const rows = agents.map((a) => ({ date, agent: a.agent, output: a }))
  const { error } = await db().from('agent_reports').upsert(rows, { onConflict: 'date,agent' })
  if (error) throw new Error(`agent_reports 쓰기 실패: ${error.message}`)
}

// published는 false로 둔다. 사람이 확인한 뒤 공개하는 것이 기본값이다.
export async function writeDailyVerdict(verdict: DailyVerdict): Promise<void> {
  const { error } = await db()
    .from('daily_verdicts')
    .upsert({ date: verdict.date, verdict, published: false }, { onConflict: 'date' })
  if (error) throw new Error(`daily_verdicts 쓰기 실패: ${error.message}`)
}

export async function writeCompanyReports(reports: CompanyReport[]): Promise<void> {
  if (reports.length === 0) return
  const rows = reports.map((r) => ({
    ticker: r.ticker,
    market: r.market,
    date: r.generated_at.slice(0, 10),
    payload: r,
  }))
  const { error } = await db()
    .from('company_reports')
    .upsert(rows, { onConflict: 'ticker,market,date' })
  if (error) throw new Error(`company_reports 쓰기 실패: ${error.message}`)
}

export async function markRequestsFulfilled(
  pairs: { ticker: string; market: string }[],
): Promise<void> {
  for (const p of pairs) {
    const { error } = await db()
      .from('report_requests')
      .update({ fulfilled_at: new Date().toISOString() })
      .eq('ticker', p.ticker)
      .eq('market', p.market)
      .is('fulfilled_at', null)
    if (error) throw new Error(`report_requests 갱신 실패 (${p.ticker}): ${error.message}`)
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 77 + publish 5 = 82개

- [ ] **Step 6: CLI 작성**

`src/bin/publish.ts`:

```ts
import { readFile } from 'node:fs/promises'
import {
  markRequestsFulfilled, writeAgentReports, writeCompanyReports, writeDailyVerdict,
} from '../db.ts'
import { splitOutputs } from '../publish.ts'

const date = process.argv[2]
if (!date) {
  console.error('사용법: npm run publish -- YYYY-MM-DD')
  process.exit(1)
}

try {
  // A단계 agent 출력과 B단계 출력을 합쳐서 발행한다.
  const a = JSON.parse(await readFile(`runs/${date}/agents-a.json`, 'utf8')) as unknown[]
  const b = JSON.parse(await readFile(`runs/${date}/agents-b.json`, 'utf8')) as Record<string, unknown>
  const merged = {
    ...b,
    agents: [...(Array.isArray(a) ? a : []), ...(Array.isArray(b.agents) ? b.agents : [])],
  }

  const { agents, verdict, reports } = splitOutputs(merged)
  if (verdict.date !== date) {
    throw new Error(`verdict.date(${verdict.date})가 실행 날짜(${date})와 다릅니다`)
  }

  await writeAgentReports(date, agents)
  await writeDailyVerdict(verdict)
  await writeCompanyReports(reports)
  await markRequestsFulfilled(reports.map((r) => ({ ticker: r.ticker, market: r.market })))

  console.log(
    `발행 완료 ${date}: agent ${agents.length}건, verdict 1건(published=false), 기업리포트 ${reports.length}건`,
  )
} catch (e) {
  console.error('발행 실패:', (e as Error).message)
  process.exit(1)
}
```

`package.json`의 `scripts`에 추가:

```json
    "publish:run": "node --env-file=.env src/bin/publish.ts",
```

`publish`가 아니라 `publish:run`인 이유: npm의 `publish` 라이프사이클과 겹치지 않게 하기 위해서다.

- [ ] **Step 7: 타입체크 + 커밋**

```bash
npm run typecheck
```

```bash
git add src/publish.ts src/publish.test.ts src/bin/publish.ts src/db.ts package.json
git commit -m "feat: add validated publish path for agent outputs"
```

---

