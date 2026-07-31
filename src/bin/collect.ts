import { runCollect } from '../collect.ts'

try {
  await runCollect()
} catch (e) {
  console.error('수집 실패:', (e as Error).message)
  process.exit(1)
}
