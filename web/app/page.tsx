import { getAgentReports, getLatestPublishedVerdict } from '@/lib/queries'
import { bandLabel, dmEmLabel, equityWeightLabel, signalLabel } from '@/lib/format'
import { ScoreGauge } from '@/components/ScoreGauge'
import { DriverCard } from '@/components/DriverCard'
import { StanceGrid } from '@/components/StanceGrid'
import { MarketCard } from '@/components/MarketCard'
import { TradeList } from '@/components/TradeList'

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

  // driver는 판단의 요약만 담는다. 펼쳤을 때 보여줄 근거 원문은 agent_reports에 있으므로
  // agent 이름으로 이어 붙인다. 못 찾은 driver는 요약만 렌더된다(DriverCard가 처리).
  const outputs = new Map((await getAgentReports(date)).map((r) => [r.agent, r.output]))

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
        {verdict.regime && (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{verdict.regime}</p>
        )}
        {verdict.horizon && <p className="text-xs text-neutral-400">{verdict.horizon}</p>}
      </div>

      {verdict.asset_allocation && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-neutral-500">자산배분</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([
              ['주식', verdict.asset_allocation.equity],
              ['채권', verdict.asset_allocation.bond],
              ['현금', verdict.asset_allocation.cash],
            ] as const).map(([label, band]) => (
              <div key={label} className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
                <div className="text-xs text-neutral-400">{label}</div>
                <div className="font-semibold">{bandLabel(band)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {verdict.asset_allocation.rationale}
          </p>
        </section>
      )}

      {verdict.dm_vs_em && (
        <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>선진국 vs 신흥국</span>
            <span className="text-emerald-600">{dmEmLabel(verdict.dm_vs_em.preference)}</span>
          </div>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {verdict.dm_vs_em.rationale}
          </p>
        </section>
      )}

      {verdict.markets && verdict.markets.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium text-neutral-500">시장별 판단</h2>
          <p className="mb-2 text-xs text-neutral-400">
            비중은 주식 슬리브 안에서의 배분입니다. 시장을 누르면 애널리스트 6인의 코멘트가 열립니다.
          </p>
          <div className="flex flex-col gap-2">
            {verdict.markets.map((m) => (
              <MarketCard key={m.code} view={m} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">왜 이렇게 판단했나</h2>
        <div className="flex flex-col gap-2">
          {verdict.drivers.map((d, i) => (
            <DriverCard key={i} driver={d} output={outputs.get(d.agent)} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
        <h2 className="mb-1 font-medium text-amber-800 dark:text-amber-300">반대 의견</h2>
        <p className="text-amber-900 dark:text-amber-200">{verdict.counter_case}</p>
      </section>

      {/* markets(5개 시장)가 있으면 국가 그리드는 중복이므로 접는다. 과거 행에는 markets가 없다. */}
      {!verdict.markets && (
        <StanceGrid
          title="국가"
          items={verdict.countries.map((c) => ({ label: c.code, stance: c.stance, sub: c.rationale }))}
        />
      )}
      <StanceGrid
        title="섹터"
        items={verdict.sectors.map((s) => ({
          label: s.region && s.region !== 'GLOBAL' ? `${s.region} ${s.name}` : s.name,
          stance: s.stance,
          sub: s.etf,
        }))}
      />

      {verdict.trades && verdict.trades.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium text-neutral-500">실행</h2>
          <p className="mb-1 text-xs text-neutral-400">
            위 판단을 티커로 옮긴 것입니다. 주문 지시가 아닙니다.
          </p>
          <TradeList trades={verdict.trades} />
        </section>
      )}

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
