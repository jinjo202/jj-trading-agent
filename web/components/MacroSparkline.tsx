import { SeriesChart } from '@/components/SeriesChart'

/**
 * 매크로 지표 추이. 가격과 달리 **부호가 뜻을 바꾸는 값**(금리차·실질금리)이라
 * 0선을 켜 둔다. 값 하나로는 수준을 알 수 없다는 것이 이 차트의 존재 이유다.
 */
export function MacroSparkline({
  label,
  unit,
  points,
}: {
  label: string
  unit: string
  points: { date: string; value: number }[] | undefined
}) {
  return <SeriesChart label={label} points={points} unit={unit} zeroLine compact digits={2} />
}
