import { SeriesChart } from '@/components/SeriesChart'

/**
 * 종가 차트. SeriesChart에 축·기간 버튼이 다 들어 있으므로 여기서는
 * 가격 시계열을 공통 형태({date,value})로 바꿔 넘기기만 한다.
 */
export function PriceSparkline({
  symbol,
  points,
}: {
  symbol: string
  points: { date: string; close: number }[] | undefined
}) {
  if (!points || points.length < 2) return null
  return (
    <SeriesChart
      label={`${symbol} 종가`}
      points={points.map((p) => ({ date: p.date, value: p.close }))}
      compact
      digits={2}
    />
  )
}
