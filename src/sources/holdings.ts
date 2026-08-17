import YahooFinance from 'yahoo-finance2'
import type { SectorHolding, SectorHoldings } from '../types.ts'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const isKrEtf = (etf: string) => /^\d{6}\.KS$/.test(etf)

/**
 * 한국 ETF 구성종목. **Yahoo에는 없다** — topHoldings가 undefined로 온다(실측).
 * KRX 정보데이터시스템은 세션 쿠키를 붙여도 `LOGOUT`을 돌려줘 무인 실행에 못 쓴다.
 * 네이버 모바일 API가 종목코드·이름·비중을 그대로 준다.
 */
async function krHoldings(etf: string): Promise<{ ticker: string; name: string; weightPct: number | null }[]> {
  const code = etf.replace('.KS', '')
  const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/etfAnalysis`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      Referer: 'https://m.stock.naver.com/',
    },
  })
  if (!res.ok) throw new Error(`네이버 ETF ${code} HTTP ${res.status}`)
  const j = (await res.json()) as {
    etfTop10MajorConstituentAssets?: { itemCode: string; itemName: string; etfWeight: string }[]
  }
  return (j.etfTop10MajorConstituentAssets ?? []).map((h) => ({
    // 네이버는 6자리 코드만 준다. Yahoo 조회를 위해 .KS를 붙인다.
    ticker: `${h.itemCode}.KS`,
    name: h.itemName,
    weightPct: Number.parseFloat(h.etfWeight) || null,
  }))
}

async function usEuHoldings(etf: string) {
  const s = await yf.quoteSummary(etf, { modules: ['topHoldings'] })
  return (s.topHoldings?.holdings ?? []).map((h) => ({
    ticker: String(h.symbol),
    name: String(h.holdingName ?? h.symbol),
    weightPct: h.holdingPercent == null ? null : Math.round(h.holdingPercent * 10000) / 100,
  }))
}

/**
 * 통화별 원화 환율. GBp(펜스)는 100으로 나눠야 파운드가 된다 —
 * 런던 상장주는 펜스로 호가돼서, 이걸 놓치면 시총이 100배가 된다.
 */
export async function fetchKrwRates(): Promise<Record<string, number>> {
  const q = async (sym: string): Promise<number | null> => {
    try {
      const c = await yf.chart(sym, { period1: new Date(Date.now() - 10 * 86400000), interval: '1d' })
      return c.quotes.filter((x) => x.close !== null).at(-1)?.close ?? null
    } catch {
      return null
    }
  }
  const usdkrw = await q('KRW=X')
  const eurusd = await q('EURUSD=X')
  const gbpusd = await q('GBPUSD=X')
  const usdjpy = await q('JPY=X')
  const rates: Record<string, number> = { KRW: 1 }
  if (usdkrw) {
    rates.USD = usdkrw
    if (eurusd) rates.EUR = eurusd * usdkrw
    if (gbpusd) {
      rates.GBP = gbpusd * usdkrw
      rates.GBp = (gbpusd * usdkrw) / 100
    }
    if (usdjpy) rates.JPY = usdkrw / usdjpy
  }
  return rates
}

/** fundamentalsTimeSeries의 `date`는 문자열이 아니라 Date다. String()으로 찍으면 "Sun Dec 31"이 된다. */
const isoDay = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)

/** 손익 시계열 한 줄. 은행은 operatingIncome이 없어 pretaxIncome으로 대체한다. */
function incomeRows(rows: Record<string, unknown>[], n: number) {
  const pick = (r: Record<string, unknown>) => ({
    period: isoDay(r.date),
    revenue: num(r.totalRevenue),
    operating: num(r.operatingIncome),
    pretax: num(r.pretaxIncome),
  })
  const all = rows.map(pick).filter((r) => r.revenue !== null || r.operating !== null || r.pretax !== null)
  const useOperating = all.some((r) => r.operating !== null)
  return {
    basis: (all.length === 0 ? null : useOperating ? 'operatingIncome' : 'pretaxIncome') as
      SectorHolding['incomeBasis'],
    rows: all.slice(-n).map((r) => ({
      period: r.period,
      revenue: r.revenue,
      operatingIncome: useOperating ? r.operating : r.pretax,
    })),
  }
}

async function enrich(
  h: { ticker: string; name: string; weightPct: number | null },
  rates: Record<string, number>,
): Promise<SectorHolding> {
  const base: SectorHolding = {
    ...h, currency: null, marketCap: null, marketCapKrw: null, forwardPe: null,
    annual: [], quarterly: [], incomeBasis: null,
  }
  try {
    const s = await yf.quoteSummary(h.ticker, { modules: ['price', 'defaultKeyStatistics'] })
    base.currency = s.price?.currency ?? null
    base.marketCap = num(s.price?.marketCap)
    base.forwardPe = num(s.defaultKeyStatistics?.forwardPE)
    if (!h.name || h.name === h.ticker) base.name = s.price?.longName ?? s.price?.shortName ?? h.name

    /**
     * 런던 상장주는 **펜스(GBp)로 호가**되는데 시가총액만 파운드 단위로 온다(실측).
     * 즉 단위가 필드마다 다르다:
     * - marketCap: 파운드 → GBP 환율을 쓴다(100으로 나누면 안 된다)
     * - forwardPE: 주가가 펜스라 100배로 부풀어 있다 → 100으로 나눈다
     * HSBA.L이 fPER 800.67로 나왔고 ÷100 = 8.01로 은행에 맞는 값이 된다.
     */
    const pence = base.currency === 'GBp'
    if (pence && base.forwardPe !== null) base.forwardPe = base.forwardPe / 100
    const rate = base.currency ? rates[pence ? 'GBP' : base.currency] : undefined
    if (base.marketCap !== null && rate) base.marketCapKrw = Math.round(base.marketCap * rate)
  } catch (e) {
    console.error(`  보유종목 시세 실패 ${h.ticker}: ${(e as Error).message.slice(0, 80)}`)
  }
  try {
    // incomeStatementHistory는 2024-11 이후 사실상 비어 있다(Yahoo 공지). 이 API를 써야 한다.
    const opts = { period1: '2021-01-01', module: 'financials' } as const
    const [a, q] = await Promise.all([
      yf.fundamentalsTimeSeries(h.ticker, { ...opts, type: 'annual' }),
      yf.fundamentalsTimeSeries(h.ticker, { ...opts, type: 'quarterly' }),
    ])
    const annual = incomeRows(a as Record<string, unknown>[], 3)
    // 최근 두 분기와 그 전년 동기를 비교하려면 최소 6분기가 필요하다.
    const quarterly = incomeRows(q as Record<string, unknown>[], 6)
    base.annual = annual.rows
    base.quarterly = quarterly.rows
    base.incomeBasis = annual.basis ?? quarterly.basis
  } catch (e) {
    console.error(`  보유종목 재무 실패 ${h.ticker}: ${(e as Error).message.slice(0, 80)}`)
  }
  return base
}

/**
 * 섹터 ETF의 상위 보유종목과 그 재무. **CIO가 스탠스를 낸 섹터만** 받는다 —
 * 전 섹터(31개)를 매일 긁으면 종목당 3회 호출로 600회가 넘어 rate limit 위험이 크고,
 * 보지도 않을 섹터를 받을 이유가 없다.
 */
export async function collectSectorHoldings(
  etfs: string[],
  topN = 10,
): Promise<Record<string, SectorHoldings>> {
  const rates = await fetchKrwRates()
  const out: Record<string, SectorHoldings> = {}
  const asOf = new Date().toISOString().slice(0, 10)

  for (const etf of etfs) {
    try {
      const raw = isKrEtf(etf) ? await krHoldings(etf) : await usEuHoldings(etf)
      if (raw.length === 0) {
        console.error(`보유종목 없음 ${etf}`)
        continue
      }
      const holdings: SectorHolding[] = []
      for (const h of raw.slice(0, topN)) holdings.push(await enrich(h, rates))
      out[etf] = {
        etf,
        asOf,
        holdings,
        note: isKrEtf(etf) ? '구성종목은 네이버 기준 상위 10종목입니다.' : null,
      }
      console.log(`  보유종목 ${etf}: ${holdings.length}종목`)
    } catch (e) {
      console.error(`보유종목 수집 실패 ${etf}: ${(e as Error).message.slice(0, 100)}`)
    }
  }
  return out
}
