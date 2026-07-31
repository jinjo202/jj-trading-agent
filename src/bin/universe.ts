import { writeFile, mkdir } from 'node:fs/promises'
import { buildUniverse } from '../universe.ts'
import { upsertUniverse } from '../db.ts'

try {
  const rows = await buildUniverse()
  const kr = rows.filter((r) => r.market === 'KR').length
  const noSector = rows.filter((r) => r.sector === null).length
  await mkdir('data', { recursive: true })
  await writeFile('data/universe.json', JSON.stringify(rows, null, 2))
  await upsertUniverse(rows)
  console.log(`유니버스 ${rows.length}종목 (KR ${kr}, US ${rows.length - kr}), 섹터 없음 ${noSector}`)
} catch (e) {
  console.error('유니버스 갱신 실패:', (e as Error).message)
  process.exit(1)
}
