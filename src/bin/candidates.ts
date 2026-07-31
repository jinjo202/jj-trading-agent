import { readFile, writeFile } from 'node:fs/promises'
import { readOpenReportRequests, readUniverse } from '../db.ts'
import { fetchDaily, fetchFundamentals } from '../sources/yahoo.ts'
import { fetchSymbolNews } from '../sources/news.ts'
import {
  computeTech, fetchQuotes, filterByLiquidity, rankByMomentum, scoreCandidates,
} from '../screener.ts'
import { buildBundleB, owSectorsFrom } from '../prepare.ts'
import { validateAgentOutput } from '../schema.ts'
import type { BundleA, Fundamentals, NewsItem } from '../types.ts'

const date = process.argv[2]
if (!date) {
  console.error('사용법: npm run candidates -- YYYY-MM-DD')
  process.exit(1)
}

try {
  const bundleA = JSON.parse(await readFile(`runs/${date}/bundle-a.json`, 'utf8')) as BundleA
  const raw = JSON.parse(await readFile(`runs/${date}/agents-a.json`, 'utf8')) as unknown[]
  const agents = raw.map(validateAgentOutput)

  const ow = owSectorsFrom(agents)
  if (ow.length === 0) throw new Error('country_sector agent가 OW 섹터를 하나도 남기지 않았습니다')
  console.log(`OW 섹터: ${ow.join(', ')}`)

  const universe = await readUniverse(ow)
  if (universe.length === 0) {
    throw new Error(
      `universe 테이블에 OW 섹터(${ow.join(', ')}) 종목이 하나도 없습니다. ` +
      `npm run universe로 유니버스를 먼저 채우세요.`,
    )
  }
  const quotes = await fetchQuotes(universe.map((u) => u.ticker))
  const liquid = filterByLiquidity(universe, quotes, 0.5)
  const top24 = rankByMomentum(liquid, 24)
  console.log(`유니버스 ${universe.length} → 유동성 ${liquid.length} → 모멘텀 상위 ${top24.length}`)

  // 펀더멘털은 24종목만 부른다. 여기가 호출 수가 늘어나는 유일한 지점이다.
  const funds = new Map<string, Fundamentals>()
  for (const p of top24) {
    try {
      funds.set(p.row.ticker, await fetchFundamentals(p.row.ticker))
    } catch (e) {
      console.error(`펀더멘털 ${p.row.ticker} 실패: ${(e as Error).message}`)
    }
  }

  const candidates = scoreCandidates(top24, funds, 12)
  if (candidates.length === 0) {
    throw new Error('유동성/모멘텀 필터를 통과한 후보가 없습니다. 스크리닝 조건을 확인하세요.')
  }

  // 확정된 12종목만 일봉을 받아 기술적 지표를 코드가 계산한다.
  for (const c of candidates) {
    try {
      c.tech = computeTech(await fetchDaily(c.ticker))
    } catch (e) {
      console.error(`일봉 ${c.ticker} 실패: ${(e as Error).message}`)
    }
  }

  const news: Record<string, NewsItem[]> = {}
  for (const c of candidates) {
    try {
      news[c.ticker] = await fetchSymbolNews(c.ticker, 5)
    } catch (e) {
      console.error(`뉴스 ${c.ticker} 실패: ${(e as Error).message}`)
      news[c.ticker] = []
    }
  }

  const requested = (await readOpenReportRequests(5)).map((r) => ({ ticker: r.ticker, market: r.market }))
  const bundle = buildBundleB(bundleA, agents, candidates, news, requested)
  await writeFile(`runs/${date}/bundle-b.json`, JSON.stringify(bundle, null, 2))
  console.log(
    `B단계 번들: runs/${date}/bundle-b.json (후보 ${candidates.length}, 요청 리포트 ${requested.length})`,
  )
} catch (e) {
  console.error('후보 선정 실패:', (e as Error).message)
  process.exit(1)
}
