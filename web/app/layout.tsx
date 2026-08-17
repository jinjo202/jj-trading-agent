import type { Metadata } from 'next'
import Link from 'next/link'
import { Disclaimer } from '@/components/Disclaimer'
import './globals.css'

export const metadata: Metadata = {
  title: '오늘의 시장 판단',
  description: '한국·미국 시장 리서치 대시보드',
}

// 월간 리포트가 생기면서 페이지가 셋이 됐다. 링크가 없으면 URL을 외워야 찾아간다.
const NAV = [
  { href: '/', label: '오늘' },
  { href: '/monthly', label: '월간' },
  { href: '/history', label: '히스토리' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <nav className="mx-auto flex w-full max-w-3xl gap-4 px-4 py-2 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-neutral-600 hover:text-emerald-600 dark:text-neutral-400">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
        <Disclaimer />
      </body>
    </html>
  )
}
