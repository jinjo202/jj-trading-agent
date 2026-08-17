import type { SleeveSplit } from '@/lib/types'
import { RichText } from '@/components/RichText'

/**
 * 채권·대체자산 sleeve 내부 배분. weight_pct는 그 sleeve 안에서의 비중이라
 * 합이 100이고, 전체 포트폴리오 비중이 아니다 — 화면에도 그 사실을 적어 둔다.
 * 그러지 않으면 "금 50%"를 자산 전체의 절반으로 읽는다.
 */
export function SleeveSplitList({
  title,
  band,
  rows,
}: {
  title: string
  band?: [number, number]
  rows: SleeveSplit[]
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {band && (
          <span className="text-xs text-neutral-400">
            자산군 비중 {band[0] === band[1] ? `${band[0]}%` : `${band[0]}-${band[1]}%`}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-neutral-400">아래 비중은 이 자산군 안에서의 배분입니다(합 100%)</p>

      <div className="mt-2 flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
        {rows.map((r) => (
          <div key={r.ticker} className="py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm">
                {r.sleeve} <code className="text-[11px] text-neutral-400">{r.ticker}</code>
              </span>
              <span className="text-sm font-semibold tabular-nums">{r.weight_pct}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(r.weight_pct, 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400"><RichText text={r.rationale} /></p>
          </div>
        ))}
      </div>
    </div>
  )
}
