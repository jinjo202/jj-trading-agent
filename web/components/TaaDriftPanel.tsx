import { computeDrift } from '@/lib/drift'
import type { DailyVerdict, MonthlyReport } from '@/lib/types'

/**
 * 확정 TAA(월간) 대비 오늘의 이탈. 일간 판단을 "새 배분"이 아니라 "관측"으로 읽게 만드는 패널이다.
 * 이탈이 문턱을 넘은 줄만 강조해서, 매일 바뀌는 표현과 실제로 재검토가 필요한 변화를 구분한다.
 */
export function TaaDriftPanel({
  today,
  standing,
}: {
  today: DailyVerdict
  standing: MonthlyReport
}) {
  const rows = computeDrift(today, standing)
  if (rows.length === 0) return null
  const material = rows.filter((r) => r.material)

  return (
    <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-500">
          확정 배분(TAA) 대비 오늘
        </h2>
        <span className="text-xs text-neutral-400">
          기준 {standing.month} 리포트 · {standing.as_of}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-neutral-400">
        실제 배분은 월 1회 확정합니다. 아래는 오늘 판단이 그 배분에서 얼마나 벗어났는지이며,
        <strong className="text-neutral-500 dark:text-neutral-300"> 강조된 줄만 재검토 대상</strong>입니다.
      </p>

      {material.length === 0 ? (
        <p className="mt-2 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500 dark:bg-neutral-800/50">
          문턱(5%p)을 넘은 이탈이 없습니다 — 확정 배분을 그대로 유지합니다.
        </p>
      ) : (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <strong>{material.length}건</strong>이 문턱을 넘었습니다. 월중이라도 배분 재검토를 권합니다.
        </p>
      )}

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[440px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-400 dark:border-neutral-800">
              <th className="px-2 py-1.5 text-left font-medium">항목</th>
              <th className="px-2 py-1.5 text-right font-medium">확정 TAA</th>
              <th className="px-2 py-1.5 text-right font-medium">오늘</th>
              <th className="px-2 py-1.5 text-right font-medium">이탈</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.area}
                className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800/60 ${
                  r.material ? 'bg-amber-50/60 dark:bg-amber-950/30' : ''
                }`}
              >
                <td className="px-2 py-1.5">
                  {r.material && <span className="mr-1 text-amber-600" aria-label="문턱 초과">●</span>}
                  <span className={r.material ? 'font-medium' : ''}>{r.area}</span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-neutral-400">{r.standing}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.today}</td>
                <td
                  className={`px-2 py-1.5 text-right tabular-nums ${
                    r.material
                      ? 'font-semibold text-amber-700 dark:text-amber-400'
                      : 'text-neutral-400'
                  }`}
                >
                  {r.gapPp === null ? '–' : `${r.gapPp > 0 ? '+' : ''}${r.gapPp}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
