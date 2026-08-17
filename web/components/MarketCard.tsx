import { stanceClassName, deskStanceLabel, regionEtf } from '@/lib/format'
import { RichText } from '@/components/RichText'
import { PriceSparkline } from '@/components/PriceSparkline'
import { DESK_NAMES, MARKET_NAMES } from '@/lib/types'
import type { DailyVerdict } from '@/lib/types'

type MarketView = NonNullable<DailyVerdict['markets']>[number]

const CONVICTION_LABEL: Record<MarketView['conviction'], string> = {
  low: '낮음', medium: '보통', high: '높음',
}

/**
 * 시장 하나의 하우스뷰. 스탠스·비중은 접기 전에 보이고,
 * 6개 데스크 코멘트는 <details>로 접어 둔다 — 5개 시장 × 6개 데스크를 한 번에 펼치면
 * 화면이 30개 문단이 되어 "오늘 뭘 할 것인가"가 묻힌다.
 */
export function MarketCard({
  view,
  priceHistory,
}: {
  view: MarketView
  priceHistory: Record<string, { date: string; close: number }[]>
}) {
  const etf = regionEtf(view.code)
  return (
    <details className="group rounded-lg border border-neutral-200 dark:border-neutral-800">
      <summary className="cursor-pointer list-none p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="font-medium">{MARKET_NAMES[view.code]}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs ${stanceClassName(view.stance)}`}>
              {view.stance}
            </span>
          </span>
          <span className="text-sm">
            <span className="font-semibold">{view.weight_pct}%</span>
            <span className="ml-2 text-xs text-neutral-400">확신 {CONVICTION_LABEL[view.conviction]}</span>
          </span>
        </div>

        {/* 주식 슬리브 내 비중을 막대로. 숫자만으로는 시장 간 비중 차이가 안 읽힌다. */}
        <div className="mt-2 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-emerald-600"
            style={{ width: `${Math.min(view.weight_pct, 100)}%` }}
          />
        </div>

        <p className="mt-2 text-sm font-medium"><RichText text={view.headline} /></p>
        <span className="mt-1 inline-block text-xs text-emerald-600">
          <span className="group-open:hidden">애널리스트 6인 코멘트 ▾</span>
          <span className="hidden group-open:inline">접기 ▴</span>
        </span>
      </summary>

      <div className="flex flex-col gap-3 border-t border-neutral-200 p-3 dark:border-neutral-800">
        {etf && <PriceSparkline symbol={etf} points={priceHistory[etf]} />}
        <p className="text-sm text-neutral-600 dark:text-neutral-400"><RichText text={view.rationale} /></p>

        <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <span className="font-medium">핵심 리스크</span> · <RichText text={view.key_risk} />
        </div>

        <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
          {view.desk_reads.map((d) => {
            const s = deskStanceLabel(d.stance)
            return (
              <div key={d.desk} className="py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{DESK_NAMES[d.desk] ?? d.desk}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${s.className}`}>{s.text}</span>
                </div>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400"><RichText text={d.comment} /></p>
              </div>
            )
          })}
        </div>
      </div>
    </details>
  )
}
