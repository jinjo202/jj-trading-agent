import { holdingAmountLabel } from '@/lib/format'
import { lastTwoQuartersYoy } from '@/lib/holdings'
import type { SectorHolding, SectorHoldings } from '@/lib/types'

const INCOME_BASIS_LABEL = { operatingIncome: '영업이익', pretaxIncome: '세전이익' } as const

function yoyBadge(pct: number | null) {
  if (pct === null) return <span className="text-neutral-400">–</span>
  const up = pct >= 0
  return (
    <span className={up ? 'text-emerald-600' : 'text-rose-600'}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function fmtAmount(v: number | null, currency: string | null) {
  return v === null ? '–' : holdingAmountLabel(v, currency)
}

function HoldingRow({ h }: { h: SectorHolding }) {
  const quarters = lastTwoQuartersYoy(h.quarterly)
  const basisLabel = h.incomeBasis ? INCOME_BASIS_LABEL[h.incomeBasis] : '이익'

  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-medium">
          {h.name} <code className="text-[11px] font-normal text-neutral-400">{h.ticker}</code>
        </span>
        {h.weightPct !== null && (
          <span className="text-sm font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">
            비중 {h.weightPct.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <span className="text-neutral-400">시가총액 </span>
          <span className="tabular-nums">{fmtAmount(h.marketCap, h.currency)}</span>
        </div>
        <div>
          <span className="text-neutral-400">원화환산 </span>
          <span className="tabular-nums">{fmtAmount(h.marketCapKrw, 'KRW')}</span>
        </div>
        <div>
          <span className="text-neutral-400">12mf PER </span>
          <span className="tabular-nums">{h.forwardPe === null ? '–' : h.forwardPe.toFixed(1)}</span>
        </div>
      </div>

      {h.annual.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wide text-neutral-400">
            연간 매출 · {basisLabel} (최근 {h.annual.length}개년)
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            {h.annual.map((a) => (
              <div key={a.period} className="flex justify-between text-xs tabular-nums">
                <span className="text-neutral-400">{a.period.slice(0, 7)}</span>
                <span>
                  매출 {fmtAmount(a.revenue, h.currency)} · {basisLabel}{' '}
                  {fmtAmount(a.operatingIncome, h.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {quarters.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wide text-neutral-400">
            최근 분기 {basisLabel} · 전년 동기 대비(YoY)
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            {quarters.map((q) => (
              <div key={q.period} className="flex justify-between text-xs tabular-nums">
                <span className="text-neutral-400">{q.period.slice(0, 7)}</span>
                <span className="flex items-center gap-2">
                  {fmtAmount(q.operatingIncome, h.currency)}
                  {q.priorPeriod && (
                    <span className="text-neutral-400">(전년 {q.priorPeriod.slice(0, 7)} 대비)</span>
                  )}
                  {yoyBadge(q.yoyPct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {h.incomeBasis === 'pretaxIncome' && (
        <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400">
          이 종목은 영업이익을 별도 보고하지 않아(주로 은행) 세전이익으로 대체했습니다.
        </p>
      )}
    </div>
  )
}

/**
 * 섹터 상위 보유종목 패널. 데이터가 없으면(그날 CIO가 스탠스를 안 낸 섹터) 지어내지 않고
 * 없다고 말한다 — 전 섹터를 매일 수집하지 않기 때문에 생기는 정상적인 공백이다.
 */
export function SectorHoldingsPanel({ data }: { data: SectorHoldings | undefined }) {
  if (!data || data.holdings.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-neutral-400 dark:border-neutral-700">
        이 섹터의 구성종목 데이터가 없습니다 — 오늘 CIO가 스탠스를 낸 섹터만 수집합니다.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-neutral-400">
        {data.asOf} 기준 상위 {data.holdings.length}종목{data.note ? ` · ${data.note}` : ''}
      </p>
      {data.holdings.map((h) => (
        <HoldingRow key={h.ticker} h={h} />
      ))}
    </div>
  )
}
