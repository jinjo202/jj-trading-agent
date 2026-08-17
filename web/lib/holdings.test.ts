import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastTwoQuartersYoy } from './holdings.ts'

// 오래된 것부터 6분기: idx0=1년전전분기 ... idx5=최신분기
const sixQuarters = [
  { period: '2024-09-30', operatingIncome: 100 },
  { period: '2024-12-31', operatingIncome: 110 },
  { period: '2025-03-31', operatingIncome: 90 },
  { period: '2025-06-30', operatingIncome: 120 },
  { period: '2025-09-30', operatingIncome: 130 }, // idx0의 1년 후 → 최근 두 분기 중 하나의 전년 동기
  { period: '2025-12-31', operatingIncome: 121 }, // idx1의 1년 후
]

test('6분기가 있으면 최근 두 분기 모두 전년 동기 YoY를 계산한다', () => {
  const rows = lastTwoQuartersYoy(sixQuarters)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].period, '2025-09-30')
  assert.equal(rows[0].priorPeriod, '2024-09-30')
  assert.ok(Math.abs(rows[0].yoyPct! - 30) < 1e-9) // 130/100 - 1 = 30%
  assert.equal(rows[1].period, '2025-12-31')
  assert.equal(rows[1].priorPeriod, '2024-12-31')
  assert.ok(Math.abs(rows[1].yoyPct! - 10) < 1e-9) // 121/110 - 1 = 10%
})

test('4분기뿐이면 전년 동기가 없어 yoyPct는 null이지만 현재 값은 보여준다', () => {
  const rows = lastTwoQuartersYoy(sixQuarters.slice(-4))
  assert.equal(rows.length, 2)
  assert.equal(rows[1].operatingIncome, 121)
  assert.equal(rows[1].priorPeriod, null)
  assert.equal(rows[1].yoyPct, null)
})

test('전년 동기가 적자(0 이하)면 증가율이 뜻을 왜곡하므로 null로 둔다', () => {
  const withLoss = sixQuarters.map((q, i) => (i === 0 ? { ...q, operatingIncome: -50 } : q))
  const rows = lastTwoQuartersYoy(withLoss)
  assert.equal(rows[0].priorOperatingIncome, -50)
  assert.equal(rows[0].yoyPct, null, '적자에서의 회복을 퍼센트로 왜곡해 보여주면 안 된다')
})

test('빈 배열은 빈 결과를 낸다', () => {
  assert.deepEqual(lastTwoQuartersYoy([]), [])
})

test('분기 하나뿐이면 그 하나만 낸다(YoY 없이)', () => {
  const rows = lastTwoQuartersYoy([{ period: '2026-03-31', operatingIncome: 50 }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].yoyPct, null)
})
