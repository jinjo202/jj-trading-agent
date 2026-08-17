import { ImplementationTable } from '@/components/ImplementationTable'
import { RichText } from '@/components/RichText'
import { PositioningTable } from '@/components/PositioningTable'
import type { MonthlyReport } from '@/lib/types'

// SAA의 출처가 셋 다 다르고, 그 차이가 곧 신뢰도의 차이다. 화면에 그대로 적는다.
const NEUTRAL_NOTE: Record<string, string> = {
  equity: 'SAA 출처: 세계 시가총액 근사(관측 가능한 사실).',
  bond: 'SAA 출처: 미국 편중 코어 포트폴리오의 업계 관례.',
  alt: 'SAA 출처: 시가총액 중립이 존재하지 않아 이 시스템이 정한 기준선. 시장의 사실이 아닙니다.',
}

export function MonthlyReportView({ report }: { report: MonthlyReport }) {
  const comparedTo =
    report.prev_as_of === null
      ? '비교 대상 없음'
      : report.prev_basis === 'month-start'
        ? `${report.prev_as_of} 대비 (전월 리포트가 없어 이 달 첫 판단과 비교)`
        : `${report.prev_as_of} 대비 (전월)`

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">월간 자산배분 뷰포인트</p>
        <h1 className="text-2xl font-semibold">{report.month}</h1>
        <p className="mt-1 text-xs text-neutral-400">
          기준 {report.as_of} · {comparedTo}
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-base font-semibold tracking-tight">전망</h2>
        <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300"><RichText text={report.outlook} /></p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold tracking-tight">이 달의 테마</h2>
        <div className="flex flex-col gap-3">
          {report.themes.map((t) => (
            <div key={t.title} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <h3 className="text-sm font-semibold">{t.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"><RichText text={t.body} /></p>
            </div>
          ))}
        </div>
      </section>

      {/* 이 절이 이 리포트의 핵심이다. 변화가 없으면 없다고 분명히 적는다. */}
      <section>
        <h2 className="mb-1 text-base font-semibold tracking-tight">직전 대비 변화</h2>
        <p className="mb-3 text-xs text-neutral-400">
          무엇이 어떻게 바뀌었는지는 코드가 두 판단을 비교해 계산했고, 왜 바뀌었는지만 애널리스트가 씁니다.
        </p>
        {report.changes.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 p-3 text-sm text-neutral-500 dark:border-neutral-800">
            비교 대상 판단과 견줘 바뀐 포지션이 없습니다.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {/* 큰 변화를 먼저 보여준다. 목록 순서가 곧 중요도가 되게. */}
            {[...report.changes]
              .sort((a, b) => Number(b.material ?? false) - Number(a.material ?? false))
              .map((c) => (
                <div
                  key={c.area}
                  className={
                    c.material
                      ? 'rounded-lg border-l-4 border-amber-500 border-y border-r border-y-amber-200 border-r-amber-200 bg-amber-50/60 p-3 dark:border-y-amber-900 dark:border-r-amber-900 dark:bg-amber-950/30'
                      : 'rounded-lg border border-neutral-200 p-3 dark:border-neutral-800'
                  }
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    {c.material && (
                      <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        큰 변화
                      </span>
                    )}
                    <span className="text-sm font-medium">{c.area}</span>
                    <span className="text-xs tabular-nums text-neutral-400">
                      {c.from} <span className="text-neutral-300 dark:text-neutral-600">→</span>{' '}
                      <span className="font-medium text-neutral-600 dark:text-neutral-300">{c.to}</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"><RichText text={c.reason} /></p>
                </div>
              ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold tracking-tight">포지셔닝</h2>
        <PositioningTable rows={report.positioning} />
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold tracking-tight">포트폴리오 구현 — SAA 대비 TAA</h2>
        <p className="mb-3 text-xs text-neutral-400">
          <strong>SAA</strong>는 연 1회 검토하는 전략 기준선, <strong>TAA</strong>는 이 달 확정한 전술 배분,
          <strong> ±</strong>가 곧 이 달의 베팅입니다. 각 표의 비중은 그 자산군{' '}
          <strong>안에서의</strong> 배분이며 합이 100%입니다.
        </p>
        <div className="flex flex-col gap-4">
          {report.implementation.map((imp) => (
            <ImplementationTable
              key={imp.sleeve}
              label={imp.label}
              rows={imp.rows}
              neutralNote={NEUTRAL_NOTE[imp.sleeve]}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold tracking-tight">이 포지셔닝이 깨지는 조건</h2>
        <ul className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-400">
          {report.key_risks.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-rose-500">—</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="border-t border-neutral-200 pt-3 text-xs text-neutral-400 dark:border-neutral-800">
        {report.disclaimer}
      </p>
    </div>
  )
}
