import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { askValidated } from '../llm.ts'
import { kstDate, setPublished } from '../db.ts'
import { validateAgentOutput, validateCompanyReport, validateDailyVerdict, validateDeskOutput } from '../schema.ts'
import { DESKS } from '../types.ts'
import type { AgentOutput, BundleA, BundleB, CompanyReport, DailyVerdict } from '../types.ts'

/** npm 스크립트를 그대로 돌린다. 실패하면 즉시 멈춘다 — 부분 결과를 발행하지 않는다. */
function sh(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`$ npm ${args.join(' ')}`)
    const c = spawn('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' })
    c.on('error', reject)
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} 실패 (코드 ${code})`))))
  })
}

const read = (p: string) => readFile(p, 'utf8')

/** 공통 규칙 + 해당 프롬프트 + 번들을 한 덩어리로 만든다. 모델은 이것만 보고 JSON을 낸다. */
function buildPrompt(readme: string, promptBody: string, bundle: unknown, extra = ''): string {
  return [
    '너는 투자 리서치 파이프라인의 agent다. 아래 규칙과 지시를 따라 **JSON 하나만** 출력한다.',
    '코드펜스, 설명 문장, 앞뒤 인사말을 붙이지 마라.',
    '\n# 공통 규칙\n', readme,
    '\n# 이번 agent의 지시\n', promptBody,
    extra ? `\n# 추가 지시\n${extra}` : '',
    '\n# 입력 번들 (이 안의 숫자만 쓴다)\n```json\n', JSON.stringify(bundle), '\n```',
  ].join('')
}

// --publish를 주면 발행 직후 공개까지 한다. 기본값은 공개하지 않는 것이다 —
// 사람이 안 본 판단이 사이트에 올라가는 것은 명시적으로 켜야 하는 동작이다.
const args = process.argv.slice(2)
const autoPublish = args.includes('--publish')
const date = args.find((a) => !a.startsWith('--')) ?? kstDate()

try {
  console.log(`=== 일일 실행 ${date} ===`)

  // 1-2. 수집과 번들 생성은 결정론적이라 LLM이 필요 없다.
  await sh(['run', 'collect'])
  await sh(['run', 'prepare:bundle'])

  const readme = await read('prompts/README.md')
  const bundleA = JSON.parse(await read(`runs/${date}/bundle-a.json`)) as BundleA

  // 3. 데스크 6개. 순차 실행 — 동시에 6개를 띄우면 rate limit에 걸린다.
  const deskOutputs: AgentOutput[] = []
  for (const desk of DESKS) {
    console.log(`데스크 ${desk} 실행...`)
    const body = await read(`prompts/${desk}.md`)
    const out = await askValidated(desk, buildPrompt(readme, body, bundleA), validateDeskOutput)
    deskOutputs.push(out)
    console.log(`  ${desk}: ${out.markets?.map((m) => `${m.market}:${m.stance}`).join(' ')}`)
  }
  await writeFile(`runs/${date}/agents-a.json`, JSON.stringify(deskOutputs, null, 2))

  // 4. 후보 스크리닝(결정론적). sector 데스크의 OW 섹터가 여기서 쓰인다.
  await sh(['run', 'candidates', '--', date])
  const bundleB = JSON.parse(await read(`runs/${date}/bundle-b.json`)) as BundleB

  // 5. 반대의견 → CIO 순서. CIO는 반대의견을 반드시 봐야 하므로 병렬로 돌리면 안 된다.
  console.log('counter 실행...')
  const counter = await askValidated(
    'counter',
    buildPrompt(readme, await read('prompts/counter.md'), bundleB),
    validateAgentOutput,
  )

  console.log('cio 실행...')
  const cioBundle = { ...bundleB, counter }
  const verdict = await askValidated(
    'cio',
    buildPrompt(readme, await read('prompts/cio.md'), cioBundle,
      `date는 반드시 "${date}"여야 한다.`),
    validateDailyVerdict,
  )
  console.log(`  CIO: ${verdict.signal} / ${verdict.equity_score}점 / ${verdict.markets?.map((m) => `${m.code} ${m.weight_pct}%`).join(' ')}`)

  // 6. 기업 리포트. 스냅샷이 있는 픽만 만든다 — 없는 숫자로 리포트를 채우지 않는다.
  const reportBody = await read('prompts/company_report.md')
  const reports: CompanyReport[] = []
  for (const pick of verdict.picks.slice(0, 5)) {
    const snapshot = bundleB.company_snapshots[pick.ticker]
    if (!snapshot) {
      console.error(`  기업 리포트 건너뜀 ${pick.ticker}: 스냅샷 없음`)
      continue
    }
    console.log(`기업 리포트 ${pick.ticker}...`)
    try {
      reports.push(await askValidated(
        `company_report:${pick.ticker}`,
        buildPrompt(readme, reportBody, {
          date,
          ticker: pick.ticker,
          pick,
          snapshot,
          news: bundleB.candidate_news[pick.ticker] ?? [],
          disclaimer: bundleB.disclaimer,
        }, `이 종목(${pick.ticker}) 하나에 대한 CompanyReport를 낸다. snapshot은 주어진 값을 그대로 복사한다.`),
        validateCompanyReport,
      ))
    } catch (e) {
      // 리포트 하나가 실패해도 하우스뷰 발행은 막지 않는다. 종목 페이지만 비게 된다.
      console.error(`  기업 리포트 실패 ${pick.ticker}: ${(e as Error).message.slice(0, 200)}`)
    }
  }

  await writeFile(
    `runs/${date}/agents-b.json`,
    JSON.stringify({ agents: [counter], verdict, company_reports: reports }, null, 2),
  )

  // 7. 발행. published=false로 저장되므로 사람이 확인 후 공개한다.
  await sh(['run', 'publish:run', '--', date])

  if (autoPublish) {
    await setPublished(date, true)
    console.log('공개 완료 (--publish) — 사이트에 바로 반영됩니다.')
  }

  console.log(`=== 완료 ${date}: 데스크 ${deskOutputs.length}, 기업리포트 ${reports.length} ===`)
  if (!autoPublish) {
    console.log('published=false 상태입니다. 공개하려면 --publish로 실행하거나 DB에서 직접 바꾸세요.')
  }
} catch (e) {
  console.error('일일 실행 실패:', (e as Error).message)
  process.exit(1)
}
