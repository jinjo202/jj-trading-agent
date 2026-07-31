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
