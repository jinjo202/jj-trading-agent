import type { PositioningRow } from '@/lib/types'

/** 전월 대비 이동 마커. 방향을 색과 기호 둘 다로 표시한다(색만으로 구분되지 않게). */
function ChangeMark({ change }: { change: PositioningRow['change'] }) {
  if (change === 'up') return <span className="text-emerald-600" title="전월 대비 확대">▲</span>
  if (change === 'down') return <span className="text-rose-600" title="전월 대비 축소">▼</span>
  if (change === 'new') return <span className="text-neutral-400" title="지난달에 없던 항목">신규</span>
  return <span className="text-neutral-300 dark:text-neutral-600" title="변화 없음">–</span>
}

/**
 * Under ← 중립 → Over 3칸 트랙 위에 현재 스탠스를 찍는다.
 * 숫자만 보면 "많다/적다"가 안 읽히므로 위치로 보여주는 것이 이 막대의 목적이다.
 */
function StanceTrack({ stance }: { stance: PositioningRow['stance'] }) {
  const cells: PositioningRow['stance'][] = ['UW', 'N', 'OW']
  const color =
    stance === 'OW' ? 'bg-emerald-600' : stance === 'UW' ? 'bg-rose-600' : 'bg-neutral-500'
  return (
    <div className="flex items-center gap-0.5" aria-label={`스탠스 ${stance}`}>
      {cells.map((c) => (
        <div key={c} className="h-2 w-5 rounded-sm bg-neutral-200 dark:bg-neutral-800">
          {c === stance ? <div className={`h-full w-full rounded-sm ${color}`} /> : null}
        </div>
      ))}
    </div>
  )
}

export function PositioningTable({ rows }: { rows: PositioningRow[] }) {
  const groups = [...new Set(rows.map((r) => r.group))]
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group}>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">{group}</h3>
          <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-[10px] uppercase tracking-wide text-neutral-400 dark:border-neutral-800">
                  <th className="px-3 py-2 text-left font-medium">항목</th>
                  <th className="px-3 py-2 text-left font-medium">비중↓ 중립 확대↑</th>
                  <th className="px-3 py-2 text-right font-medium tabular-nums">비중</th>
                  <th className="px-3 py-2 text-right font-medium tabular-nums">직전</th>
                  <th className="px-3 py-2 text-center font-medium">변화</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.group === group)
                  .map((r) => (
                    <tr key={`${r.group}-${r.name}`} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
                      <td className="px-3 py-2">
                        <div>{r.name}</div>
                        {r.rationale && (
                          <div className="mt-0.5 max-w-md text-xs text-neutral-500">{r.rationale}</div>
                        )}
                      </td>
                      <td className="px-3 py-2"><StanceTrack stance={r.stance} /></td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{r.weight_pct}%</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-400">
                        {r.prev_weight_pct === null ? '–' : `${r.prev_weight_pct}%`}
                      </td>
                      <td className="px-3 py-2 text-center text-xs"><ChangeMark change={r.change} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
