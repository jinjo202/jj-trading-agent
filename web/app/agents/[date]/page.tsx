import { notFound } from 'next/navigation'
import { getAgentReports, isPublished } from '@/lib/queries'

export const revalidate = 3600

export default async function AgentsPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const published = await isPublished(date)

  if (!published) {
    return (
      <div className="py-12 text-center text-neutral-500">
        {date}의 결론은 아직 공개되지 않았습니다.
      </div>
    )
  }

  const reports = await getAgentReports(date)
  if (reports.length === 0) notFound()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">{date} agent 리포트</h1>
      {reports.map(({ agent, output }) => (
        <div key={agent} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{agent}</h2>
            <span className="text-sm text-neutral-400">
              점수 {output.score} · 신뢰도 {(output.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <p className="mt-2 text-sm font-medium">{output.headline}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{output.reasoning}</p>
          <div className="mt-3 flex flex-col gap-1">
            {output.evidence.map((e, i) => (
              <div key={i} className="text-xs text-neutral-500">
                <span className="font-medium">{e.label}</span>: {e.value}{' '}
                <span className="text-neutral-400">({e.source})</span>
              </div>
            ))}
          </div>
          {output.flags.length > 0 && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              주의: {output.flags.join(', ')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
