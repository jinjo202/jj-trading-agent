-- 섹터를 클릭하면 상위 보유종목이 펼쳐진다. 공개 시세·공시 기반이라 노출 민감도가 없다.
-- features는 계속 비공개로 둔다.
create policy anon_read_market_snapshots_holdings on market_snapshots
  for select to anon using (kind = 'holdings');
