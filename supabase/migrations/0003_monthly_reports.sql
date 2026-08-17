-- 월간 자산배분 리포트. 일간 판단과 달리 한 달에 한 행이다.
create table if not exists monthly_reports (
  id bigint generated always as identity primary key,
  month text not null unique,          -- 'YYYY-MM'
  payload jsonb not null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists monthly_reports_month_idx on monthly_reports (month desc);

alter table monthly_reports enable row level security;

-- daily_verdicts와 같은 규칙: 공개한 것만 anon이 읽는다.
create policy anon_read_published_monthly on monthly_reports
  for select to anon using (published);
