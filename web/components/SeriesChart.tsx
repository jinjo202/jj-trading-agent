'use client'

import { useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

export type SeriesPoint = { date: string; value: number }

/** 기간 버튼. 값은 거래일 수가 아니라 **관측 개수**다 — 월간 시리즈에도 그대로 쓰인다. */
const RANGES = [
  { key: '1M', label: '1개월', n: 21 },
  { key: '3M', label: '3개월', n: 63 },
  { key: '6M', label: '6개월', n: 126 },
  { key: '1Y', label: '1년', n: 260 },
  { key: 'ALL', label: '전체', n: Number.POSITIVE_INFINITY },
] as const

const fmtAxis = (d: string) => (d.length >= 10 ? d.slice(2, 7) : d) // 2026-08-16 → 26-08

/**
 * 근거 옆에 붙는 시계열 차트. 가격과 매크로가 같은 컴포넌트를 쓴다 —
 * 축·툴팁·기간 버튼을 두 벌 관리하면 한쪽만 고쳐져 어긋난다.
 *
 * 기간 버튼이 있는 이유: 1년 추이만 보면 최근 한 달의 움직임이 뭉개진다.
 * 특정 구간을 좁혀 봐야 "언제부터 꺾였나"에 답할 수 있다.
 */
export function SeriesChart({
  label,
  points,
  unit = '',
  digits = 2,
  zeroLine = false,
  defaultRange = '1Y',
  compact = false,
}: {
  label: string
  points: SeriesPoint[] | undefined
  unit?: string
  digits?: number
  /** 부호가 뜻을 바꾸는 지표(금리차·상관)는 0선을 그린다. */
  zeroLine?: boolean
  defaultRange?: (typeof RANGES)[number]['key']
  /** 근거 줄 안에 들어가는 작은 형태. 기간 버튼을 접어 둔다. */
  compact?: boolean
}) {
  const [range, setRange] = useState<string>(defaultRange)
  const [open, setOpen] = useState(!compact)

  if (!points || points.length < 2) return null

  const n = RANGES.find((r) => r.key === range)?.n ?? Number.POSITIVE_INFINITY
  const data = Number.isFinite(n) ? points.slice(-n) : points
  if (data.length < 2) return null

  const first = data[0].value
  const last = data[data.length - 1].value
  const rising = last >= first
  const color = rising ? '#dc2626' : '#2563eb'
  const min = Math.min(...data.map((d) => d.value))
  const max = Math.max(...data.map((d) => d.value))
  const crossesZero = zeroLine && min < 0 && max > 0

  return (
    <div className="mt-1 w-full">
      <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          {label} · {data[0].date} ~ {data[data.length - 1].date}
          {compact && <span className="ml-1">{open ? '▴' : '▾'}</span>}
        </button>
        <span className="tabular-nums text-[10px] text-neutral-400">
          {first.toFixed(digits)}
          {unit} →{' '}
          <span className="font-medium text-neutral-600 dark:text-neutral-300">
            {last.toFixed(digits)}
            {unit}
          </span>
        </span>
      </div>

      {open && (
        <>
          <ResponsiveContainer width="100%" height={compact ? 96 : 160}>
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="2 3" stroke="currentColor" className="text-neutral-200 dark:text-neutral-800" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={fmtAxis}
                tick={{ fontSize: 9 }}
                minTickGap={28}
                stroke="currentColor"
                className="text-neutral-400"
              />
              <YAxis
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 9 }}
                width={38}
                tickFormatter={(v: number) => v.toFixed(digits === 0 ? 0 : 1)}
                stroke="currentColor"
                className="text-neutral-400"
              />
              {crossesZero && <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="2 2" />}
              <Tooltip
                contentStyle={{ fontSize: 11, padding: '2px 6px' }}
                labelFormatter={(l) => String(l)}
                formatter={(v) => [`${Number(v).toFixed(digits)}${unit}`, label]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                fill={color}
                fillOpacity={0.12}
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>

          <div className="mt-1 flex flex-wrap gap-1">
            {RANGES.filter((r) => !Number.isFinite(r.n) || r.n < points.length).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  range === r.key
                    ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900'
                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
