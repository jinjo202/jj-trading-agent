import { readFile } from 'node:fs/promises'
import {
  markRequestsFulfilled, writeAgentReports, writeCompanyReports, writeDailyVerdict,
} from '../db.ts'
import { splitOutputs } from '../publish.ts'

const date = process.argv[2]
if (!date) {
  console.error('사용법: npm run publish:run -- YYYY-MM-DD')
  process.exit(1)
}

try {
  // A단계 agent 출력과 B단계 출력을 합쳐서 발행한다.
  const a = JSON.parse(await readFile(`runs/${date}/agents-a.json`, 'utf8')) as unknown
  const b = JSON.parse(await readFile(`runs/${date}/agents-b.json`, 'utf8')) as Record<string, unknown>
  if (!Array.isArray(a)) throw new Error(`agents-a.json의 최상위가 배열이 아닙니다`)
  if (b.agents !== undefined && !Array.isArray(b.agents)) {
    throw new Error(`agents-b.json의 agents 필드가 배열이 아닙니다`)
  }
  const merged = { ...b, agents: [...a, ...(Array.isArray(b.agents) ? b.agents : [])] }

  const { agents, verdict, reports } = splitOutputs(merged)
  if (verdict.date !== date) {
    throw new Error(`verdict.date(${verdict.date})가 실행 날짜(${date})와 다릅니다`)
  }

  await writeAgentReports(date, agents)
  await writeDailyVerdict(verdict)
  await writeCompanyReports(reports)
  await markRequestsFulfilled(reports.map((r) => ({ ticker: r.ticker, market: r.market })))

  console.log(
    `발행 완료 ${date}: agent ${agents.length}건, verdict 1건(published=false), 기업리포트 ${reports.length}건`,
  )
} catch (e) {
  console.error('발행 실패:', (e as Error).message)
  process.exit(1)
}
