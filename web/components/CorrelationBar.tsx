/**
 * 상관계수 한 값을 -1~+1 눈금 위에 찍는다.
 *
 * 시계열 대신 눈금을 쓰는 이유: 상관은 값 하나에 이미 뜻이 다 들어 있고,
 * "0.95가 높은가"는 추이가 아니라 **척도 위 어디인가**로 답하는 질문이다.
 * 0.9를 넘으면 분산이 사실상 없다는 뜻이라 그 구간을 색으로 갈라 둔다.
 */
export function CorrelationBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(-1, Math.min(1, value))
  const pct = ((v + 1) / 2) * 100
  // 0.9 초과는 "두 포지션이 아니라 크기가 두 배인 하나"라는 뜻이라 붉게 경고한다.
  const color = v >= 0.9 ? '#dc2626' : v >= 0.7 ? '#d97706' : v <= 0.2 ? '#059669' : '#6b7280'

  return (
    <div className="mt-1 w-full">
      <div className="mb-0.5 flex items-baseline justify-between text-[10px] text-neutral-400">
        <span>{label}</span>
        <span className="tabular-nums font-medium" style={{ color }}>
          {v.toFixed(3)}
          {v >= 0.9 && ' · 분산 없음'}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-gradient-to-r from-emerald-200 via-neutral-200 to-rose-300 dark:from-emerald-900 dark:via-neutral-700 dark:to-rose-900">
        {/* 0선. 상관은 부호가 뜻을 바꾸므로 가운데를 항상 표시한다. */}
        <div className="absolute left-1/2 top-[-2px] bottom-[-2px] w-px bg-neutral-400 dark:bg-neutral-500" />
        <div
          className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm ring-1 ring-white dark:ring-neutral-900"
          style={{ left: `${pct}%`, background: color }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[9px] text-neutral-400">
        <span>-1 역상관</span>
        <span>0</span>
        <span>+1 동조</span>
      </div>
    </div>
  )
}
