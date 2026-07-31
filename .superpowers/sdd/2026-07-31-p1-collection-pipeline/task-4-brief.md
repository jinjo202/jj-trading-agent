### Task 4: FRED 매크로 소스

**Files:**
- Create: `src/sources/fred.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `fred.ts`: `fetchFredSeries(id: string, start: string): Promise<{ date: string; value: number | null }[]>`, `hasFredKey(): boolean`

- [ ] **Step 1: 모듈 작성**

키가 없으면 던진다. 호출자(`collect.ts`)가 잡아서 매크로 필드를 `null`로 두고 진행한다 — 매크로 하나 때문에 가격 수집 전체가 죽으면 안 된다.

`src/sources/fred.ts`:

```ts
export function hasFredKey(): boolean {
  return Boolean(process.env.FRED_API_KEY)
}

export async function fetchFredSeries(
  id: string,
  start: string,
): Promise<{ date: string; value: number | null }[]> {
  const key = process.env.FRED_API_KEY
  if (!key) throw new Error('FRED_API_KEY 없음')
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&observation_start=${start}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED ${id} HTTP ${res.status}`)
  const json = (await res.json()) as { observations: { date: string; value: string }[] }
  // FRED는 결측을 '.'로 표기한다.
  return json.observations.map((o) => ({
    date: o.date,
    value: o.value === '.' ? null : Number(o.value),
  }))
}
```

- [ ] **Step 2: FRED 키 발급**

https://fredaccount.stlouisfed.org/apikeys 에서 무료 키를 발급받아 `.env`의 `FRED_API_KEY`에 넣는다.

- [ ] **Step 3: 전체 스모크 실행**

```bash
npm run smoke
```

Expected: 7개 체크가 전부 `OK`. 종료코드 0.

- [ ] **Step 4: 타입체크**

```bash
npm run typecheck
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/sources/fred.ts
git commit -m "feat: add FRED macro source and source smoke check"
```

---

