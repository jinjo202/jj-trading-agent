import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

class Path {
  // ponytail: 문자열 경로를 손으로 잇는다. 검증기 하나 쓰자고 zod를 넣지 않는다.
  readonly at: string
  constructor(at: string) {
    this.at = at
  }
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
    picks: arr(o.picks, p.child('picks'), { min: 1 }).map((k, i) => {
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
    generated_at: (() => {
      const gp = p.child('generated_at')
      const generated_at = str(o.generated_at, gp)
      if (!/^\d{4}-\d{2}-\d{2}/.test(generated_at)) {
        gp.fail(`ISO 8601 날짜로 시작해야 함 (받은 값: ${generated_at})`)
      }
      return generated_at
    })(),
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
