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
