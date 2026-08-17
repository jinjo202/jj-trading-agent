import { stanceClassName } from '@/lib/format'
import { RichText } from '@/components/RichText'
import { SectorHoldingsPanel } from '@/components/SectorHoldingsPanel'
import type { SectorHoldings } from '@/lib/types'

/**
 * 섹터 하나. 누르면 그 섹터를 어떻게 판단했는지(rationale)와 상위 보유종목이 펼쳐진다.
 * <details>라 펼침에 클라이언트 JS가 필요 없다 — 이 앱의 다른 펼침 카드(DriverCard,
 * MarketCard)와 같은 패턴이다.
 */
export function SectorCard({
  label,
  stance,
  etf,
  rationale,
  holdings,
}: {
  label: string
  stance: 'OW' | 'N' | 'UW'
  etf: string
  rationale: string
  holdings: SectorHoldings | undefined
}) {
  return (
    <details className="group overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
      <summary className={`cursor-pointer list-none p-2 text-sm ${stanceClassName(stance)}`}>
        <div className="font-medium">{label}</div>
        <div className="flex items-center justify-between text-xs opacity-80">
          <span>
            {stance} · {etf}
          </span>
          <span className="text-[10px]">
            <span className="group-open:hidden">종목 보기 ▾</span>
            <span className="hidden group-open:inline">접기 ▴</span>
          </span>
        </div>
      </summary>
      <div className="flex flex-col gap-2 border-t border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
        {rationale && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            <RichText text={rationale} />
          </p>
        )}
        <SectorHoldingsPanel data={holdings} />
      </div>
    </details>
  )
}
