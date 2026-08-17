import { MARKET_NAMES } from '@/lib/types'
import { RichText } from '@/components/RichText'
import type { DailyVerdict } from '@/lib/types'

type Trade = NonNullable<DailyVerdict['trades']>[number]

/** 스탠스를 실제 티커로 옮긴 실행 목록. add는 초록, trim은 붉은색으로 방향이 한눈에 읽히게 한다. */
export function TradeList({ trades }: { trades: Trade[] }) {
  return (
    <div className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-800">
      {trades.map((t, i) => {
        const add = t.action === 'add'
        return (
          <div key={`${t.instrument}-${i}`} className="flex flex-wrap items-baseline gap-x-2 py-2">
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                add
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }`}
            >
              {add ? '비중 확대' : '비중 축소'}
            </span>
            <span className="font-mono text-sm font-medium">{t.instrument}</span>
            <span className="text-xs text-neutral-400">
              {t.market === 'GLOBAL' ? '글로벌' : MARKET_NAMES[t.market]}
            </span>
            <p className="w-full text-sm text-neutral-600 dark:text-neutral-400"><RichText text={t.rationale} /></p>
          </div>
        )
      })}
    </div>
  )
}
