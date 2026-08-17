import { DESKS, MARKET_CODES } from './types.ts'
import type { AgentOutput, CompanyReport, DailyVerdict, Desk, MarketCode, SleeveSplit } from './types.ts'

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
    // 없으면 키 자체를 만들지 않는다. `markets: undefined`를 넣으면
    // 원본과 deepEqual이 깨지고 DB에도 쓸모없는 키가 남는다.
    ...(o.markets === undefined ? {} : { markets: marketReads(o.markets, p.child('markets')) }),
  }
}

const STANCE_3 = ['bullish', 'neutral', 'bearish'] as const

function marketReads(v: unknown, p: Path): AgentOutput['markets'] {
  return arr(v, p).map((m, i) => {
    const mp = p.child(i)
    const mo = obj(m, mp)
    return {
      market: oneOf(mo.market, mp.child('market'), MARKET_CODES),
      stance: oneOf(mo.stance, mp.child('stance'), STANCE_3),
      comment: str(mo.comment, mp.child('comment')),
    }
  })
}

/**
 * 데스크 agent는 5개 시장 전부에 코멘트를 남겨야 한다.
 * 하나라도 빠지면 그 시장의 판단 근거가 통째로 비므로 여기서 막는다.
 */
export function validateDeskOutput(v: unknown): AgentOutput {
  const out = validateAgentOutput(v)
  const p = new Path(`DeskOutput(${out.agent})`)
  if (!out.markets || out.markets.length === 0) {
    p.child('markets').fail('데스크 agent는 시장별 코멘트가 필요합니다')
  }
  const seen = new Set(out.markets!.map((m) => m.market))
  const missing = MARKET_CODES.filter((c) => !seen.has(c))
  if (missing.length > 0) {
    p.child('markets').fail(`빠진 시장: ${missing.join(', ')} (5개 전부 필요)`)
  }
  return out
}

/** 밴드 [하한, 상한]. 순서가 뒤집힌 값은 조용히 통과시키지 않는다. */
function band(v: unknown, p: Path): [number, number] {
  const a = arr(v, p)
  if (a.length !== 2) p.fail(`[하한, 상한] 두 개여야 함 (받은 개수: ${a.length})`)
  const lo = numIn(a[0], p.child(0), 0, 100)
  const hi = numIn(a[1], p.child(1), 0, 100)
  if (lo > hi) p.fail(`하한이 상한보다 큼 (${lo} > ${hi})`)
  return [lo, hi]
}

/**
 * sleeve 내부 배분. `weight_pct`는 그 sleeve 안에서의 비중이라 **합이 100이어야 한다**.
 * 전체 포트폴리오 비중과 헷갈려 합이 20 같은 값으로 오면 배분표가 조용히 틀리므로 여기서 막는다.
 */
function sleeveSplits(v: unknown, p: Path): SleeveSplit[] {
  const rows = arr(v, p, { min: 1 }).map((s, i) => {
    const sp = p.child(i)
    const so = obj(s, sp)
    return {
      sleeve: str(so.sleeve, sp.child('sleeve')),
      ticker: str(so.ticker, sp.child('ticker')),
      weight_pct: numIn(so.weight_pct, sp.child('weight_pct'), 0, 100),
      rationale: str(so.rationale, sp.child('rationale')),
    }
  })
  const total = rows.reduce((s, r) => s + r.weight_pct, 0)
  if (Math.abs(total - 100) > 1) {
    p.fail(`weight_pct 합이 100이어야 합니다 (받은 합: ${total.toFixed(1)}). 이 sleeve 안에서의 비중입니다`)
  }
  return rows
}

/**
 * 월간 리포트에서 **모델이 채우는 부분만** 검증한다.
 * 포지셔닝·구현표·from/to는 코드가 계산하므로 여기 오지 않는다.
 *
 * `expectedAreas`는 코드가 만든 변화 목록의 area다. 모델이 area를 바꾸거나
 * 없던 변화를 추가하면 짝이 어긋나므로 여기서 막는다 —
 * "지난달 대비 이렇게 바뀌었다"는 리포트에서 가장 조용히 틀리는 자리다.
 */
export function validateMonthlyNarrative(
  v: unknown,
  expectedAreas: string[],
): { outlook: string; themes: { title: string; body: string }[]; changes: { area: string; reason: string }[]; key_risks: string[] } {
  const p = new Path('MonthlyNarrative')
  const o = obj(v, p)

  const changes = arr(o.changes, p.child('changes')).map((c, i) => {
    const cp = p.child('changes').child(i)
    const co = obj(c, cp)
    return { area: str(co.area, cp.child('area')), reason: str(co.reason, cp.child('reason')) }
  })
  const got = changes.map((c) => c.area).sort()
  const want = [...expectedAreas].sort()
  if (got.length !== want.length || got.some((a, i) => a !== want[i])) {
    p.child('changes').fail(
      `area 목록이 입력과 정확히 일치해야 합니다. 기대: ${JSON.stringify(want)} / 받음: ${JSON.stringify(got)}`,
    )
  }

  return {
    outlook: str(o.outlook, p.child('outlook')),
    themes: arr(o.themes, p.child('themes'), { min: 1 }).map((t, i) => {
      const tp = p.child('themes').child(i)
      const to = obj(t, tp)
      return { title: str(to.title, tp.child('title')), body: str(to.body, tp.child('body')) }
    }),
    changes,
    key_risks: strArray(o.key_risks, p.child('key_risks'), { min: 1 }),
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
        ...(so.region === undefined
          ? {}
          : { region: oneOf(so.region, sp.child('region'), [...MARKET_CODES, 'GLOBAL'] as const) }),
      }
    }),
    regime: str(o.regime, p.child('regime')),
    horizon: str(o.horizon, p.child('horizon')),
    asset_allocation: (() => {
      const ap = p.child('asset_allocation')
      const ao = obj(o.asset_allocation, ap)
      const equity = band(ao.equity, ap.child('equity'))
      const bond = band(ao.bond, ap.child('bond'))
      const cash = band(ao.cash, ap.child('cash'))
      const alt = band(ao.alt, ap.child('alt'))
      // 밴드 중앙값의 합이 100 근처가 아니면 배분표로 쓸 수 없다.
      const mid = ([lo, hi]: [number, number]) => (lo + hi) / 2
      const total = mid(equity) + mid(bond) + mid(cash) + mid(alt)
      if (Math.abs(total - 100) > 5) {
        ap.fail(`밴드 중앙값 합이 100에서 너무 멉니다 (${total.toFixed(1)})`)
      }
      return {
        equity, bond, cash, alt,
        rationale: str(ao.rationale, ap.child('rationale')),
        fixed_income: sleeveSplits(ao.fixed_income, ap.child('fixed_income')),
        duration: (() => {
          const dp = ap.child('duration')
          const dobj = obj(ao.duration, dp)
          return {
            stance: oneOf(dobj.stance, dp.child('stance'), ['short', 'neutral', 'long'] as const),
            rationale: str(dobj.rationale, dp.child('rationale')),
          }
        })(),
        alternatives: sleeveSplits(ao.alternatives, ap.child('alternatives')),
      }
    })(),
    dm_vs_em: (() => {
      const dp = p.child('dm_vs_em')
      const dobj = obj(o.dm_vs_em, dp)
      return {
        preference: oneOf(dobj.preference, dp.child('preference'), ['DM', 'EM', 'neutral'] as const),
        rationale: str(dobj.rationale, dp.child('rationale')),
      }
    })(),
    fx_view: (() => {
      const fp = p.child('fx_view')
      const fobj = obj(o.fx_view, fp)
      const leg = (key: 'dxy' | 'usdkrw') => {
        const lp = fp.child(key)
        const lo = obj(fobj[key], lp)
        return {
          direction: oneOf(lo.direction, lp.child('direction'), STANCE_3),
          confidence: oneOf(lo.confidence, lp.child('confidence'), ['low', 'medium', 'high'] as const),
          rationale: str(lo.rationale, lp.child('rationale')),
        }
      }
      return { dxy: leg('dxy'), usdkrw: leg('usdkrw') }
    })(),
    markets: (() => {
      const mp = p.child('markets')
      const rows = arr(o.markets, mp, { min: 1 }).map((m, i) => {
        const rp = mp.child(i)
        const mo = obj(m, rp)
        return {
          code: oneOf(mo.code, rp.child('code'), MARKET_CODES),
          stance: oneOf(mo.stance, rp.child('stance'), ['OW', 'N', 'UW'] as const),
          weight_pct: numIn(mo.weight_pct, rp.child('weight_pct'), 0, 100),
          conviction: oneOf(mo.conviction, rp.child('conviction'), ['low', 'medium', 'high'] as const),
          headline: str(mo.headline, rp.child('headline')),
          rationale: str(mo.rationale, rp.child('rationale')),
          key_risk: str(mo.key_risk, rp.child('key_risk')),
          desk_reads: arr(mo.desk_reads, rp.child('desk_reads'), { min: 1 }).map((d, j) => {
            const dp2 = rp.child('desk_reads').child(j)
            const dobj2 = obj(d, dp2)
            return {
              desk: oneOf(dobj2.desk, dp2.child('desk'), DESKS) as Desk,
              stance: oneOf(dobj2.stance, dp2.child('stance'), STANCE_3),
              comment: str(dobj2.comment, dp2.child('comment')),
            }
          }),
        }
      })
      const seen = new Set(rows.map((r) => r.code))
      const missing = MARKET_CODES.filter((c) => !seen.has(c as MarketCode))
      if (missing.length > 0) mp.fail(`빠진 시장: ${missing.join(', ')} (5개 전부 필요)`)
      // 주식 슬리브 안의 배분이므로 합이 100이어야 한다. 합이 안 맞는 배분표는 실행할 수 없다.
      const total = rows.reduce((s, r) => s + r.weight_pct, 0)
      if (Math.abs(total - 100) > 1) {
        mp.fail(`weight_pct 합이 100이 아닙니다 (${total.toFixed(1)})`)
      }
      return rows
    })(),
    trades: arr(o.trades, p.child('trades')).map((t, i) => {
      const tp = p.child('trades').child(i)
      const to = obj(t, tp)
      return {
        action: oneOf(to.action, tp.child('action'), ['add', 'trim'] as const),
        instrument: str(to.instrument, tp.child('instrument')),
        market: oneOf(to.market, tp.child('market'), [...MARKET_CODES, 'GLOBAL'] as const),
        rationale: str(to.rationale, tp.child('rationale')),
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
