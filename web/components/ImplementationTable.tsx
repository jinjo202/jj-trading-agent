import type { ImplementationRow } from '@/lib/types'

/**
 * Neutral / Tactical / Relative 표. Relative는 tactical − neutral이고
 * 이 열 하나가 "중립 대비 얼마나 베팅했나"를 말한다 — 이 표의 존재 이유다.
 */
export function ImplementationTable({
  label,
  rows,
  neutralNote,
}: {
  label: string
  rows: ImplementationRow[]
  neutralNote?: string
}) {
  const totalTactical = rows.reduce((s, r) => s + r.tactical_pct, 0)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</h3>
        <span className="text-[11px] text-neutral-400">합계 {Math.round(totalTactical)}%</span>
      </div>
      {neutralNote && <p className="mb-1 text-[11px] text-neutral-400">{neutralNote}</p>}
      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-400 dark:border-neutral-800">
              <th className="px-3 py-2 text-left font-medium">자산</th>
              <th className="px-3 py-2 text-right font-medium">SAA</th>
              <th className="px-3 py-2 text-right font-medium">TAA</th>
              <th className="px-3 py-2 text-right font-medium">±</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                <td className="px-3 py-2">
                  {r.name} <code className="text-[11px] text-neutral-400">{r.ticker}</code>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-400">{r.neutral_pct}%</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{r.tactical_pct}%</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.relative_pct > 0
                      ? 'text-emerald-600'
                      : r.relative_pct < 0
                        ? 'text-rose-600'
                        : 'text-neutral-400'
                  }`}
                >
                  {r.relative_pct > 0 ? '+' : ''}
                  {r.relative_pct}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
