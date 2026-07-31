### Task 4: LLM 출력 스키마 검증

**Files:**
- Create: `src/schema.ts`
- Test: `src/schema.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `types.ts`에 `AgentOutput`, `DailyVerdict`, `CompanyReport` (설계서 §6.1 / §7 / §8.1 그대로)
  - `schema.ts`: `validateAgentOutput(v: unknown): AgentOutput`, `validateDailyVerdict(v: unknown): DailyVerdict`, `validateCompanyReport(v: unknown): CompanyReport`. 실패 시 어느 필드가 왜 틀렸는지 담은 `Error`를 던진다.

- [ ] **Step 1: 타입 추가**

`src/types.ts` 끝에 (설계서 §6.1, §7, §8.1과 동일):

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

- [ ] **Step 2: 실패하는 테스트 작성**

검증기의 값어치는 **거부**에 있다. 통과 케이스 하나보다 거부 케이스가 많아야 한다.

`src/schema.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAgentOutput, validateDailyVerdict } from './schema.ts'

const goodAgent = {
  agent: 'macro',
  score: 62,
  confidence: 0.7,
  signal: 'bullish',
  headline: '금리 인하 기대가 완만한 확장 국면을 지지',
  reasoning: '2s10s가 정상화됐고 HY 스프레드는 축소 중이다. 실업률은 안정적이다.',
  evidence: [
    { label: '2s10s', value: '0.70%p', source: 'features.macro.curve2s10s' },
    { label: 'HY 스프레드', value: '3.2%', source: 'features.macro.hySpread' },
  ],
  flags: ['CPI 발표 대기'],
}

test('정상 AgentOutput은 통과하고 같은 객체를 돌려준다', () => {
  assert.deepEqual(validateAgentOutput(goodAgent), goodAgent)
})

test('score가 0-100 밖이면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, score: 120 }), /score/)
  assert.throws(() => validateAgentOutput({ ...goodAgent, score: -1 }), /score/)
})

test('confidence가 0-1 밖이면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, confidence: 70 }), /confidence/)
})

test('signal이 허용값 밖이면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, signal: 'very bullish' }), /signal/)
})

test('evidence가 비어 있으면 거부 — 근거 없는 판단은 받지 않는다', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, evidence: [] }), /evidence/)
})

test('evidence 항목에 source가 없으면 거부', () => {
  const noSource = [{ label: '2s10s', value: '0.70%p' }]
  assert.throws(() => validateAgentOutput({ ...goodAgent, evidence: noSource }), /source/)
})

test('숫자 필드에 숫자 모양 문자열이 오면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, score: '62' }), /score/)
})

test('객체가 아니면 거부', () => {
  assert.throws(() => validateAgentOutput(null), /object/)
  assert.throws(() => validateAgentOutput('{}'), /object/)
})

const goodVerdict = {
  date: '2026-07-31',
  equity_score: 68,
  signal: 'increase',
  suggested_equity_weight: [60, 70],
  conviction: 'medium',
  drivers: [{ agent: 'macro', direction: '+', weight: 0.3, point: '금리 정상화' }],
  counter_case: '밸류에이션이 이미 높고 브레드스가 좁다.',
  countries: [{ code: 'KR', stance: 'OW', rationale: '상대 밸류에이션 매력' }],
  sectors: [{ name: 'Technology', stance: 'OW', etf: 'XLK', rationale: '상대모멘텀 우위' }],
  picks: [{
    ticker: '005930.KS', name: '삼성전자', market: 'KR', sector: 'Technology',
    thesis: '메모리 사이클 회복', scores: { tech: 70, fund: 65, news: 60 }, risk: '수요 둔화',
  }],
  invalidation: ['HY 스프레드가 5%를 넘으면 이 논리는 깨진다'],
  disclaimer: '투자자문이 아닙니다.',
}

test('정상 DailyVerdict은 통과', () => {
  assert.deepEqual(validateDailyVerdict(goodVerdict), goodVerdict)
})

test('suggested_equity_weight는 [하한, 상한] 두 개여야 하고 하한 <= 상한', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, suggested_equity_weight: [70] }), /suggested_equity_weight/)
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, suggested_equity_weight: [70, 60] }), /suggested_equity_weight/)
})

test('invalidation이 비면 거부 — 반증 조건 없는 결론은 받지 않는다', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, invalidation: [] }), /invalidation/)
})

test('counter_case가 비면 거부 — 반대의견 단계는 필수다', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, counter_case: '   ' }), /counter_case/)
})

test('disclaimer가 없으면 거부', () => {
  const { disclaimer: _drop, ...noDisclaimer } = goodVerdict
  assert.throws(() => validateDailyVerdict(noDisclaimer), /disclaimer/)
})

test('date가 YYYY-MM-DD가 아니면 거부', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, date: '2026/07/31' }), /date/)
})

test('픽의 market이 KR/US가 아니면 거부', () => {
  const bad = { ...goodVerdict, picks: [{ ...goodVerdict.picks[0], market: 'JP' }] }
  assert.throws(() => validateDailyVerdict(bad), /market/)
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './schema.ts'`

- [ ] **Step 4: 구현**

`src/schema.ts`:

```ts
import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

class Path {
  // ponytail: 문자열 경로를 손으로 잇는다. 검증기 하나 쓰자고 zod를 넣지 않는다.
  constructor(readonly at: string) {}
  child(key: string | number): Path {
    return new Path(typeof key === 'number' ? `${this.at}[${key}]` : `${this.at}.${key}`)
  }
  fail(msg: string): never {
    throw new Error(`${this.at}: ${msg}`)
  }
}

function obj(v: unknown, p: Path): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) p.fail('object가 아님')
  return v as Record<string, unknown>
}

function str(v: unknown, p: Path, { allowEmpty = false } = {}): string {
  if (typeof v !== 'string') p.fail(`문자열이어야 함 (받은 값: ${typeof v})`)
  if (!allowEmpty && (v as string).trim() === '') p.fail('비어 있으면 안 됨')
  return v as string
}

function numIn(v: unknown, p: Path, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) p.fail(`숫자여야 함 (받은 값: ${typeof v})`)
  const n = v as number
  if (n < lo || n > hi) p.fail(`${lo}-${hi} 범위여야 함 (받은 값: ${n})`)
  return n
}

function oneOf<T extends string>(v: unknown, p: Path, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    p.fail(`${allowed.join('|')} 중 하나여야 함 (받은 값: ${JSON.stringify(v)})`)
  }
  return v as T
}

function arr(v: unknown, p: Path, { min = 0 } = {}): unknown[] {
  if (!Array.isArray(v)) p.fail('배열이어야 함')
  const a = v as unknown[]
  if (a.length < min) p.fail(`최소 ${min}개 필요 (받은 개수: ${a.length})`)
  return a
}

function strArray(v: unknown, p: Path, { min = 0 } = {}): string[] {
  return arr(v, p, { min }).map((x, i) => str(x, p.child(i)))
}

function isoDate(v: unknown, p: Path): string {
  const s = str(v, p)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) p.fail(`YYYY-MM-DD 형식이어야 함 (받은 값: ${s})`)
  return s
}

export function validateAgentOutput(v: unknown): AgentOutput {
  const p = new Path('AgentOutput')
  const o = obj(v, p)
  return {
    agent: str(o.agent, p.child('agent')),
    score: numIn(o.score, p.child('score'), 0, 100),
    confidence: numIn(o.confidence, p.child('confidence'), 0, 1),
    signal: oneOf(o.signal, p.child('signal'), ['bullish', 'neutral', 'bearish'] as const),
    headline: str(o.headline, p.child('headline')),
    reasoning: str(o.reasoning, p.child('reasoning')),
    // 근거는 최소 1개. 출처 없는 숫자를 막는 장치라 비면 통과시키지 않는다.
    evidence: arr(o.evidence, p.child('evidence'), { min: 1 }).map((e, i) => {
      const ep = p.child('evidence').child(i)
      const eo = obj(e, ep)
      return {
        label: str(eo.label, ep.child('label')),
        value: str(eo.value, ep.child('value')),
        source: str(eo.source, ep.child('source')),
      }
    }),
    flags: strArray(o.flags, p.child('flags')),
  }
}

export function validateDailyVerdict(v: unknown): DailyVerdict {
  const p = new Path('DailyVerdict')
  const o = obj(v, p)

  const wp = p.child('suggested_equity_weight')
  const w = arr(o.suggested_equity_weight, wp)
  if (w.length !== 2) wp.fail(`[하한, 상한] 두 개여야 함 (받은 개수: ${w.length})`)
  const lo = numIn(w[0], wp.child(0), 0, 100)
  const hi = numIn(w[1], wp.child(1), 0, 100)
  if (lo > hi) wp.fail(`하한이 상한보다 큼 (${lo} > ${hi})`)

  return {
    date: isoDate(o.date, p.child('date')),
    equity_score: numIn(o.equity_score, p.child('equity_score'), 0, 100),
    signal: oneOf(o.signal, p.child('signal'), ['increase', 'hold', 'reduce'] as const),
    suggested_equity_weight: [lo, hi],
    conviction: oneOf(o.conviction, p.child('conviction'), ['low', 'medium', 'high'] as const),
    drivers: arr(o.drivers, p.child('drivers'), { min: 1 }).map((d, i) => {
      const dp = p.child('drivers').child(i)
      const dobj = obj(d, dp)
      return {
        agent: str(dobj.agent, dp.child('agent')),
        direction: oneOf(dobj.direction, dp.child('direction'), ['+', '-'] as const),
        weight: numIn(dobj.weight, dp.child('weight'), 0, 1),
        point: str(dobj.point, dp.child('point')),
      }
    }),
    counter_case: str(o.counter_case, p.child('counter_case')),
    countries: arr(o.countries, p.child('countries'), { min: 1 }).map((c, i) => {
      const cp = p.child('countries').child(i)
      const co = obj(c, cp)
      return {
        code: oneOf(co.code, cp.child('code'), ['KR', 'US'] as const),
        stance: oneOf(co.stance, cp.child('stance'), ['OW', 'N', 'UW'] as const),
        rationale: str(co.rationale, cp.child('rationale')),
      }
    }),
    sectors: arr(o.sectors, p.child('sectors'), { min: 1 }).map((s, i) => {
      const sp = p.child('sectors').child(i)
      const so = obj(s, sp)
      return {
        name: str(so.name, sp.child('name')),
        stance: oneOf(so.stance, sp.child('stance'), ['OW', 'N', 'UW'] as const),
        etf: str(so.etf, sp.child('etf')),
        rationale: str(so.rationale, sp.child('rationale')),
      }
    }),
    picks: arr(o.picks, p.child('picks')).map((k, i) => {
      const kp = p.child('picks').child(i)
      const ko = obj(k, kp)
      const scores = obj(ko.scores, kp.child('scores'))
      return {
        ticker: str(ko.ticker, kp.child('ticker')),
        name: str(ko.name, kp.child('name')),
        market: oneOf(ko.market, kp.child('market'), ['KR', 'US'] as const),
        sector: str(ko.sector, kp.child('sector')),
        thesis: str(ko.thesis, kp.child('thesis')),
        scores: {
          tech: numIn(scores.tech, kp.child('scores').child('tech'), 0, 100),
          fund: numIn(scores.fund, kp.child('scores').child('fund'), 0, 100),
          news: numIn(scores.news, kp.child('scores').child('news'), 0, 100),
        },
        risk: str(ko.risk, kp.child('risk')),
      }
    }),
    // 반증 조건 없는 결론은 받지 않는다 (설계서 §7).
    invalidation: strArray(o.invalidation, p.child('invalidation'), { min: 1 }),
    disclaimer: str(o.disclaimer, p.child('disclaimer')),
  }
}

export function validateCompanyReport(v: unknown): CompanyReport {
  const p = new Path('CompanyReport')
  const o = obj(v, p)
  const sp = p.child('snapshot')
  const s = obj(o.snapshot, sp)
  const wp = sp.child('week52')
  const w = obj(s.week52, wp)

  const nullableNum = (x: unknown, path: Path): number | null => {
    if (x === null) return null
    if (typeof x !== 'number' || !Number.isFinite(x)) path.fail('숫자 또는 null이어야 함')
    return x as number
  }
  const trend = (x: unknown, path: Path) =>
    arr(x, path).map((t, i) => {
      const tp = path.child(i)
      const to = obj(t, tp)
      if (typeof to.value !== 'number' || !Number.isFinite(to.value)) tp.child('value').fail('숫자여야 함')
      return { period: str(to.period, tp.child('period')), value: to.value as number }
    })

  return {
    ticker: str(o.ticker, p.child('ticker')),
    name: str(o.name, p.child('name')),
    market: oneOf(o.market, p.child('market'), ['KR', 'US'] as const),
    sector: str(o.sector, p.child('sector')),
    generated_at: str(o.generated_at, p.child('generated_at')),
    snapshot: {
      price: numIn(s.price, sp.child('price'), 0, Number.MAX_SAFE_INTEGER),
      change_1d: numIn(s.change_1d, sp.child('change_1d'), -1, 10),
      change_1m: numIn(s.change_1m, sp.child('change_1m'), -1, 100),
      change_12m: numIn(s.change_12m, sp.child('change_12m'), -1, 1000),
      market_cap: numIn(s.market_cap, sp.child('market_cap'), 0, Number.MAX_SAFE_INTEGER),
      per: nullableNum(s.per, sp.child('per')),
      pbr: nullableNum(s.pbr, sp.child('pbr')),
      roe: nullableNum(s.roe, sp.child('roe')),
      per_pctile_in_sector: nullableNum(s.per_pctile_in_sector, sp.child('per_pctile_in_sector')),
      debt_to_equity: nullableNum(s.debt_to_equity, sp.child('debt_to_equity')),
      week52: {
        high: numIn(w.high, wp.child('high'), 0, Number.MAX_SAFE_INTEGER),
        low: numIn(w.low, wp.child('low'), 0, Number.MAX_SAFE_INTEGER),
        position: numIn(w.position, wp.child('position'), 0, 1),
      },
      revenue_trend: trend(s.revenue_trend, sp.child('revenue_trend')),
      op_margin_trend: trend(s.op_margin_trend, sp.child('op_margin_trend')),
    },
    business: str(o.business, p.child('business')),
    thesis: strArray(o.thesis, p.child('thesis'), { min: 1 }),
    bear_points: strArray(o.bear_points, p.child('bear_points'), { min: 1 }),
    catalysts: strArray(o.catalysts, p.child('catalysts')),
    technical_read: str(o.technical_read, p.child('technical_read')),
    news: arr(o.news, p.child('news')).map((n, i) => {
      const np = p.child('news').child(i)
      const no = obj(n, np)
      return {
        title: str(no.title, np.child('title')),
        url: str(no.url, np.child('url')),
        date: str(no.date, np.child('date'), { allowEmpty: true }),
        takeaway: str(no.takeaway, np.child('takeaway')),
      }
    }),
    verdict: (() => {
      const vp = p.child('verdict')
      const vo = obj(o.verdict, vp)
      return {
        stance: oneOf(vo.stance, vp.child('stance'), ['positive', 'neutral', 'cautious'] as const),
        one_liner: str(vo.one_liner, vp.child('one_liner')),
        confidence: numIn(vo.confidence, vp.child('confidence'), 0, 1),
      }
    })(),
    invalidation: strArray(o.invalidation, p.child('invalidation'), { min: 1 }),
    disclaimer: str(o.disclaimer, p.child('disclaimer')),
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 45 + 스키마 15 = 60개

- [ ] **Step 6: 타입체크 + 커밋**

```bash
npm run typecheck
```

```bash
git add src/types.ts src/schema.ts src/schema.test.ts
git commit -m "feat: add runtime validators for LLM output schemas"
```

---

