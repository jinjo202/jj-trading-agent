import Link from 'next/link'
import { getLatestMonthlyReport, getMonthlyReportMonths } from '@/lib/queries'
import { MonthlyReportView } from '@/components/MonthlyReportView'

// 최신 월간 리포트를 보여주는 페이지라 홈과 같은 이유로 캐시하지 않는다.
export const dynamic = 'force-dynamic'

export default async function MonthlyPage() {
  const [report, months] = await Promise.all([getLatestMonthlyReport(), getMonthlyReportMonths()])

  if (!report) {
    return (
      <div className="py-12 text-center text-neutral-500">
        아직 공개된 월간 리포트가 없습니다. <code>npm run monthly -- --publish</code>로 만들 수 있습니다.
      </div>
    )
  }

  const others = months.filter((m) => m !== report.month)

  return (
    <div className="flex flex-col gap-6">
      <MonthlyReportView report={report} />
      {others.length > 0 && (
        <nav className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <h2 className="mb-2 text-sm font-medium text-neutral-500">지난 리포트</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((m) => (
              <Link
                key={m}
                href={`/monthly/${m}`}
                className="rounded-md border border-neutral-200 px-2 py-1 text-sm hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
              >
                {m}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
