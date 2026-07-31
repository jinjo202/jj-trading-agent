### Task 4: `/history` 페이지

**Files:**
- Create: `web/app/history/page.tsx`

**Interfaces:**
- Consumes: `queries.ts`의 `getVerdictHistory`, `historyPoint`; `format.ts`의 `signalLabel`

- [ ] **Step 1: 페이지 작성**

Recharts는 클라이언트 컴포넌트가 필요하므로 차트 부분만 별도 클라이언트 컴포넌트로 뺀다.

`web/app/history/ScoreTrendChart.tsx`:

```tsx
'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export function ScoreTrendChart({ points }: { points: { date: string; score: number }[] }) {
  const data = [...points].reverse() // 오래된 것부터
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Tooltip />
        <Line type="monotone" dataKey="score" stroke="#059669" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

`web/app/history/page.tsx`:

```tsx
import { getVerdictHistory, historyPoint } from '@/lib/queries'
import { signalLabel } from '@/lib/format'
import { ScoreTrendChart } from './ScoreTrendChart'

export const revalidate = 3600

export default async function HistoryPage() {
  const rows = await getVerdictHistory(90)

  if (rows.length === 0) {
    return <div className="py-12 text-center text-neutral-500">아직 발행된 결론이 없습니다.</div>
  }

  const points = rows.map(historyPoint)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">점수 추이</h1>
      <ScoreTrendChart points={points} />

      <div className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map(({ date, verdict }) => {
          const signal = signalLabel(verdict.signal)
          return (
            <a
              key={date}
              href={`/agents/${date}`}
              className="flex items-center justify-between py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              <span>{date}</span>
              <span className="text-neutral-400">{verdict.equity_score}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${signal.className}`}>{signal.text}</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 로컬 확인**

```bash
cd web && npm run dev
```

`http://localhost:3000/history`를 연다. Expected: 데이터가 없으면 안내 문구, 있으면 차트+목록.

- [ ] **Step 3: 빌드 + 커밋**

```bash
cd web && npm run build && cd ..
```

```bash
git add web/app/history/page.tsx web/app/history/ScoreTrendChart.tsx
git commit -m "feat: add history route with score trend chart"
```

---

