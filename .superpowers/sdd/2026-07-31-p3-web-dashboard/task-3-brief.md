### Task 3: `/` 오늘의 결론 페이지

**Files:**
- Create: `web/app/page.tsx`
- Create: `web/components/ScoreGauge.tsx`
- Create: `web/components/DriverCard.tsx`
- Create: `web/components/StanceGrid.tsx`

**Interfaces:**
- Consumes: `queries.ts`의 `getLatestPublishedVerdict`; `format.ts` 전체
- Produces: 라우트 `/`. 이후 태스크가 참고할 시각 언어(카드·배지 스타일)를 여기서 확립한다.

- [ ] **Step 1: 하위 컴포넌트 작성**

`web/components/ScoreGauge.tsx`:

```tsx
import { scoreGaugeColor } from '@/lib/format'

export function ScoreGauge({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative flex h-28 w-28 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(${scoreGaugeColor(score)} ${pct * 3.6}deg, #e5e7eb 0deg)` }}
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-2xl font-semibold dark:bg-neutral-900">
          {score}
        </div>
      </div>
      <span className="text-xs text-neutral-500">주식 비중 점수 (0-100, 50 중립)</span>
    </div>
  )
}
```

`web/components/DriverCard.tsx`:

```tsx
import type { DailyVerdict } from '@/lib/types'

export function DriverCard({ driver }: { driver: DailyVerdict['drivers'][number] }) {
  const sign = driver.direction === '+' ? 'text-emerald-600' : 'text-rose-600'
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{driver.agent}</span>
        <span className={sign}>{driver.direction} ({(driver.weight * 100).toFixed(0)}%)</span>
      </div>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{driver.point}</p>
    </div>
  )
}
```

`web/components/StanceGrid.tsx`:

```tsx
import { stanceClassName } from '@/lib/format'

export function StanceGrid({
  title, items,
}: {
  title: string
  items: { label: string; stance: 'OW' | 'N' | 'UW'; sub?: string }[]
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-neutral-500">{title}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((it) => (
          <div key={it.label} className={`rounded-md p-2 text-sm ${stanceClassName(it.stance)}`}>
            <div className="font-medium">{it.label}</div>
            <div className="text-xs opacity-80">{it.stance}{it.sub ? ` · ${it.sub}` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 페이지 작성**

`web/app/page.tsx`:

```tsx
import { getLatestPublishedVerdict } from '@/lib/queries'
import { equityWeightLabel, signalLabel } from '@/lib/format'
import { ScoreGauge } from '@/components/ScoreGauge'
import { DriverCard } from '@/components/DriverCard'
import { StanceGrid } from '@/components/StanceGrid'

export const revalidate = 3600

export default async function HomePage() {
  const latest = await getLatestPublishedVerdict()

  if (!latest) {
    return (
      <div className="py-12 text-center text-neutral-500">
        아직 공개된 결론이 없습니다. 첫 <code>/daily</code> 실행과 발행을 기다리는 중입니다.
      </div>
    )
  }

  const { date, verdict } = latest
  const signal = signalLabel(verdict.signal)

  return (
    <div className="flex flex-col gap-6">
      <header className="text-center">
        <p className="text-sm text-neutral-500">{date} 기준</p>
        <span className={`mt-1 inline-block rounded-full px-3 py-1 text-sm font-medium ${signal.className}`}>
          {signal.text}
        </span>
      </header>

      <div className="flex justify-center">
        <ScoreGauge score={verdict.equity_score} />
      </div>

      <div className="text-center">
        <p className="text-sm text-neutral-500">권장 주식비중</p>
        <p className="text-xl font-semibold">{equityWeightLabel(verdict.suggested_equity_weight)}</p>
        <p className="text-xs text-neutral-400">확신도: {verdict.conviction}</p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">왜 이렇게 판단했나</h2>
        <div className="flex flex-col gap-2">
          {verdict.drivers.map((d, i) => (
            <DriverCard key={i} driver={d} />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
        <h2 className="mb-1 font-medium text-amber-800 dark:text-amber-300">반대 의견</h2>
        <p className="text-amber-900 dark:text-amber-200">{verdict.counter_case}</p>
      </section>

      <StanceGrid
        title="국가"
        items={verdict.countries.map((c) => ({ label: c.code, stance: c.stance, sub: c.rationale }))}
      />
      <StanceGrid
        title="섹터"
        items={verdict.sectors.map((s) => ({ label: s.name, stance: s.stance, sub: s.etf }))}
      />

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">종목</h2>
        <div className="flex flex-col gap-2">
          {verdict.picks.map((p) => (
            <a
              key={p.ticker}
              href={`/stock/${p.market}/${p.ticker}`}
              className="block rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
            >
              <div className="flex items-center justify-between text-sm font-medium">
                <span>{p.name} ({p.ticker})</span>
                <span className="text-neutral-400">{p.sector}</span>
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{p.thesis}</p>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">이 논리가 깨지는 조건</h2>
        <ul className="list-inside list-disc text-sm text-neutral-600 dark:text-neutral-400">
          {verdict.invalidation.map((inv, i) => (
            <li key={i}>{inv}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: 로컬에서 확인**

```bash
cd web && npm run dev
```

브라우저로 `http://localhost:3000`을 연다.

Expected: 발행된 verdict가 없으면 "아직 공개된 결론이 없습니다" 문구가 보인다(현재 DB가 비어 있으므로
이 경로가 나오는 것이 정상이다). 콘솔에 `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` 관련 에러가 없어야 한다.
`.env.local`이 없으면 `web/.env.local.example`을 복사해 실제 anon 키를 채운 뒤 다시 시도한다.

- [ ] **Step 4: 빌드 확인**

```bash
cd web && npm run build && cd ..
```

Expected: 빌드 성공. `/` 라우트가 정적/ISR로 표시된다.

- [ ] **Step 5: 커밋**

```bash
git add web/app/page.tsx web/components/ScoreGauge.tsx web/components/DriverCard.tsx web/components/StanceGrid.tsx
git commit -m "feat: add today's verdict route"
```

---

