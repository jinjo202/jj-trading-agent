-- 근거에 "실질금리 2.39%"가 나오면 그 추이를 옆에 그려야 수준을 읽을 수 있다.
-- macro 스냅샷은 FRED 공개 데이터라 노출 민감도가 없다. features는 계속 비공개로 둔다.
create policy anon_read_market_snapshots_macro on market_snapshots
  for select to anon using (kind = 'macro');
