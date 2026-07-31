import type { Metadata } from 'next'
import { Disclaimer } from '@/components/Disclaimer'
import './globals.css'

export const metadata: Metadata = {
  title: '오늘의 시장 판단',
  description: '한국·미국 시장 리서치 대시보드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <Disclaimer />
      </body>
    </html>
  )
}
