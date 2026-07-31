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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 페이지 조회 루프를 네트워크에서 분리해 테스트 가능하게 한다.
// 빈 페이지는 rate-limit/차단 페이지일 수 있어 다음 페이지로 넘어가는 대신
// 같은 페이지를 한 번 더 조회해 진짜로 끝인지 확인한다.
export async function collectCodes(
  fetchPage: (page: number) => Promise<string[]>,
  { maxPages = 30, minCodes = 150, retryDelayMs = 1000, pageDelayMs = 300 }: {
    maxPages?: number
    minCodes?: number
    retryDelayMs?: number
    pageDelayMs?: number
  } = {},
): Promise<string[]> {
  const all = new Set<string>()
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await sleep(pageDelayMs) // 연속 스크래핑처럼 보이지 않게 페이지 사이 지연
    let codes = await fetchPage(page)
    if (codes.length === 0) {
      await sleep(retryDelayMs)
      codes = await fetchPage(page) // 같은 페이지 재시도 (page + 1 아님)
      if (codes.length === 0) break
    }
    for (const c of codes) all.add(c)
  }
  if (all.size < minCodes) {
    throw new Error(`코드 ${all.size}개만 수집됨 (최소 ${minCodes}개 필요) — 응답 확인 필요`)
  }
  return [...all]
}

async function fetchKospi200Codes(): Promise<string[]> {
  // 실측(2026-07-31): 페이지당 10종목 → 20페이지. 안전상 30페이지에서 강제 종료(collectCodes 기본값).
  return collectCodes(async (page) => {
    const res = await fetch(
      `https://finance.naver.com/sise/entryJongmok.naver?&page=${page}`,
      { headers: { 'user-agent': BROWSER_UA, referer: 'https://finance.naver.com/' } },
    )
    if (!res.ok) throw new Error(`KOSPI200 page ${page} HTTP ${res.status}`)
    return parseKospi200Page(await res.text())
  })
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
