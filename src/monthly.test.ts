import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NEUTRAL_ALT, NEUTRAL_BOND, NEUTRAL_EQUITY,
  buildImplementation, buildPositioning, diffVerdicts, stanceFromRelative, stanceMove,
} from './monthly.ts'
import type { DailyVerdict } from './types.ts'

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

function verdict(over: Partial<DailyVerdict> = {}): DailyVerdict {
  return {
    date: '2026-08-16',
    equity_score: 58,
    signal: 'hold',
    suggested_equity_weight: [57, 65],
    conviction: 'medium',
    drivers: [],
    counter_case: 'c',
    countries: [],
    sectors: [],
    picks: [],
    invalidation: ['x'],
    disclaimer: 'd',
    asset_allocation: {
      equity: [57, 65], bond: [22, 28], alt: [8, 13], cash: [3, 7], rationale: 'r',
      fixed_income: [
        { sleeve: '미국 국채 1-3년', ticker: 'SHY', weight_pct: 28, rationale: 'r' },
        { sleeve: '시니어론', ticker: 'BKLN', weight_pct: 22, rationale: 'r' },
        { sleeve: '미국 국채 20년+', ticker: 'TLT', weight_pct: 50, rationale: 'r' },
      ],
      duration: { stance: 'short', rationale: 'r' },
      alternatives: [{ sleeve: '금', ticker: 'GLD', weight_pct: 100, rationale: 'r' }],
    },
    markets: [
      { code: 'US', stance: 'N', weight_pct: 62, conviction: 'medium', headline: 'h', rationale: 'r', key_risk: 'k', desk_reads: [] },
      { code: 'KR', stance: 'UW', weight_pct: 4, conviction: 'low', headline: 'h', rationale: 'r', key_risk: 'k', desk_reads: [] },
      { code: 'JP', stance: 'OW', weight_pct: 10, conviction: 'medium', headline: 'h', rationale: 'r', key_risk: 'k', desk_reads: [] },
      { code: 'EU', stance: 'OW', weight_pct: 13, conviction: 'medium', headline: 'h', rationale: 'r', key_risk: 'k', desk_reads: [] },
      { code: 'EM', stance: 'N', weight_pct: 11, conviction: 'low', headline: 'h', rationale: 'r', key_risk: 'k', desk_reads: [] },
    ],
    ...over,
  }
}

test('중립 배분은 세 sleeve 모두 합이 정확히 100이다', () => {
  assert.equal(sum(NEUTRAL_EQUITY), 100)
  assert.equal(sum(NEUTRAL_BOND), 100)
  assert.equal(sum(NEUTRAL_ALT), 100)
})

test('stanceFromRelative는 문턱 밖에서만 OW/UW를 준다', () => {
  assert.equal(stanceFromRelative(5), 'OW')
  assert.equal(stanceFromRelative(-5), 'UW')
  assert.equal(stanceFromRelative(1.5), 'N', '반올림 노이즈를 스탠스로 승격시키지 않는다')
  assert.equal(stanceFromRelative(-2), 'N', '문턱은 초과여야 한다')
})

test('stanceMove는 방향을 알아보고 없던 항목은 new로 둔다', () => {
  assert.equal(stanceMove('UW', 'N'), 'up')
  assert.equal(stanceMove('OW', 'N'), 'down')
  assert.equal(stanceMove('N', 'N'), 'same')
  assert.equal(stanceMove(undefined, 'OW'), 'new')
})

// 전술 배분에서 빠진 티커가 표에서 사라지면 "뺐다"는 가장 중요한 정보를 잃는다.
test('구현표는 전술 배분에 없는 중립 티커도 0%로 싣는다', () => {
  const rows = buildImplementation({ SHY: 10, LQD: 25 }, { SHY: 40 }, { SHY: '단기국채', LQD: 'IG' })
  const lqd = rows.find((r) => r.ticker === 'LQD')!
  assert.equal(lqd.tactical_pct, 0)
  assert.equal(lqd.relative_pct, -25, '중립에 있던 만큼 전부 뺀 것으로 나와야 한다')
  const shy = rows.find((r) => r.ticker === 'SHY')!
  assert.equal(shy.relative_pct, 30)
})

test('첫 리포트(전월 없음)는 변화 목록이 비고 포지셔닝은 전부 new다', () => {
  const changes = diffVerdicts(verdict(), null)
  assert.deepEqual(changes, [])
  const pos = buildPositioning(verdict(), null)
  assert.ok(pos.length > 0)
  assert.ok(pos.every((r) => r.change === 'new'), '비교 대상이 없으면 전부 new')
  assert.ok(pos.every((r) => r.prev_weight_pct === null))
})

test('diffVerdicts는 시장 스탠스 변화를 from/to와 함께 잡는다', () => {
  const prev = verdict({
    markets: verdict().markets!.map((m) => (m.code === 'JP' ? { ...m, stance: 'N', weight_pct: 6 } : m)),
  })
  const changes = diffVerdicts(verdict(), prev)
  const jp = changes.find((c) => c.area.includes('일본'))!
  assert.ok(jp, '일본 스탠스 변화가 잡혀야 한다')
  assert.equal(jp.from, 'N 6%')
  assert.equal(jp.to, 'OW 10%')
  assert.equal(jp.reason, '', 'reason은 모델이 채우도록 비워 둔다')
})

test('diffVerdicts는 듀레이션 스탠스 전환을 잡는다', () => {
  const prev = verdict()
  prev.asset_allocation!.duration = { stance: 'long', rationale: 'r' }
  const changes = diffVerdicts(verdict(), prev)
  const d = changes.find((c) => c.area === '듀레이션')!
  assert.ok(d)
  assert.equal(d.from, 'long')
  assert.equal(d.to, 'short')
})

test('diffVerdicts는 fx_view 방향 전환을 잡고 크기와 무관하게 강조한다', () => {
  const now = verdict({
    fx_view: {
      dxy: { direction: 'bearish', confidence: 'medium', rationale: 'r' },
      usdkrw: { direction: 'neutral', confidence: 'low', rationale: 'r' },
    },
  })
  const prev = verdict({
    fx_view: {
      dxy: { direction: 'bullish', confidence: 'medium', rationale: 'r' },
      usdkrw: { direction: 'neutral', confidence: 'low', rationale: 'r' },
    },
  })
  const changes = diffVerdicts(now, prev)
  const dxy = changes.find((c) => c.area === '달러(DXY)')!
  assert.ok(dxy, 'dxy 방향이 bullish->bearish로 바뀌었으므로 잡혀야 한다')
  assert.equal(dxy.from, 'bullish')
  assert.equal(dxy.to, 'bearish')
  assert.equal(dxy.material, true)
  assert.equal(changes.find((c) => c.area === '원달러'), undefined, '방향이 안 바뀐 usdkrw는 안 잡혀야 한다')
})

test('diffVerdicts는 sleeve 미세조정(3%p 미만)은 변화로 보지 않는다', () => {
  const prev = verdict()
  prev.asset_allocation!.fixed_income = [
    { sleeve: '미국 국채 1-3년', ticker: 'SHY', weight_pct: 30, rationale: 'r' },  // 28 vs 30 = 2%p
    { sleeve: '시니어론', ticker: 'BKLN', weight_pct: 20, rationale: 'r' },        // 22 vs 20 = 2%p
    { sleeve: '미국 국채 20년+', ticker: 'TLT', weight_pct: 50, rationale: 'r' },
  ]
  const changes = diffVerdicts(verdict(), prev)
  assert.equal(changes.filter((c) => c.area.startsWith('채권')).length, 0)
})

test('diffVerdicts는 sleeve에서 완전히 빠진 자산을 0%로 잡는다', () => {
  const prev = verdict()
  prev.asset_allocation!.alternatives = [
    { sleeve: '금', ticker: 'GLD', weight_pct: 60, rationale: 'r' },
    { sleeve: '상장 PE', ticker: 'PSP', weight_pct: 40, rationale: 'r' },
  ]
  const changes = diffVerdicts(verdict(), prev)
  const psp = changes.find((c) => c.area.includes('상장 PE'))!
  assert.ok(psp, '빠진 자산도 변화로 잡혀야 한다')
  assert.equal(psp.from, '40%')
  assert.equal(psp.to, '0%')
})

// 강조 문턱은 일간 잡음 실측(스탠스 52%가 매일 뒤집힘, 비중 하루 1.2-2.0%p)에서 나왔다.
// 스탠스 전환만으로 강조하면 화면이 온통 노란색이 되어 강조의 의미가 사라진다.
test('작은 비중 이동을 동반한 스탠스 전환은 감지하되 강조하지 않는다', () => {
  const prev = verdict({
    markets: verdict().markets!.map((m) => (m.code === 'US' ? { ...m, stance: 'OW', weight_pct: 64 } : m)),
  })
  // US: OW 64% -> N 62% = 스탠스는 바뀌었지만 2%p 이동
  const c = diffVerdicts(verdict(), prev).find((x) => x.area.includes('미국'))!
  assert.ok(c, '스탠스가 바뀌었으므로 감지는 되어야 한다')
  assert.equal(c.material, false, '2%p 이동은 일간 잡음 수준이라 강조하지 않는다')
})

test('문턱을 넘는 비중 이동은 강조한다', () => {
  const prev = verdict({
    markets: verdict().markets!.map((m) => (m.code === 'US' ? { ...m, stance: 'OW', weight_pct: 70 } : m)),
  })
  // US: 70% -> 62% = 8%p
  const c = diffVerdicts(verdict(), prev).find((x) => x.area.includes('미국'))!
  assert.equal(c.material, true)
})

test('듀레이션 전환과 신호 전환은 크기와 무관하게 강조한다', () => {
  const prev = verdict({ signal: 'increase' })
  prev.asset_allocation!.duration = { stance: 'long', rationale: 'r' }
  const changes = diffVerdicts(verdict(), prev)
  assert.equal(changes.find((c) => c.area === '듀레이션')!.material, true)
  assert.equal(changes.find((c) => c.area === '종합 신호')!.material, true)
})

test('buildPositioning은 채권 비중을 중립 대비 스탠스로 바꾼다', () => {
  const pos = buildPositioning(verdict(), null)
  // TLT 전술 50% vs 중립 10% -> 크게 OW
  const tlt = pos.find((r) => r.group === '채권' && r.name.includes('20년+'))!
  assert.equal(tlt.stance, 'OW')
  assert.equal(tlt.weight_pct, 50)
  // LQD는 전술에 없다 -> 0% vs 중립 25% -> UW
  const lqd = pos.find((r) => r.group === '채권' && r.name.includes('IG'))!
  assert.equal(lqd.stance, 'UW')
  assert.equal(lqd.weight_pct, 0)
})
