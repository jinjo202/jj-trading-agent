### Task 5: 번들 조립 (A단계 · B단계)

**Files:**
- Create: `src/prepare.ts`
- Test: `src/prepare.test.ts`
- Create: `src/bin/prepare.ts`
- Create: `src/bin/candidates.ts`
- Modify: `src/db.ts` (스냅샷 읽기, 리포트 요청 큐 읽기)
- Modify: `package.json` (`prepare`, `candidates` 스크립트)
- Modify: `.gitignore` (`runs/`)

**Interfaces:**
- Consumes: `db.ts`의 `db()`·`kstDate()`·`readUniverse()`; `screener.ts` 전부; `sources/news.ts`; `sources/yahoo.ts`의 `fetchFundamentals`; `types.ts`의 `FeatureSet`
- Produces:
  - `types.ts`에 `BundleA`, `BundleB` 타입
  - `db.ts`: `readLatestSnapshot(kind: SnapshotKind): Promise<{ date: string; payload: unknown } | null>`, `readOpenReportRequests(limit?: number): Promise<{ id: number; ticker: string; market: 'KR' | 'US' }[]>`
  - `prepare.ts`: `buildBundleA(features: FeatureSet, indexNews: NewsItem[], krNews: NewsItem[]): BundleA`, `owSectorsFrom(agents: AgentOutput[]): string[]`, `buildBundleB(bundleA: BundleA, agents: AgentOutput[], candidates: Candidate[], news: Record<string, NewsItem[]>, requested: { ticker: string; market: 'KR' | 'US' }[]): BundleB`

- [ ] **Step 1: 타입 추가**

`src/types.ts` 끝에:

```ts
export type BundleA = {
  date: string
  features: FeatureSet
  news: { market: NewsItem[]; korea: NewsItem[] }
  agents_to_run: string[]
  disclaimer: string
}

export type BundleB = {
  date: string
  features: FeatureSet
  agents_a: AgentOutput[]
  candidates: Candidate[]
  candidate_news: Record<string, NewsItem[]>
  company_reports_for: { ticker: string; market: 'KR' | 'US' }[]
  agents_to_run: string[]
  disclaimer: string
}
```

- [ ] **Step 2: `src/db.ts`에 읽기 함수 추가**

```ts
export async function readLatestSnapshot(
  kind: SnapshotKind,
): Promise<{ date: string; payload: unknown } | null> {
  const { data, error } = await db()
    .from('market_snapshots')
    .select('date,payload')
    .eq('kind', kind)
    .order('date', { ascending: false })
    .limit(1)
  if (error) throw new Error(`market_snapshots 읽기 실패 (${kind}): ${error.message}`)
  const row = data?.[0]
  return row ? { date: row.date as string, payload: row.payload } : null
}

export async function readOpenReportRequests(
  limit = 5,
): Promise<{ id: number; ticker: string; market: 'KR' | 'US' }[]> {
  const { data, error } = await db()
    .from('report_requests')
    .select('id,ticker,market')
    .is('fulfilled_at', null)
    .order('requested_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`report_requests 읽기 실패: ${error.message}`)
  return (data ?? []) as { id: number; ticker: string; market: 'KR' | 'US' }[]
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`src/prepare.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBundleA, buildBundleB, owSectorsFrom } from './prepare.ts'
import type { AgentOutput, Candidate, FeatureSet, NewsItem } from './types.ts'

const features = {
  date: '2026-07-31',
  assets: {},
  macro: {
    available: true, dgs2: 3.5, dgs10: 4.2, dgs3mo: 4.5,
    cpiYoY: 0.025, coreCpiYoY: 0.03, unrate: 4.1, hySpread: 3.2,
    curve2s10s: 0.7, curve3m10y: -0.3,
  },
  regime: { vixLevel: 18, vixTerm: 0.9, breadth: 0.01, usdkrw: 1350, usdkrwChange20d: 0.01 },
  relative: { krVsUs3m: 0.04, sectors: [{ etf: 'XLK', rel3m: 0.06 }] },
  foreignRatioSamsung: 52.1,
  missing: [],
} as unknown as FeatureSet

const news = (t: string): NewsItem => ({ title: t, url: 'http://e.com/' + t, date: null, source: 's' })

const agent = (name: string, extra: Partial<AgentOutput> = {}): AgentOutput => ({
  agent: name, score: 60, confidence: 0.6, signal: 'bullish',
  headline: 'h', reasoning: 'r',
  evidence: [{ label: 'l', value: 'v', source: 'features.x' }],
  flags: [], ...extra,
})

const candidate = (ticker: string): Candidate => ({
  ticker, name: ticker, market: 'US', sector: 'Technology',
  turnover: 1e9, yearChangePct: 30, roe: 0.2, operatingMargin: 0.25,
  forwardPE: 20, priceToBook: 5, score: 1.2,
})

test('buildBundleA는 features와 뉴스를 담고 실행할 agent 5개를 명시한다', () => {
  const b = buildBundleA(features, [news('us')], [news('kr')])
  assert.equal(b.date, '2026-07-31')
  assert.equal(b.news.market.length, 1)
  assert.equal(b.news.korea.length, 1)
  assert.deepEqual(b.agents_to_run, ['macro', 'allocation', 'country_sector', 'technical', 'news'])
  assert.ok(b.disclaimer.length > 0)
})

test('owSectorsFrom은 country_sector의 evidence에서 OW 섹터를 뽑는다', () => {
  const cs = agent('country_sector', {
    evidence: [
      { label: 'sector:Technology', value: 'OW', source: 'features.relative.sectors' },
      { label: 'sector:Utilities', value: 'UW', source: 'features.relative.sectors' },
      { label: 'sector:Energy', value: 'OW', source: 'features.relative.sectors' },
      { label: 'country:US', value: 'OW', source: 'features.relative.krVsUs3m' },
    ],
  })
  assert.deepEqual(owSectorsFrom([agent('macro'), cs]), ['Technology', 'Energy'])
})

test('owSectorsFrom은 country_sector가 없거나 OW가 없으면 빈 배열', () => {
  assert.deepEqual(owSectorsFrom([agent('macro')]), [])
  assert.deepEqual(owSectorsFrom([agent('country_sector', { evidence: [{ label: 'sector:X', value: 'UW', source: 's' }] })]), [])
})

test('buildBundleB는 A단계 결과와 후보를 싣고 B단계 agent를 명시한다', () => {
  const a = buildBundleA(features, [], [])
  const b = buildBundleB(a, [agent('macro')], [candidate('AAPL')], { AAPL: [news('x')] }, [])
  assert.equal(b.date, a.date)
  assert.equal(b.candidates.length, 1)
  assert.equal(b.candidate_news.AAPL.length, 1)
  assert.deepEqual(b.agents_to_run, ['fundamental', 'counter', 'synthesizer', 'company_report'])
})

test('buildBundleB의 company_reports_for는 요청 큐를 그대로 싣는다', () => {
  const a = buildBundleA(features, [], [])
  const req = [{ ticker: 'MSFT', market: 'US' as const }]
  const b = buildBundleB(a, [agent('macro')], [candidate('AAPL')], {}, req)
  assert.deepEqual(b.company_reports_for, req)
})
```

- [ ] **Step 4: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './prepare.ts'`

- [ ] **Step 5: `src/prepare.ts` 구현**

```ts
import type { AgentOutput, BundleA, BundleB, Candidate, FeatureSet, NewsItem } from './types.ts'

export const DISCLAIMER =
  '이 문서는 공개 데이터를 정리·해석한 리서치 자료이며 투자자문이 아닙니다. ' +
  '작성자는 라이선스를 가진 투자자문업자가 아니며, 어떤 수익도 보장하지 않습니다. ' +
  '투자 판단과 그 결과에 대한 책임은 전적으로 투자자 본인에게 있습니다.'

export function buildBundleA(
  features: FeatureSet,
  indexNews: NewsItem[],
  krNews: NewsItem[],
): BundleA {
  return {
    date: features.date,
    features,
    news: { market: indexNews, korea: krNews },
    agents_to_run: ['macro', 'allocation', 'country_sector', 'technical', 'news'],
    disclaimer: DISCLAIMER,
  }
}

// country_sector agent는 섹터 스탠스를 evidence에 `label: 'sector:<Yahoo섹터명>', value: 'OW'`
// 형태로 남긴다. 스크리너가 자유 서술을 파싱하지 않아도 되게 만든 계약이다.
export function owSectorsFrom(agents: AgentOutput[]): string[] {
  const cs = agents.find((a) => a.agent === 'country_sector')
  if (!cs) return []
  return cs.evidence
    .filter((e) => e.label.startsWith('sector:') && e.value.trim().toUpperCase() === 'OW')
    .map((e) => e.label.slice('sector:'.length).trim())
    .filter((s) => s.length > 0)
}

export function buildBundleB(
  bundleA: BundleA,
  agents: AgentOutput[],
  candidates: Candidate[],
  news: Record<string, NewsItem[]>,
  requested: { ticker: string; market: 'KR' | 'US' }[],
): BundleB {
  return {
    date: bundleA.date,
    features: bundleA.features,
    agents_a: agents,
    candidates,
    candidate_news: news,
    company_reports_for: requested,
    agents_to_run: ['fundamental', 'counter', 'synthesizer', 'company_report'],
    disclaimer: DISCLAIMER,
  }
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 71 + prepare 5 = 76개

- [ ] **Step 7: A단계 CLI**

`src/bin/prepare.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { readLatestSnapshot } from '../db.ts'
import { fetchKrEconomyNews, fetchSymbolNews } from '../sources/news.ts'
import { buildBundleA } from '../prepare.ts'
import type { FeatureSet, NewsItem } from '../types.ts'

try {
  const snap = await readLatestSnapshot('features')
  if (!snap) throw new Error('features 스냅샷이 없습니다. 먼저 `npm run collect`를 실행하세요.')
  const features = snap.payload as FeatureSet

  // 지수 뉴스는 SPY/QQQ, 한국 매크로는 연합뉴스. 실패해도 번들은 만든다.
  const market: NewsItem[] = []
  for (const sym of ['SPY', 'QQQ']) {
    try {
      market.push(...(await fetchSymbolNews(sym, 6)))
    } catch (e) {
      console.error(`뉴스 ${sym} 실패: ${(e as Error).message}`)
    }
  }
  let korea: NewsItem[] = []
  try {
    korea = await fetchKrEconomyNews(15)
  } catch (e) {
    console.error(`연합뉴스 실패: ${(e as Error).message}`)
  }

  const bundle = buildBundleA(features, market, korea)
  await mkdir(`runs/${bundle.date}`, { recursive: true })
  await writeFile(`runs/${bundle.date}/bundle-a.json`, JSON.stringify(bundle, null, 2))
  console.log(
    `A단계 번들: runs/${bundle.date}/bundle-a.json (뉴스 미국 ${market.length}, 한국 ${korea.length}, 결측 ${features.missing.length})`,
  )
  if (features.missing.length > 0) console.log(`스냅샷 결측: ${features.missing.join(', ')}`)
} catch (e) {
  console.error('A단계 준비 실패:', (e as Error).message)
  process.exit(1)
}
```

- [ ] **Step 8: B단계 CLI**

`src/bin/candidates.ts`:

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { readOpenReportRequests, readUniverse } from '../db.ts'
import { fetchDaily, fetchFundamentals } from '../sources/yahoo.ts'
import { fetchSymbolNews } from '../sources/news.ts'
import {
  computeTech, fetchQuotes, filterByLiquidity, rankByMomentum, scoreCandidates,
} from '../screener.ts'
import { buildBundleB, owSectorsFrom } from '../prepare.ts'
import { validateAgentOutput } from '../schema.ts'
import type { BundleA, Fundamentals, NewsItem } from '../types.ts'

const date = process.argv[2]
if (!date) {
  console.error('사용법: npm run candidates -- YYYY-MM-DD')
  process.exit(1)
}

try {
  const bundleA = JSON.parse(await readFile(`runs/${date}/bundle-a.json`, 'utf8')) as BundleA
  const raw = JSON.parse(await readFile(`runs/${date}/agents-a.json`, 'utf8')) as unknown[]
  const agents = raw.map(validateAgentOutput)

  const ow = owSectorsFrom(agents)
  if (ow.length === 0) throw new Error('country_sector agent가 OW 섹터를 하나도 남기지 않았습니다')
  console.log(`OW 섹터: ${ow.join(', ')}`)

  const universe = await readUniverse(ow)
  const quotes = await fetchQuotes(universe.map((u) => u.ticker))
  const liquid = filterByLiquidity(universe, quotes, 0.5)
  const top24 = rankByMomentum(liquid, 24)
  console.log(`유니버스 ${universe.length} → 유동성 ${liquid.length} → 모멘텀 상위 ${top24.length}`)

  // 펀더멘털은 24종목만 부른다. 여기가 호출 수가 늘어나는 유일한 지점이다.
  const funds = new Map<string, Fundamentals>()
  for (const p of top24) {
    try {
      funds.set(p.row.ticker, await fetchFundamentals(p.row.ticker))
    } catch (e) {
      console.error(`펀더멘털 ${p.row.ticker} 실패: ${(e as Error).message}`)
    }
  }

  const candidates = scoreCandidates(top24, funds, 12)

  // 확정된 12종목만 일봉을 받아 기술적 지표를 코드가 계산한다.
  for (const c of candidates) {
    try {
      c.tech = computeTech(await fetchDaily(c.ticker))
    } catch (e) {
      console.error(`일봉 ${c.ticker} 실패: ${(e as Error).message}`)
    }
  }

  const news: Record<string, NewsItem[]> = {}
  for (const c of candidates) {
    try {
      news[c.ticker] = await fetchSymbolNews(c.ticker, 5)
    } catch (e) {
      console.error(`뉴스 ${c.ticker} 실패: ${(e as Error).message}`)
      news[c.ticker] = []
    }
  }

  const requested = (await readOpenReportRequests(5)).map((r) => ({ ticker: r.ticker, market: r.market }))
  const bundle = buildBundleB(bundleA, agents, candidates, news, requested)
  await writeFile(`runs/${date}/bundle-b.json`, JSON.stringify(bundle, null, 2))
  console.log(
    `B단계 번들: runs/${date}/bundle-b.json (후보 ${candidates.length}, 요청 리포트 ${requested.length})`,
  )
} catch (e) {
  console.error('후보 선정 실패:', (e as Error).message)
  process.exit(1)
}
```

- [ ] **Step 9: 스크립트와 gitignore**

`package.json`의 `scripts`에 추가:

```json
    "prepare:bundle": "node --env-file=.env src/bin/prepare.ts",
    "candidates": "node --env-file=.env src/bin/candidates.ts",
```

`prepare`가 아니라 `prepare:bundle`인 이유: npm은 `prepare`를 라이프사이클 훅으로 취급해
`npm install` 때마다 실행해 버린다.

`.gitignore`에 한 줄 추가:

```
runs/
```

- [ ] **Step 10: A단계 실행 확인**

```bash
npm run prepare:bundle
```

Expected: `A단계 번들: runs/<날짜>/bundle-a.json (뉴스 미국 12, 한국 15, 결측 0)`.
`features 스냅샷이 없습니다`가 나오면 P1의 `npm run collect`를 먼저 돌려야 한다.

```bash
node -e "const b=require('./runs/'+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})+'/bundle-a.json');console.log(Object.keys(b),'assets',Object.keys(b.features.assets).length,'bytes',JSON.stringify(b).length)"
```

Expected: 키 5개, 자산 23개 내외, 크기 15KB 이하. 크기가 100KB를 넘으면 LLM 입력으로 과하니 보고한다.

- [ ] **Step 11: 타입체크 + 커밋**

```bash
npm run typecheck
```

```bash
git add src/types.ts src/prepare.ts src/prepare.test.ts src/bin/prepare.ts src/bin/candidates.ts src/db.ts package.json .gitignore
git commit -m "feat: add A/B stage bundle builders and candidate screening CLI"
```

---

