import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GICS_TO_YAHOO_SECTOR, SECTOR_BY_ETF, parseKospi200Page, parseSp500Csv, collectCodes } from './universe.ts'

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

const codesFor = (page: number, n: number, variant = 0) =>
  Array.from({ length: n }, (_, i) => `p${page}v${variant}c${i}`)

test('collectCodes: 빈 페이지는 같은 페이지 번호로 재시도한다', async () => {
  const calls: number[] = []
  let page2Attempts = 0
  const fetchPage = async (page: number) => {
    calls.push(page)
    if (page === 1) return codesFor(1, 10)
    if (page === 2) {
      page2Attempts++
      return page2Attempts === 1 ? [] : codesFor(2, 10, 1)
    }
    return [] // page 3+: 두 번 다 빈 페이지 -> 루프 종료
  }
  const result = await collectCodes(fetchPage, { minCodes: 5, retryDelayMs: 0, pageDelayMs: 0 })
  assert.deepEqual(calls.filter((p) => p === 2), [2, 2])
  for (const c of codesFor(2, 10, 1)) assert.ok(result.includes(c))
})

test('collectCodes: 같은 페이지가 연속 두 번 비면 루프를 끝낸다', async () => {
  const calls: number[] = []
  const fetchPage = async (page: number) => {
    calls.push(page)
    return page <= 15 ? codesFor(page, 10) : []
  }
  const result = await collectCodes(fetchPage, { minCodes: 150, retryDelayMs: 0, pageDelayMs: 0 })
  assert.equal(result.length, 150)
  assert.ok(calls.every((p) => p <= 16), `16 이후 페이지가 요청됨: ${calls}`)
})

test('collectCodes: 최소 개수보다 적으면 에러를 던지고 메시지에 개수를 담는다', async () => {
  const fetchPage = async (page: number) => (page === 1 ? codesFor(1, 10) : [])
  await assert.rejects(
    () => collectCodes(fetchPage, { retryDelayMs: 0, pageDelayMs: 0 }),
    /10/,
  )
})

test('collectCodes: maxPages에서 멈추고 그 이상은 요청하지 않는다', async () => {
  let calls = 0
  const fetchPage = async (page: number) => { calls++; return codesFor(page, 10) }
  const result = await collectCodes(fetchPage, { maxPages: 5, minCodes: 5, retryDelayMs: 0, pageDelayMs: 0 })
  assert.equal(result.length, 50)
  assert.equal(calls, 5)
})

test('collectCodes: fetchPage 에러는 삼키지 않고 그대로 전파한다', async () => {
  const fetchPage = async (page: number) => {
    if (page === 2) throw new Error('HTTP 503')
    return codesFor(page, 10)
  }
  await assert.rejects(
    () => collectCodes(fetchPage, { minCodes: 5, retryDelayMs: 0, pageDelayMs: 0 }),
    /HTTP 503/,
  )
})
