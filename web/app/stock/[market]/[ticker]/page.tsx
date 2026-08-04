import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLatestCompanyReport } from '@/lib/queries'
import {
  companyStanceLabel,
  marketCapLabel,
  numLabel,
  pctLabel,
  priceLabel,
} from '@/lib/format'

export const revalidate = 3600

/**
 * 순수 CSS 막대. 분기 추이를 8줄 표로 깔면 "1장"에 안 들어가고 모바일에서 스크롤이 길어진다.
 * 최대값 기준으로 높이를 정규화한다. 음수는 0 높이로 눕힌다(적자 분기).
 */
function TrendBars({
  points,
  format,
}: {
  points: { period: string; value: number }[]
  format: (v: number) => string
}) {
  if (points.length === 0) {
    return <p className="text-sm text-neutral-400">데이터 없음</p>
  }
  const max = Math.max(...points.map((p) => Math.abs(p.value)), Number.EPSILON)
  return (
    <div className="flex items-end gap-1">
      {points.map((p) => (
        <div key={p.period} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-[10px] leading-none text-neutral-500">{format(p.value)}</span>
          <div
            className={`w-full rounded-t ${p.value < 0 ? 'bg-rose-400' : 'bg-emerald-400'}`}
            style={{ height: `${Math.max((Math.abs(p.value) / max) * 48, 2)}px` }}
          />
          <span className="truncate text-[10px] leading-none text-neutral-400">{p.period}</span>
        </div>
      ))}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-neutral-400">{label}</span>
      <br />
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ market: string; ticker: string }>
}) {
  const { market, ticker } = await params
  if (market !== 'KR' && market !== 'US') notFound()

  const report = await getLatestCompanyReport(decodeURIComponent(ticker), market)

  // 리포트가 없는 것은 종목이 없는 것과 다르다. 일일 실행이 아직 이 종목을 다루지
  // 않았을 뿐이므로, 404가 아니라 그 사실을 그대로 알린다.
  if (!report) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-neutral-500">
          <code>{decodeURIComponent(ticker)}</code> ({market}) 의 기업 리포트가 아직 없습니다.
        </p>
        <p className="text-xs text-neutral-400">
          기업 리포트는 매일 <code>/daily</code> 실행에서 추천 종목에 대해 생성됩니다.
        </p>
        <Link href="/" className="text-sm text-emerald-600 hover:underline">
          오늘의 결론으로 돌아가기
        </Link>
      </div>
    )
  }

  const { snapshot } = report
  const stance = companyStanceLabel(report.verdict.stance)
  const week52Pct = Math.min(Math.max(snapshot.week52.position, 0), 1) * 100

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">
            {report.name} <span className="text-neutral-400">({report.ticker})</span>
          </h1>
          <p className="text-sm text-neutral-500">
            {report.sector} · {report.market}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${stance.className}`}>
          {stance.text}
        </span>
      </header>

      <section className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Metric label="현재가" value={priceLabel(snapshot.price, report.market)} />
        <Metric label="1일" value={pctLabel(snapshot.change_1d)} />
        <Metric label="1개월" value={pctLabel(snapshot.change_1m)} />
        <Metric label="12개월" value={pctLabel(snapshot.change_12m)} />
        <Metric label="시가총액" value={marketCapLabel(snapshot.market_cap, report.market)} />
        <Metric label="ROE" value={pctLabel(snapshot.roe, { sign: false })} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">밸류에이션 · 재무</h2>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Metric label="PER" value={numLabel(snapshot.per, 1)} />
          <Metric label="PBR" value={numLabel(snapshot.pbr, 2)} />
          <Metric
            label="PER 섹터 백분위"
            value={pctLabel(snapshot.per_pctile_in_sector, { scale: 1, sign: false, digits: 0 })}
          />
          <Metric label="부채비율" value={numLabel(snapshot.debt_to_equity, 1)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">52주 위치</h2>
        <div className="relative h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="absolute top-1/2 h-3.5 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-emerald-600"
            style={{ left: `${week52Pct}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-neutral-400">
          <span>{priceLabel(snapshot.week52.low, report.market)}</span>
          <span>{pctLabel(snapshot.week52.position, { sign: false, digits: 0 })} 지점</span>
          <span>{priceLabel(snapshot.week52.high, report.market)}</span>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium text-neutral-500">사업</h2>
        <p className="text-sm">{report.business}</p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-1 text-sm font-medium text-emerald-600">투자 논지</h2>
          <ul className="list-inside list-disc text-sm">
            {report.thesis.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-1 text-sm font-medium text-rose-600">반대 논거</h2>
          <ul className="list-inside list-disc text-sm">
            {report.bear_points.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      </section>

      {report.catalysts.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium text-neutral-500">향후 촉매</h2>
          <ul className="list-inside list-disc text-sm">
            {report.catalysts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-500">매출 추이</h2>
          <TrendBars
            points={snapshot.revenue_trend}
            format={(v) => marketCapLabel(v, report.market)}
          />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-500">영업이익률 추이</h2>
          <TrendBars
            points={snapshot.op_margin_trend}
            format={(v) => pctLabel(v, { sign: false, digits: 0 })}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium text-neutral-500">차트 위치</h2>
        <p className="text-sm">{report.technical_read}</p>
      </section>

      <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="flex items-center justify-between text-sm font-medium">
          <span>종합 판단</span>
          <span>
            {stance.text}
            <span className="ml-2 font-normal text-neutral-400">
              확신도 {pctLabel(report.verdict.confidence, { sign: false, digits: 0 })}
            </span>
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          {report.verdict.one_liner}
        </p>
      </section>

      {report.news.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium text-neutral-500">최근 뉴스</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {report.news.map((n) => (
              <li key={n.url}>
                <a
                  href={n.url}
                  className="font-medium hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {n.title}
                </a>
                <span className="ml-2 text-xs text-neutral-400">{n.date}</span>
                <p className="text-neutral-500">{n.takeaway}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-sm font-medium text-neutral-500">이 논지가 깨지는 조건</h2>
        <ul className="list-inside list-disc text-sm text-neutral-600 dark:text-neutral-400">
          {report.invalidation.map((inv) => (
            <li key={inv}>{inv}</li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-neutral-400">생성 시각: {report.generated_at}</p>
    </div>
  )
}
