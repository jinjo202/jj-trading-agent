import { scoreGaugeColor } from '@/lib/format'
import { RichText } from '@/components/RichText'
import { EvidenceChart } from '@/components/EvidenceChart'
import type { AgentOutput, DailyVerdict } from '@/lib/types'
import type { ChartData } from '@/lib/queries'

/**
 * 0-100 점수를 눈금 있는 막대로 보여준다. 50이 중립이라는 것이 이 지표의 핵심이므로
 * 가운데 눈금을 항상 그린다 — 숫자만 있으면 62가 강세인지 약세인지 읽히지 않는다.
 */
function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div>
      <div className="relative h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className="absolute left-1/2 top-0 h-full w-px bg-neutral-400 dark:bg-neutral-600" />
        <div
          className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded"
          style={{ left: `${pct}%`, background: scoreGaugeColor(score) }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
        <span>0 약세</span>
        <span>50 중립</span>
        <span>100 강세</span>
      </div>
    </div>
  )
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.max(0, Math.min(1, confidence)) * 100
  return (
    <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
      <div className="h-full rounded-full bg-neutral-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * driver 카드는 판단의 요약이고, 그 근거(agent 원문)는 접어 둔다.
 * <details>를 쓰면 클릭 토글에 클라이언트 JS가 필요 없다.
 * output이 없는 경우(해당 agent 리포트를 못 찾음)는 접히는 UI 없이 요약만 보여준다 —
 * 열었더니 비어 있는 것보다 열 수 없는 편이 정직하다.
 */
export function DriverCard({
  driver,
  output,
  priceHistory,
  chartData,
}: {
  driver: DailyVerdict['drivers'][number]
  output?: AgentOutput
  priceHistory: Record<string, { date: string; close: number }[]>
  chartData: ChartData
}) {
  const sign = driver.direction === '+' ? 'text-emerald-600' : 'text-rose-600'

  const summary = (
    <>
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{driver.agent}</span>
        <span className={sign}>{driver.direction} ({(driver.weight * 100).toFixed(0)}%)</span>
      </div>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400"><RichText text={driver.point} /></p>
    </>
  )

  if (!output) {
    return <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">{summary}</div>
  }

  return (
    <details className="group rounded-lg border border-neutral-200 dark:border-neutral-800">
      <summary className="cursor-pointer list-none p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800">
        {summary}
        <span className="mt-2 inline-block text-xs text-emerald-600">
          <span className="group-open:hidden">근거 자세히 보기 ▾</span>
          <span className="hidden group-open:inline">접기 ▴</span>
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-neutral-200 p-3 dark:border-neutral-800">
        <p className="text-sm font-medium"><RichText text={output.headline} /></p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 flex justify-between text-xs text-neutral-400">
              <span>agent 점수</span>
              <span className="font-medium text-neutral-600 dark:text-neutral-300">{output.score}</span>
            </div>
            <ScoreBar score={output.score} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-neutral-400">
              <span>신뢰도</span>
              <span className="font-medium text-neutral-600 dark:text-neutral-300">
                {(output.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <ConfidenceBar confidence={output.confidence} />
          </div>
        </div>

        <p className="text-sm text-neutral-600 dark:text-neutral-400"><RichText text={output.reasoning} /></p>

        <div>
          <h3 className="mb-1 text-xs font-medium text-neutral-500">근거 데이터</h3>
          <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
            {output.evidence.map((e, i) => (
              <div key={i} className="py-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-sm">{e.label}</span>
                  <span className="text-sm font-medium">{e.value}</span>
                  <code className="w-full text-[10px] text-neutral-400">{e.source}</code>
                </div>
                <EvidenceChart source={e.source} value={e.value} priceHistory={priceHistory} chartData={chartData} />
              </div>
            ))}
          </div>
        </div>

        {output.flags.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-medium text-neutral-500">이 판단의 한계</h3>
            <ul className="list-inside list-disc text-xs text-amber-600 dark:text-amber-400">
              {output.flags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}
