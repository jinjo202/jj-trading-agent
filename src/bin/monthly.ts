import { readFile } from 'node:fs/promises'
import { askValidated } from '../llm.ts'
import {
  kstDate, readEarliestVerdictInMonth, readMonthlyReportAsOf, readVerdictOnOrBefore,
  setMonthlyPublished, writeMonthlyReport,
} from '../db.ts'
import { validateMonthlyNarrative } from '../schema.ts'
import { DISCLAIMER } from '../prepare.ts'
import {
  ALT_LABELS, BOND_LABELS, NEUTRAL_ALT, NEUTRAL_BOND,
  buildEquityImplementation, buildImplementation, buildPositioning, diffVerdicts,
} from '../monthly.ts'
import type { MonthlyReport, SleeveSplit } from '../types.ts'

/** 'YYYY-MM'의 마지막 날. 그 달의 마지막 판단을 집기 위한 상한이다. */
function endOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const byTicker = (rows: SleeveSplit[] | undefined): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const r of rows ?? []) out[r.ticker] = (out[r.ticker] ?? 0) + r.weight_pct
  return out
}

/** 정상 조기 종료 신호. 에러가 아니므로 catch에서 걸러 exit 0으로 끝낸다. */
const SKIP = Symbol('skip')

const args = process.argv.slice(2)
const autoPublish = args.includes('--publish')
// 스케줄러는 매일 깨어나므로 이미 만든 달은 조용히 넘어가야 한다. 그래야 어느 날
// 실행되든 한 달에 한 번만 만들고, PC가 1일에 꺼져 있었어도 나중에 스스로 채운다.
const ifMissing = args.includes('--if-missing')
const month = args.find((a) => !a.startsWith('--')) ?? kstDate().slice(0, 7)

try {
  console.log(`=== 월간 리포트 ${month} ===`)

  const latest = await readVerdictOnOrBefore(endOfMonth(month))
  // 이 달 안의 판단이어야 한다. 그 전 달 것이 잡히면 리포트가 아니라 착각이다.
  const now = latest && latest.date.startsWith(month) ? latest : null

  if (!now) {
    const detail = latest ? ` (가장 최근: ${latest.date})` : ''
    // 스케줄러 모드에서는 실패가 아니다. 그 달에 판단이 하나도 없는 것은
    // "아직 만들 게 없다"이지 고장이 아니며, 실패로 처리하면 다음 달 1일까지
    // 매일 거짓 알림이 울린다. 수동 실행은 그대로 시끄럽게 실패한다.
    if (ifMissing) {
      console.log(`${month}에 일간 판단이 없습니다 — 건너뜁니다${detail}`)
      throw SKIP
    }
    throw new Error(`${month}의 일간 판단이 없습니다${detail}`)
  }

  // 존재 여부가 아니라 **최신성**으로 판단한다. 월중에 만든 리포트는 그 시점까지만
  // 담고 있으므로, 그 뒤에 판단이 더 쌓였으면 다시 만들어야 그 달을 온전히 덮는다.
  // process.exit(0)으로 빠져나가지 않는 이유: Supabase 소켓이 열린 채 종료하면
  // Windows에서 libuv assertion이 stderr에 찍히고, 매일 도는 작업이라 그 노이즈가
  // 로그에 쌓여 진짜 실패를 가린다.
  if (ifMissing) {
    const existingAsOf = await readMonthlyReportAsOf(month)
    if (existingAsOf && existingAsOf >= now.date) {
      console.log(`이미 ${existingAsOf}까지 반영돼 있습니다 — 건너뜁니다 (--if-missing)`)
      throw SKIP
    }
    if (existingAsOf) console.log(`기존 리포트는 ${existingAsOf}까지 — ${now.date}로 다시 만듭니다`)
  }

  // 1순위는 전월 마지막 판단. 없으면(첫 리포트) 이 달 첫 판단과 비교한다 —
  // 무엇과 비교했는지는 prev_basis로 남겨 화면이 "전월 대비"로 잘못 쓰지 않게 한다.
  let prev = await readVerdictOnOrBefore(endOfMonth(prevMonth(month)))
  let prevBasis: MonthlyReport['prev_basis'] = prev ? 'previous-month' : null
  if (!prev) {
    const first = await readEarliestVerdictInMonth(month)
    if (first && first.date !== now.date) {
      prev = first
      prevBasis = 'month-start'
    }
  }
  console.log(
    `기준 ${now.date} / 비교 ${prev?.date ?? '없음'}` +
    (prevBasis === 'month-start' ? ' (전월 없음 — 이 달 첫 판단과 비교)' : ''),
  )

  // 숫자는 전부 코드가 만든다. 모델은 이유만 채운다.
  const positioning = buildPositioning(now.verdict, prev?.verdict ?? null)
  const changes = diffVerdicts(now.verdict, prev?.verdict ?? null)
  console.log(`포지셔닝 ${positioning.length}줄, 전월 대비 변화 ${changes.length}건`)

  const alloc = now.verdict.asset_allocation
  const implementation: MonthlyReport['implementation'] = [
    { sleeve: 'equity', label: '주식 · 지역', rows: buildEquityImplementation(now.verdict) },
    {
      sleeve: 'bond',
      label: '채권',
      rows: buildImplementation(NEUTRAL_BOND, byTicker(alloc?.fixed_income), BOND_LABELS),
    },
    {
      sleeve: 'alt',
      label: '대체자산',
      rows: buildImplementation(NEUTRAL_ALT, byTicker(alloc?.alternatives), ALT_LABELS),
    },
  ]

  const body = await read('prompts/monthly.md')
  const readme = await read('prompts/README.md')
  const narrative = await askValidated(
    'monthly',
    [
      '너는 투자 리서치 파이프라인의 agent다. 아래 규칙과 지시를 따라 **JSON 하나만** 출력한다.',
      '코드펜스, 설명 문장, 앞뒤 인사말을 붙이지 마라.',
      '\n# 공통 규칙\n', readme,
      '\n# 이번 agent의 지시\n', body,
      `\n# 추가 지시\n이번 달은 ${month}이고 기준 판단일은 ${now.date}다.`,
      changes.length === 0
        ? ' 전월 대비 변화 목록이 비어 있으므로 changes는 반드시 빈 배열 []로 낸다.'
        : ` changes는 정확히 ${changes.length}개이며 area를 그대로 복사해야 한다.`,
      '\n# 입력\n```json\n',
      JSON.stringify({ now: now.verdict, prev: prev?.verdict ?? null, changes, positioning }),
      '\n```',
    ].join(''),
    (raw) => validateMonthlyNarrative(raw, changes.map((c) => c.area)),
  )

  // 모델이 준 reason을 코드가 만든 변화에 되붙인다. from/to는 코드 값을 그대로 쓴다.
  const reasonOf = new Map(narrative.changes.map((c) => [c.area, c.reason]))
  const report: MonthlyReport = {
    month,
    generated_at: new Date().toISOString(),
    as_of: now.date,
    prev_as_of: prev?.date ?? null,
    prev_basis: prevBasis,
    outlook: narrative.outlook,
    themes: narrative.themes,
    positioning,
    changes: changes.map((c) => ({ ...c, reason: reasonOf.get(c.area) ?? '' })),
    implementation,
    key_risks: narrative.key_risks,
    disclaimer: DISCLAIMER,
  }

  await writeMonthlyReport(report)
  if (autoPublish) {
    await setMonthlyPublished(month, true)
    console.log('공개 완료 (--publish)')
  }
  console.log(
    `=== 완료 ${month}: 테마 ${report.themes.length}, 변화 ${report.changes.length}, 리스크 ${report.key_risks.length} ===`,
  )
  if (!autoPublish) console.log('published=false 상태입니다. 공개하려면 --publish로 실행하세요.')
} catch (e) {
  // SKIP은 "만들 게 없다"는 정상 종료다. 실패로 세면 스케줄러가 알림을 쏜다.
  if (e !== SKIP) {
    console.error('월간 리포트 실패:', (e as Error).message)
    process.exit(1)
  }
}

async function read(p: string): Promise<string> {
  return readFile(p, 'utf8')
}
