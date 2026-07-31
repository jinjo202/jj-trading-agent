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
      volume: q.volume ?? 0,
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

