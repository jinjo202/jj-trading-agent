import { getVerdictHistory, historyPoint } from '@/lib/queries'
import { signalLabel } from '@/lib/format'
import { ScoreTrendChart } from './ScoreTrendChart'

export const revalidate = 3600

export default async function HistoryPage() {
  const rows = await getVerdictHistory(90)

  if (rows.length === 0) {
    return <div className="py-12 text-center text-neutral-500">아직 발행된 결론이 없습니다.</div>
  }

  const points = rows.map(historyPoint)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">점수 추이</h1>
      <ScoreTrendChart points={points} />

      <div className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map(({ date, verdict }) => {
          const signal = signalLabel(verdict.signal)
          return (
            <a
              key={date}
              href={`/agents/${date}`}
              className="flex items-center justify-between py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <span>{date}</span>
              <span className="text-neutral-400">{verdict.equity_score}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${signal.className}`}>{signal.text}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
