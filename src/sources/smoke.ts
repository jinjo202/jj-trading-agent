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
