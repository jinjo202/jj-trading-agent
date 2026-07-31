import { scoreGaugeColor } from '@/lib/format'

export function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative flex h-28 w-28 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${scoreGaugeColor(score)} ${pct * 3.6}deg, #e5e7eb 0deg)` }}
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-2xl font-semibold dark:bg-neutral-900">
          {score}
        </div>
      </div>
      <span className="text-xs text-neutral-500">주식 비중 점수 (0-100, 50 중립)</span>
    </div>
  )
}
