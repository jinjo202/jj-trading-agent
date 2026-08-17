-- 근거 카드 옆 미니 가격 차트(웹 대시보드)가 자산 종가 시계열을 읽어야 한다.
-- kind='prices'만 연다 -- 'features'·'macro'는 계속 비공개로 둔다(0001의 최소 노출 취지 유지).
create policy anon_read_market_snapshots_prices on market_snapshots
  for select to anon using (kind = 'prices');
