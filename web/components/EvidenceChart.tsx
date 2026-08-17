import { extractChartSymbol, extractMacroField } from '@/lib/format'
import { CorrelationBar } from '@/components/CorrelationBar'
import { MacroSparkline } from '@/components/MacroSparkline'
import { PriceSparkline } from '@/components/PriceSparkline'
import type { ChartData } from '@/lib/queries'

/** 근거 경로가 지역 신용스프레드를 가리키면 그 스프레드의 시계열 키를 낸다. */
function regionCreditKey(source: string): { key: string; label: string } | null {
  const m = source.match(/features\.regionMacro\.([A-Z]{2})\.creditSpread/)
  return m ? { key: `regionMacro.${m[1]}.creditSpread`, label: `${m[1]} 신용스프레드` } : null
}

/** 상관을 인용한 근거인가. 값은 evidence.value에서 뽑는다. */
function correlationLabel(source: string): string | null {
  if (/features\.regionCorr\[\d+\]/.test(source)) return '시장 간 60일 상관'
  if (/features\.sleeves\[\d+\]\.corrToEquity60d/.test(source)) return '주식(SPY)과의 60일 상관'
  return null
}

/** "0.952", "+1.84%", "0.519 (분산재 아님)"처럼 앞에 숫자가 붙은 값에서 수치만 뽑는다. */
function leadingNumber(value: string): number | null {
  const m = value.match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

/**
 * 근거 한 줄 옆에 붙는 차트. **인용한 값 자신을 보여주는 것**이 원칙이다.
 *
 * 우선순위:
 * 1. 상관 인용 → -1~+1 눈금(추이가 아니라 척도 위 위치가 답인 값이다)
 * 2. 매크로·지역 신용 인용 → 그 지표의 시계열
 * 3. 그 외 → 관련 자산의 가격. 인덱스 경로(`features.sleeves[7]`)는 수집 때 만든
 *    `chartIndex`로 티커를 푼다 — 배열 순서를 웹에 복제하면 조용히 어긋난다.
 *
 * 넷 다 아니면 아무것도 그리지 않는다. 브레드스처럼 원래 그릴 것이 없는 근거가 있다.
 */
export function EvidenceChart({
  source,
  value,
  priceHistory,
  chartData,
}: {
  source: string
  value?: string
  priceHistory: Record<string, { date: string; close: number }[]>
  chartData: ChartData
}) {
  const corr = correlationLabel(source)
  if (corr) {
    const n = value === undefined ? null : leadingNumber(value)
    if (n !== null && n >= -1 && n <= 1) return <CorrelationBar label={corr} value={n} />
  }

  const macro = extractMacroField(source)
  if (macro && chartData.series[macro.key]?.length) {
    return <MacroSparkline label={macro.label} unit={macro.unit} points={chartData.series[macro.key]} />
  }

  const credit = regionCreditKey(source)
  if (credit && chartData.series[credit.key]?.length) {
    return <MacroSparkline label={credit.label} unit="%p" points={chartData.series[credit.key]} />
  }

  // 인덱스 경로는 가장 긴 접두사로 찾는다: `features.sleeves[7].distYield` → `features.sleeves[7]`
  const indexed = Object.keys(chartData.chartIndex)
    .filter((k) => source.startsWith(k))
    .sort((a, b) => b.length - a.length)[0]
  const symbol = indexed
    ? chartData.chartIndex[indexed]
    : extractChartSymbol(source, Object.keys(priceHistory))
  if (!symbol) return null
  return <PriceSparkline symbol={symbol} points={priceHistory[symbol]} />
}
