import type { DailyVerdict } from '@/lib/types'

export function DriverCard({ driver }: { driver: DailyVerdict['drivers'][number] }) {
  const sign = driver.direction === '+' ? 'text-emerald-600' : 'text-rose-600'
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{driver.agent}</span>
        <span className={sign}>{driver.direction} ({(driver.weight * 100).toFixed(0)}%)</span>
      </div>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{driver.point}</p>
    </div>
  )
}
