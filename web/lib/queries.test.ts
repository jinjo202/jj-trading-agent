import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historyPoint } from './queries.ts'
import type { DailyVerdict } from './types.ts'

const verdict = (equity_score: number): DailyVerdict => ({
  date: '2026-07-31', equity_score, signal: 'hold', suggested_equity_weight: [60, 65],
  conviction: 'medium', drivers: [], counter_case: 'c', countries: [], sectors: [],
  picks: [], invalidation: ['i'], disclaimer: 'd',
})

test('historyPoint는 {date, verdict}를 {date, score}로 요약한다', () => {
  assert.deepEqual(historyPoint({ date: '2026-07-31', verdict: verdict(68) }), { date: '2026-07-31', score: 68 })
})
