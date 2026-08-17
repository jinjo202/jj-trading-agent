import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getMonthlyReport } from '@/lib/queries'
import { MonthlyReportView } from '@/components/MonthlyReportView'

export const dynamic = 'force-dynamic'

export default async function MonthlyArchivePage({
  params,
}: {
  params: Promise<{ month: string }>
}) {
  const { month } = await params
  const report = await getMonthlyReport(month)
  if (!report) notFound()

  return (
    <div className="flex flex-col gap-6">
      <MonthlyReportView report={report} />
      <Link href="/monthly" className="text-sm text-emerald-600 hover:underline">
        ← 최신 월간 리포트
      </Link>
    </div>
  )
}
