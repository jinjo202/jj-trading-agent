import { getLatestPublishedVerdict } from '@/lib/queries'
import { equityWeightLabel, signalLabel } from '@/lib/format'
import { ScoreGauge } from '@/components/ScoreGauge'
import { DriverCard } from '@/components/DriverCard'
import { StanceGrid } from '@/components/StanceGrid'

export const revalidate = 3600

export default async function HomePage() {
  const latest = await getLatestPublishedVerdict()

  if (!latest) {
    return (
      <div className="py-12 text-center text-neutral-500">
        아직 공개된 결론이 없습니다. 첫 <code>/daily</code> 실행과 발행을 기다리는 중입니다.
      </div>
    )
  }

  const { date, verdict } = latest
  const signal = signalLabel(verdict.signal)

  return (
    <div className="flex flex-col gap-6">
      <header className="text-center">
        <p className="text-sm text-neutral-500">{date} 기준</p>
        <span className={`mt-1 inline-block rounded-full px-3 py-1 text-sm font-medium ${signal.className}`}>
          {signal.text}
        </span>
      </header>

      <div className="flex justify-center">
        <ScoreGauge score={verdict.equity_score} />
      </div>

      <div className="text-center">
        <p className="text-sm text-neutral-500">권장 주식비중</p>
        <p className="text-xl font-semibold">{equityWeightLabel(verdict.suggested_equity_weight)}</p>
        <p className="text-xs text-neutral-400">확신도: {verdict.conviction}</p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">왜 이렇게 판단했나</h2>
        <div className="flex flex-col gap-2">
          {verdict.drivers.map((d, i) => (
            <DriverCard key={i} driver={d} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
        <h2 className="mb-1 font-medium text-amber-800 dark:text-amber-300">반대 의견</h2>
        <p className="text-amber-900 dark:text-amber-200">{verdict.counter_case}</p>
      </section>

      <StanceGrid
        title="국가"
        items={verdict.countries.map((c) => ({ label: c.code, stance: c.stance, sub: c.rationale }))}
      />
      <StanceGrid
        title="섹터"
        items={verdict.sectors.map((s) => ({ label: s.name, stance: s.stance, sub: s.etf }))}
      />

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">종목</h2>
        <div className="flex flex-col gap-2">
          {verdict.picks.map((p) => (
            <a
              key={p.ticker}
              href={`/stock/${p.market}/${p.ticker}`}
              className="block rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
            >
              <div className="flex items-center justify-between text-sm font-medium">
                <span>{p.name} ({p.ticker})</span>
                <span className="text-neutral-400">{p.sector}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{p.thesis}</p>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">이 논리가 깨지는 조건</h2>
        <ul className="list-inside list-disc text-sm text-neutral-600 dark:text-neutral-400">
          {verdict.invalidation.map((inv, i) => (
            <li key={i}>{inv}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
