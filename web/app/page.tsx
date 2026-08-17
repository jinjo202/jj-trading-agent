import {
  getAgentReports, getLatestMonthlyReport, getLatestPublishedVerdict, getChartData,
  getPriceHistory, getSectorHoldings,
} from '@/lib/queries'
import { TaaDriftPanel } from '@/components/TaaDriftPanel'
import {
  bandLabel, convictionLabel, dmEmLabel, durationLabel, equityWeightLabel,
  fxDirectionLabel, signalLabel,
} from '@/lib/format'
import { RichText } from '@/components/RichText'
import { CorrelationMatrix } from '@/components/CorrelationMatrix'
import { PriceSparkline } from '@/components/PriceSparkline'
import { SleeveSplitList } from '@/components/SleeveSplitList'
import { ScoreGauge } from '@/components/ScoreGauge'
import { DriverCard } from '@/components/DriverCard'
import { StanceGrid } from '@/components/StanceGrid'
import { MarketCard } from '@/components/MarketCard'
import { SectorCard } from '@/components/SectorCard'
import { TradeList } from '@/components/TradeList'

/**
 * 캐시하지 않는다. 이 페이지의 존재 이유가 "오늘의 판단"인데
 * ISR(revalidate=3600)은 발행 직후 최대 한 시간 동안 어제 것을 보여준다 —
 * 실제로 파이프라인이 07:20에 발행해도 화면은 어제 날짜였다.
 * 개인 대시보드라 트래픽이 적어 매 요청 조회의 비용은 무시할 수 있다.
 */
export const dynamic = 'force-dynamic'

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
  const [agentReports, priceHistory, standing, chartData, sectorHoldings] = await Promise.all([
    getAgentReports(date), getPriceHistory(), getLatestMonthlyReport(), getChartData(),
    getSectorHoldings(),
  ])
  const outputs = new Map(agentReports.map((r) => [r.agent, r.output]))

  return (
    <div className="flex flex-col gap-6">
      {/*
        결론 한 덩어리. 신호·점수·비중·확신도가 흩어져 있으면 "그래서 오늘 뭐라는 건데"에
        답하려고 세 번 스크롤해야 한다. 한 카드에 모으고 나머지는 근거로 밀어낸다.
      */}
      <section className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-neutral-500">{date} 기준</p>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${signal.className}`}>
            {signal.text}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-4">
          <ScoreGauge score={verdict.equity_score} />
          <div className="flex flex-1 flex-wrap gap-x-8 gap-y-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-400">권장 주식비중</div>
              <div className="text-2xl font-semibold tabular-nums">
                {equityWeightLabel(verdict.suggested_equity_weight)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-400">확신도</div>
              <div className="text-2xl font-semibold">{convictionLabel(verdict.conviction)}</div>
            </div>
            {verdict.horizon && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-neutral-400">시야</div>
                <div className="text-2xl font-semibold">{verdict.horizon}</div>
              </div>
            )}
          </div>
        </div>

        {verdict.regime && (
          <p className="mt-3 border-t border-neutral-200 pt-3 text-sm leading-relaxed text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
            <RichText text={verdict.regime} />
          </p>
        )}
      </section>

      {/* 확정 배분(월간 TAA) 대비 오늘의 이탈. 일간을 관측으로 읽게 하는 자리다. */}
      {standing && <TaaDriftPanel today={verdict} standing={standing} />}

      {verdict.asset_allocation && (
        <section>
          <h2 className="mb-1 text-base font-semibold tracking-tight">오늘의 자산배분 판단</h2>
          <p className="mb-3 text-xs text-neutral-400">
            아래는 <strong>오늘 하루의 판단</strong>입니다. 실제 배분은 위의 확정 TAA를 따릅니다.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-4">
            {([
              ['주식', verdict.asset_allocation.equity],
              ['채권', verdict.asset_allocation.bond],
              // 대체자산은 2026-08 확장에서 추가됐다. 과거 행에는 없으므로 있을 때만 칸을 만든다.
              ...(verdict.asset_allocation.alt ? [['대체', verdict.asset_allocation.alt] as const] : []),
              ['현금', verdict.asset_allocation.cash],
            ] as const).map(([label, band]) => (
              <div key={label} className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
                <div className="text-xs text-neutral-400">{label}</div>
                <div className="font-semibold">{bandLabel(band)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            <RichText text={verdict.asset_allocation.rationale} />
          </p>

          {verdict.asset_allocation.duration && (
            <div className="mt-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">듀레이션</h3>
                <span className="text-sm font-semibold text-emerald-600">
                  {durationLabel(verdict.asset_allocation.duration.stance)}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                <RichText text={verdict.asset_allocation.duration.rationale} />
              </p>
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {verdict.asset_allocation.fixed_income && verdict.asset_allocation.fixed_income.length > 0 && (
              <SleeveSplitList
                title="채권 구성"
                band={verdict.asset_allocation.bond}
                rows={verdict.asset_allocation.fixed_income}
              />
            )}
            {verdict.asset_allocation.alternatives && verdict.asset_allocation.alternatives.length > 0 && (
              <SleeveSplitList
                title="대체자산 구성"
                band={verdict.asset_allocation.alt}
                rows={verdict.asset_allocation.alternatives}
              />
            )}
          </div>
        </section>
      )}

      {verdict.dm_vs_em && (
        <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>선진국 vs 신흥국</span>
            <span className="text-emerald-600">{dmEmLabel(verdict.dm_vs_em.preference)}</span>
          </div>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            <RichText text={verdict.dm_vs_em.rationale} />
          </p>
        </section>
      )}

      {/*
        달러·원달러 방향. dm_vs_em·GLD·EMLC 비중 근거로 흩어져 쓰이던 판단을 CIO가
        하나로 모은 것이다 — 가격 목표가 아니라 방향뿐이다(prompts/cio.md 4절).
      */}
      {verdict.fx_view && (
        <section>
          <h2 className="mb-1 text-base font-semibold tracking-tight">달러·원달러 방향</h2>
          <p className="mb-3 text-xs text-neutral-400">
            방향과 확신도만 냅니다. 가격 목표가 아닙니다.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([
              ['dxy', '달러인덱스(DXY)', 'DX-Y.NYB'],
              ['usdkrw', '원달러', 'KRW=X'],
            ] as const).map(([key, title, symbol]) => {
              const v = verdict.fx_view![key]
              const label = fxDirectionLabel(v.direction, key)
              return (
                <div key={key} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>{title}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${label.className}`}>{label.text}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-400">확신도 {convictionLabel(v.confidence)}</p>
                  <PriceSparkline symbol={symbol} points={priceHistory[symbol]} />
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    <RichText text={v.rationale} />
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {verdict.markets && verdict.markets.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-semibold tracking-tight">시장별 판단</h2>
          <p className="mb-3 text-xs text-neutral-400">
            비중은 주식 슬리브 안에서의 배분입니다. 시장을 누르면 애널리스트 6인의 코멘트가 열립니다.
          </p>
          <div className="flex flex-col gap-2">
            {verdict.markets.map((m) => (
              <MarketCard key={m.code} view={m} priceHistory={priceHistory} />
            ))}
          </div>
        </section>
      )}

      {chartData.regionCorr.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-semibold tracking-tight">시장 간 상관 (60일)</h2>
          <p className="mb-3 text-xs leading-relaxed text-neutral-500">
            비중을 나눴다고 분산되는 것이 아닙니다. <strong>상관이 0.9를 넘으면 두 포지션이 아니라
            크기가 두 배인 하나</strong>이므로 합산해서 관리해야 합니다.
          </p>
          <CorrelationMatrix pairs={chartData.regionCorr} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold tracking-tight">왜 이렇게 판단했나</h2>
        <div className="flex flex-col gap-2">
          {verdict.drivers.map((d, i) => (
            <DriverCard
              key={i}
              driver={d}
              output={outputs.get(d.agent)}
              priceHistory={priceHistory}
              chartData={chartData}
            />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
        <h2 className="mb-1 font-medium text-amber-800 dark:text-amber-300">반대 의견</h2>
        <p className="text-amber-900 dark:text-amber-200"><RichText text={verdict.counter_case} /></p>
      </section>

      {/* markets(5개 시장)가 있으면 국가 그리드는 중복이므로 접는다. 과거 행에는 markets가 없다. */}
      {!verdict.markets && (
        <StanceGrid
          title="국가"
          items={verdict.countries.map((c) => ({ label: c.code, stance: c.stance, sub: c.rationale }))}
        />
      )}
      <section>
        <h2 className="mb-1 text-base font-semibold tracking-tight">섹터</h2>
        <p className="mb-2 text-xs text-neutral-400">누르면 판단 근거와 상위 보유종목이 펼쳐집니다.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {verdict.sectors.map((s) => (
            <SectorCard
              key={`${s.region ?? 'GLOBAL'}-${s.name}`}
              label={s.region && s.region !== 'GLOBAL' ? `${s.region} ${s.name}` : s.name}
              stance={s.stance}
              etf={s.etf}
              rationale={s.rationale}
              holdings={sectorHoldings[s.etf]}
            />
          ))}
        </div>
      </section>

      {verdict.trades && verdict.trades.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-semibold tracking-tight">실행</h2>
          <p className="mb-3 text-xs text-neutral-400">
            위 판단을 티커로 옮긴 것입니다. 주문 지시가 아닙니다.
          </p>
          <TradeList trades={verdict.trades} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold tracking-tight">종목</h2>
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
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400"><RichText text={p.thesis} /></p>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold tracking-tight">이 논리가 깨지는 조건</h2>
        <ul className="list-inside list-disc text-sm text-neutral-600 dark:text-neutral-400">
          {verdict.invalidation.map((inv, i) => (
            <li key={i}>{inv}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
