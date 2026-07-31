import { mkdir, writeFile } from 'node:fs/promises'
import { readLatestSnapshot } from '../db.ts'
import { fetchKrEconomyNews, fetchSymbolNews } from '../sources/news.ts'
import { buildBundleA } from '../prepare.ts'
import type { FeatureSet, NewsItem } from '../types.ts'

try {
  const snap = await readLatestSnapshot('features')
  if (!snap) throw new Error('features 스냅샷이 없습니다. 먼저 `npm run collect`를 실행하세요.')
  const features = snap.payload as FeatureSet

  // 지수 뉴스는 SPY/QQQ, 한국 매크로는 연합뉴스. 실패해도 번들은 만든다.
  const market: NewsItem[] = []
  for (const sym of ['SPY', 'QQQ']) {
    try {
      market.push(...(await fetchSymbolNews(sym, 6)))
    } catch (e) {
      console.error(`뉴스 ${sym} 실패: ${(e as Error).message}`)
    }
  }
  let korea: NewsItem[] = []
  try {
    korea = await fetchKrEconomyNews(15)
  } catch (e) {
    console.error(`연합뉴스 실패: ${(e as Error).message}`)
  }

  const bundle = buildBundleA(features, market, korea)
  await mkdir(`runs/${bundle.date}`, { recursive: true })
  await writeFile(`runs/${bundle.date}/bundle-a.json`, JSON.stringify(bundle, null, 2))
  console.log(
    `A단계 번들: runs/${bundle.date}/bundle-a.json (뉴스 미국 ${market.length}, 한국 ${korea.length}, 결측 ${features.missing.length})`,
  )
  if (features.missing.length > 0) console.log(`스냅샷 결측: ${features.missing.join(', ')}`)
} catch (e) {
  console.error('A단계 준비 실패:', (e as Error).message)
  process.exit(1)
}
