import { MARKET_NAMES } from '@/lib/types'
import type { MarketCode } from '@/lib/types'

const ORDER: MarketCode[] = ['US', 'KR', 'JP', 'EU', 'EM']

/** 상관이 높을수록 붉게. 0.9 위는 "분산이 없다"는 뜻이라 확실히 눈에 띄어야 한다. */
function cellStyle(v: number | null): { background: string; color: string } {
  if (v === null) return { background: 'transparent', color: 'inherit' }
  const t = Math.max(0, Math.min(1, (v + 1) / 2)) // -1..1 → 0..1
  // 낮으면 초록, 높으면 빨강. 알파로만 강도를 주어 다크모드에서도 글자가 읽힌다.
  const hue = v >= 0.9 ? 0 : v >= 0.7 ? 25 : v <= 0.2 ? 155 : 210
  const alpha = 0.10 + Math.abs(t - 0.5) * 0.5
  return {
    background: `hsl(${hue} 75% 50% / ${alpha.toFixed(2)})`,
    color: 'inherit',
  }
}

/**
 * 시장 쌍 상관 표. 개별 변동성만 보고 비중을 나누면 상관 0.95인 두 시장을
 * 각각 배분해 놓고 분산됐다고 착각하게 되는데, 그 착각을 막는 것이 이 표의 목적이다.
 */
export function CorrelationMatrix({
  pairs,
}: {
  pairs: { a: string; b: string; corr60d: number | null }[]
}) {
  if (pairs.length === 0) return null

  // 쌍 배열을 대칭 행렬로 편다. 어느 방향으로 저장됐든 찾을 수 있게 양쪽에 넣는다.
  const m = new Map<string, number | null>()
  for (const p of pairs) {
    m.set(`${p.a}|${p.b}`, p.corr60d)
    m.set(`${p.b}|${p.a}`, p.corr60d)
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-1.5" />
            {ORDER.map((c) => (
              <th key={c} className="p-1.5 text-xs font-medium text-neutral-500">
                {MARKET_NAMES[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ORDER.map((r) => (
            <tr key={r}>
              <th className="p-1.5 text-right text-xs font-medium text-neutral-500">{MARKET_NAMES[r]}</th>
              {ORDER.map((c) => {
                const v = r === c ? 1 : (m.get(`${r}|${c}`) ?? null)
                return (
                  <td
                    key={c}
                    className="min-w-[52px] rounded p-1.5 text-center tabular-nums"
                    style={cellStyle(v)}
                    title={`${MARKET_NAMES[r]} · ${MARKET_NAMES[c]}`}
                  >
                    {v === null ? '–' : r === c ? '—' : v.toFixed(2)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
