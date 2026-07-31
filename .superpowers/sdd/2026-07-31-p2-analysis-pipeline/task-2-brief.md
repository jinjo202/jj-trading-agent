### Task 2: 유니버스 구축

**Files:**
- Create: `src/universe.ts`
- Test: `src/universe.test.ts`
- Create: `src/bin/universe.ts`
- Modify: `src/db.ts` (유니버스 읽기/쓰기 추가)
- Modify: `package.json` (`universe` 스크립트)

**Interfaces:**
- Consumes: `db.ts`의 `db()`
- Produces:
  - `types.ts`에 `export type UniverseRow = { ticker: string; market: 'KR' | 'US'; name: string; sector: string | null; active: boolean }`
  - `universe.ts`: `GICS_TO_YAHOO_SECTOR: Record<string, string>`, `SECTOR_BY_ETF: Record<string, string>`, `parseSp500Csv(csv: string): UniverseRow[]`, `parseKospi200Page(html: string): string[]`, `buildUniverse(): Promise<UniverseRow[]>`
  - `db.ts`: `upsertUniverse(rows: UniverseRow[]): Promise<void>`, `readUniverse(sectors?: string[]): Promise<UniverseRow[]>`

- [ ] **Step 1: 타입 추가**

`src/types.ts` 끝에:

```ts
export type UniverseRow = {
  ticker: string
  market: 'KR' | 'US'
  name: string
  sector: string | null
  active: boolean
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

두 파서가 이 태스크의 위험 지점이다. CSV는 따옴표 안에 쉼표가 들어 있고(`"Saint Paul, Minnesota"`),
HTML은 같은 종목 코드가 링크 여러 개에 중복 등장한다.

`src/universe.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GICS_TO_YAHOO_SECTOR, SECTOR_BY_ETF, parseKospi200Page, parseSp500Csv } from './universe.ts'

const CSV = `Symbol,Security,GICS Sector,GICS Sub-Industry,Headquarters Location,Date added,CIK,Founded
MMM,3M,Industrials,Industrial Conglomerates,"Saint Paul, Minnesota",1957-03-04,66740,1902
AAPL,Apple Inc.,Information Technology,"Technology Hardware, Storage & Peripherals","Cupertino, California",1982-11-30,320193,1976
BRK.B,Berkshire Hathaway,Financials,Multi-Sector Holdings,"Omaha, Nebraska",1999-02-16,1067983,1839
`

test('parseSp500Csv는 따옴표 안 쉼표에 속지 않는다', () => {
  const rows = parseSp500Csv(CSV)
  assert.equal(rows.length, 3)
  assert.equal(rows[1].ticker, 'AAPL')
  assert.equal(rows[1].name, 'Apple Inc.')
})

test('parseSp500Csv는 GICS 섹터를 Yahoo 어휘로 바꾼다', () => {
  const rows = parseSp500Csv(CSV)
  assert.equal(rows[1].sector, 'Technology')        // Information Technology
  assert.equal(rows[2].sector, 'Financial Services') // Financials
  assert.equal(rows[0].sector, 'Industrials')        // 그대로인 것도 있다
})

test('parseSp500Csv는 Yahoo 티커 표기로 정규화한다', () => {
  // S&P 리스트는 BRK.B, Yahoo는 BRK-B
  assert.equal(parseSp500Csv(CSV)[2].ticker, 'BRK-B')
})

test('parseSp500Csv 결과는 전부 US이고 active', () => {
  for (const r of parseSp500Csv(CSV)) {
    assert.equal(r.market, 'US')
    assert.equal(r.active, true)
  }
})

test('parseKospi200Page는 6자리 코드를 중복 없이 뽑는다', () => {
  const html = `
    <a href="/item/main.naver?code=005930">삼성전자</a>
    <a href="/item/main.naver?code=005930">삼성전자</a>
    <a href="/item/main.naver?code=000660">SK하이닉스</a>
    <a href="/sise/sise_index.naver?code=KPI200">코스피200</a>
  `
  assert.deepEqual(parseKospi200Page(html), ['005930', '000660'])
})

test('GICS 매핑은 11개 섹터를 모두 덮고 ETF 매핑과 같은 어휘를 쓴다', () => {
  const yahooSectors = new Set(Object.values(GICS_TO_YAHOO_SECTOR))
  const etfSectors = new Set(Object.values(SECTOR_BY_ETF))
  assert.equal(etfSectors.size, 11)
  for (const s of etfSectors) {
    assert.ok(yahooSectors.has(s), `ETF 섹터 ${s}가 GICS 매핑 결과에 없다`)
  }
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './universe.ts'`

- [ ] **Step 4: `src/universe.ts` 구현**

```ts
import { fetchFundamentals } from './sources/yahoo.ts'
import type { UniverseRow } from './types.ts'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// 섹터 어휘는 Yahoo `summaryProfile.sector`로 통일한다.
// 한국 종목은 Yahoo가 직접 이 어휘로 주고, 미국은 GICS라서 매핑이 필요하다.
export const GICS_TO_YAHOO_SECTOR: Record<string, string> = {
  'Information Technology': 'Technology',
  'Financials': 'Financial Services',
  'Health Care': 'Healthcare',
  'Consumer Discretionary': 'Consumer Cyclical',
  'Consumer Staples': 'Consumer Defensive',
  'Communication Services': 'Communication Services',
  'Industrials': 'Industrials',
  'Energy': 'Energy',
  'Utilities': 'Utilities',
  'Materials': 'Basic Materials',
  'Real Estate': 'Real Estate',
}

// P1의 SECTOR_ETFS와 같은 11개 ETF. 섹터 ETF 상대모멘텀을 종목 섹터와 잇는 다리.
export const SECTOR_BY_ETF: Record<string, string> = {
  XLK: 'Technology',
  XLF: 'Financial Services',
  XLE: 'Energy',
  XLV: 'Healthcare',
  XLI: 'Industrials',
  XLY: 'Consumer Cyclical',
  XLP: 'Consumer Defensive',
  XLU: 'Utilities',
  XLB: 'Basic Materials',
  XLRE: 'Real Estate',
  XLC: 'Communication Services',
}

// 따옴표로 감싼 필드 안의 쉼표를 존중하는 최소 CSV 분해기.
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ }
      else quoted = !quoted
    } else if (c === ',' && !quoted) {
      out.push(cur); cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

export function parseSp500Csv(csv: string): UniverseRow[] {
  const lines = csv.trim().split(/\r?\n/)
  const header = splitCsvLine(lines[0])
  const iSym = header.indexOf('Symbol')
  const iName = header.indexOf('Security')
  const iSector = header.indexOf('GICS Sector')
  const rows: UniverseRow[] = []
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line)
    const sym = f[iSym]?.trim()
    if (!sym) continue
    rows.push({
      ticker: sym.replace(/\./g, '-'), // BRK.B -> BRK-B (Yahoo 표기)
      market: 'US',
      name: f[iName]?.trim() ?? sym,
      sector: GICS_TO_YAHOO_SECTOR[f[iSector]?.trim()] ?? null,
      active: true,
    })
  }
  return rows
}

export function parseKospi200Page(html: string): string[] {
  const codes = html.match(/code=(\d{6})/g) ?? []
  return [...new Set(codes.map((c) => c.slice(5)))]
}

async function fetchKospi200Codes(): Promise<string[]> {
  const all = new Set<string>()
  // 페이지당 20종목, 200종목이면 10페이지. 11까지 돌아 마지막 페이지 누락을 막는다.
  for (let page = 1; page <= 11; page++) {
    const res = await fetch(
      `https://finance.naver.com/sise/entryJongmok.naver?&page=${page}`,
      { headers: { 'user-agent': BROWSER_UA, referer: 'https://finance.naver.com/' } },
    )
    if (!res.ok) throw new Error(`KOSPI200 page ${page} HTTP ${res.status}`)
    for (const c of parseKospi200Page(await res.text())) all.add(c)
  }
  return [...all]
}

export async function buildUniverse(): Promise<UniverseRow[]> {
  const res = await fetch(
    'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv',
    { headers: { 'user-agent': BROWSER_UA } },
  )
  if (!res.ok) throw new Error(`S&P500 CSV HTTP ${res.status}`)
  const us = parseSp500Csv(await res.text())

  // 한국은 이름·섹터가 없으므로 종목당 quoteSummary를 한 번씩 부른다.
  // 분기 1회 실행이라 200회 순차 호출을 감수한다.
  const kr: UniverseRow[] = []
  for (const code of await fetchKospi200Codes()) {
    const ticker = `${code}.KS`
    try {
      const f = await fetchFundamentals(ticker)
      kr.push({
        ticker,
        market: 'KR',
        name: f.name ?? code,
        sector: f.sector,
        active: true,
      })
    } catch (e) {
      console.error(`유니버스 ${ticker} 조회 실패: ${(e as Error).message}`)
    }
  }
  return [...us, ...kr]
}
```

- [ ] **Step 5: `src/db.ts`에 유니버스 접근 추가**

기존 export는 그대로 두고 아래를 덧붙인다:

```ts
import type { UniverseRow } from './types.ts'

export async function upsertUniverse(rows: UniverseRow[]): Promise<void> {
  // Supabase는 한 번에 큰 배열도 받지만 500행씩 끊어 타임아웃을 피한다.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db()
      .from('universe')
      .upsert(rows.slice(i, i + 500), { onConflict: 'ticker,market' })
    if (error) throw new Error(`universe upsert 실패: ${error.message}`)
  }
}

export async function readUniverse(sectors?: string[]): Promise<UniverseRow[]> {
  let q = db().from('universe').select('ticker,market,name,sector,active').eq('active', true)
  if (sectors && sectors.length > 0) q = q.in('sector', sectors)
  const { data, error } = await q
  if (error) throw new Error(`universe 읽기 실패: ${error.message}`)
  return (data ?? []) as UniverseRow[]
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 30 + 유니버스 6 = 36개

- [ ] **Step 7: CLI 작성**

`src/bin/universe.ts`:

```ts
import { writeFile, mkdir } from 'node:fs/promises'
import { buildUniverse } from '../universe.ts'
import { upsertUniverse } from '../db.ts'

try {
  const rows = await buildUniverse()
  const kr = rows.filter((r) => r.market === 'KR').length
  const noSector = rows.filter((r) => r.sector === null).length
  await mkdir('data', { recursive: true })
  await writeFile('data/universe.json', JSON.stringify(rows, null, 2))
  await upsertUniverse(rows)
  console.log(`유니버스 ${rows.length}종목 (KR ${kr}, US ${rows.length - kr}), 섹터 없음 ${noSector}`)
} catch (e) {
  console.error('유니버스 갱신 실패:', (e as Error).message)
  process.exit(1)
}
```

`package.json`의 `scripts`에 추가:

```json
    "universe": "node --env-file=.env src/bin/universe.ts",
```

- [ ] **Step 8: 실제 유니버스 구축**

```bash
npm run universe
```

Expected: `유니버스 700종목 내외 (KR 200 전후, US 500 전후), 섹터 없음 <20`.
한국 200종목의 순차 조회 때문에 3-6분 걸린다. `섹터 없음`이 50을 넘으면 Yahoo 응답 형태를 확인하고 원인을 보고한다.

- [ ] **Step 9: DB 확인**

Supabase MCP `execute_sql` (project_id `jsxhcqnupvvctnjiaric`):

```sql
select market, count(*) as n, count(sector) as with_sector from universe group by market;
select sector, count(*) from universe group by sector order by 2 desc;
```

Expected: KR/US 두 행. 섹터 목록이 `Technology`, `Financial Services` 등 Yahoo 어휘 11종 안에 들어온다.
`Information Technology` 같은 GICS 원문이 남아 있으면 매핑 누락이므로 고친다.

- [ ] **Step 10: 커밋**

`data/universe.json`은 커밋한다 — 설계서가 "리포지토리의 정적 JSON"으로 두라고 했고, DB가 비어도 재현 가능해야 한다.

```bash
git add src/types.ts src/universe.ts src/universe.test.ts src/bin/universe.ts src/db.ts package.json data/universe.json
git commit -m "feat: build KOSPI200 + S&P500 universe with unified sector vocabulary"
```

---

