### Task 2: Supabase 스키마 + RLS + DB 쓰기 모듈

**Files:**
- Create: `supabase/migrations/0001_trading_agent_schema.sql` (기록용 사본)
- Create: `src/db.ts`

**Interfaces:**
- Consumes: `types.ts`의 `SnapshotKind`
- Produces: `db.ts`: `db(): SupabaseClient`, `kstDate(): string`, `upsertSnapshot(kind: SnapshotKind, date: string, payload: unknown): Promise<void>`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/0001_trading_agent_schema.sql`. 설계서 §9 스키마에 `market_snapshots(date, kind)` 유니크 제약을 추가한다 — 같은 날 수집을 재실행해도 행이 중복되지 않아야 하기 때문이다.

```sql
create table if not exists market_snapshots (
  id bigint generated always as identity primary key,
  date date not null,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (date, kind)
);

create table if not exists agent_reports (
  id bigint generated always as identity primary key,
  date date not null,
  agent text not null,
  output jsonb not null,
  created_at timestamptz not null default now(),
  unique (date, agent)
);

create table if not exists daily_verdicts (
  id bigint generated always as identity primary key,
  date date not null unique,
  verdict jsonb not null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists company_reports (
  id bigint generated always as identity primary key,
  ticker text not null,
  market text not null check (market in ('KR', 'US')),
  date date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (ticker, market, date)
);

create table if not exists report_requests (
  id bigint generated always as identity primary key,
  ticker text not null,
  market text not null check (market in ('KR', 'US')),
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

create table if not exists universe (
  ticker text not null,
  market text not null check (market in ('KR', 'US')),
  name text not null,
  sector text,
  active boolean not null default true,
  primary key (ticker, market)
);

create index if not exists market_snapshots_date_idx on market_snapshots (date desc);
create index if not exists agent_reports_date_idx on agent_reports (date desc);
create index if not exists company_reports_ticker_idx on company_reports (ticker, market, date desc);
create index if not exists report_requests_open_idx on report_requests (requested_at) where fulfilled_at is null;

alter table market_snapshots enable row level security;
alter table agent_reports    enable row level security;
alter table daily_verdicts   enable row level security;
alter table company_reports  enable row level security;
alter table report_requests  enable row level security;
alter table universe         enable row level security;

-- anon 읽기. daily_verdicts는 published된 행만.
create policy anon_read_agent_reports    on agent_reports    for select to anon using (true);
create policy anon_read_company_reports  on company_reports  for select to anon using (true);
create policy anon_read_universe         on universe         for select to anon using (true);
create policy anon_read_published_verdict on daily_verdicts   for select to anon using (published);

-- 웹에서 리포트 요청만 가능. 읽기/수정 불가.
create policy anon_insert_report_request on report_requests for insert to anon with check (true);

-- market_snapshots에는 anon 정책을 만들지 않는다(원시 데이터 비공개).
-- service_role은 RLS를 우회하므로 별도 정책이 필요 없다.
```

- [ ] **Step 2: 마이그레이션 적용**

Supabase MCP `apply_migration`을 project_id `jsxhcqnupvvctnjiaric`, name `trading_agent_schema`, query = 위 SQL로 호출한다.

- [ ] **Step 3: 스키마 적용 확인**

Supabase MCP `list_tables` (project_id `jsxhcqnupvvctnjiaric`, schemas `["public"]`, verbose `false`) 호출.
Expected: `market_snapshots`, `agent_reports`, `daily_verdicts`, `company_reports`, `report_requests`, `universe` 6개 테이블이 모두 `rls_enabled: true`로 나온다. 기존 테이블 6개는 그대로 남아 있다.

이어서 Supabase MCP `get_advisors` (type `security`)를 호출해 RLS 관련 경고가 새로 생기지 않았는지 본다. 새 테이블에 대한 "RLS disabled" 경고가 있으면 그 테이블의 `enable row level security`가 누락된 것이므로 고친다.

- [ ] **Step 4: `.env` 준비**

`.env.example`을 `.env`로 복사한 뒤 `SUPABASE_SERVICE_ROLE_KEY`를 Supabase 대시보드 Project Settings → API에서 복사해 채운다. `.env`는 `.gitignore`에 있으므로 커밋되지 않는다.

- [ ] **Step 5: DB 모듈 작성**

`src/db.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SnapshotKind } from './types.ts'

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다')
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}

// 수집 기준일은 항상 KST. 'sv-SE' 로케일이 YYYY-MM-DD를 준다.
export function kstDate(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export async function upsertSnapshot(kind: SnapshotKind, date: string, payload: unknown): Promise<void> {
  const { error } = await db()
    .from('market_snapshots')
    .upsert({ date, kind, payload }, { onConflict: 'date,kind' })
  if (error) throw new Error(`market_snapshots upsert 실패 (${kind}): ${error.message}`)
}
```

- [ ] **Step 6: 왕복 확인**

```bash
node --env-file=.env --input-type=module -e "const {upsertSnapshot,kstDate,db}=await import('./src/db.ts');await upsertSnapshot('prices',kstDate(),{smoke:true});const{data}=await db().from('market_snapshots').select('date,kind').eq('kind','prices');console.log(data);await db().from('market_snapshots').delete().eq('kind','prices')"
```

Expected: `[ { date: '2026-..-..', kind: 'prices' } ]` 출력 후 정리됨. 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/0001_trading_agent_schema.sql src/db.ts
git commit -m "feat: add supabase schema, RLS policies and snapshot writer"
```

---

