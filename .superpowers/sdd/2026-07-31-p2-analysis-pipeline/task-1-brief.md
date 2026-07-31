### Task 1: 뉴스 소스 모듈

**Files:**
- Create: `src/sources/news.ts`
- Test: `src/sources/news.test.ts`
- Modify: `src/sources/smoke.ts` (뉴스 체크 2개 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `types.ts`에 `export type NewsItem = { title: string; url: string; date: string | null; source: string }`
  - `news.ts`: `parseRss(xml: string, source: string): NewsItem[]`, `fetchSymbolNews(symbol: string, limit?: number): Promise<NewsItem[]>`, `fetchKrEconomyNews(limit?: number): Promise<NewsItem[]>`

- [ ] **Step 1: `src/types.ts` 끝에 타입 추가**

```ts
export type NewsItem = {
  title: string
  url: string
  date: string | null   // ISO. pubDate 파싱 실패 시 null
  source: string        // 'yahoo:AAPL', 'yonhap' 등 출처 식별자
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`parseRss`가 순수 함수라 네트워크 없이 검증한다. 아래 픽스처는 실제 두 피드에서 관찰된 형태다 —
Yahoo는 제목이 평문, 연합뉴스는 CDATA로 감싸여 있고, 항목 순서와 개행이 불규칙하다.

`src/sources/news.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRss } from './news.ts'

const YAHOO = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Yahoo Finance</title>
<item>
  <title>Apple beats on iPhone demand</title>
  <link>https://finance.yahoo.com/news/apple-1.html</link>
  <pubDate>Thu, 30 Jul 2026 13:05:00 +0000</pubDate>
</item>
<item>
  <title>Chip supply tightens &amp; prices rise</title>
  <link>https://finance.yahoo.com/news/chips-2.html</link>
  <pubDate>Thu, 30 Jul 2026 11:00:00 +0000</pubDate>
</item>
</channel></rss>`

const YONHAP = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title><![CDATA[연합뉴스 경제]]></title>
<item><title><![CDATA[일본은행, 기준금리 동결…1% 유지]]></title>
<link>https://www.yna.co.kr/view/AKR1.html</link>
<pubDate>Thu, 31 Jul 2026 09:20:00 +0900</pubDate></item>
</channel></rss>`

test('parseRss는 채널 제목을 항목으로 착각하지 않는다', () => {
  const items = parseRss(YAHOO, 'yahoo:AAPL')
  assert.equal(items.length, 2)
  assert.equal(items[0].title, 'Apple beats on iPhone demand')
})

test('parseRss는 CDATA를 벗겨낸다', () => {
  const items = parseRss(YONHAP, 'yonhap')
  assert.equal(items[0].title, '일본은행, 기준금리 동결…1% 유지')
})

test('parseRss는 XML 엔티티를 디코드한다', () => {
  const items = parseRss(YAHOO, 'yahoo:AAPL')
  assert.equal(items[1].title, 'Chip supply tightens & prices rise')
})

test('parseRss는 pubDate를 ISO로 정규화하고 실패 시 null', () => {
  const items = parseRss(YAHOO, 'yahoo:AAPL')
  assert.equal(items[0].date, '2026-07-30T13:05:00.000Z')

  const noDate = parseRss(
    `<rss><channel><item><title>x</title><link>http://e.com/a</link></item></channel></rss>`,
    's',
  )
  assert.equal(noDate[0].date, null)
})

test('parseRss는 source를 모든 항목에 붙인다', () => {
  for (const i of parseRss(YAHOO, 'yahoo:AAPL')) assert.equal(i.source, 'yahoo:AAPL')
})

test('parseRss는 title이나 link가 없는 항목을 버린다', () => {
  const broken = `<rss><channel>
    <item><link>http://e.com/a</link></item>
    <item><title>제목만</title></item>
    <item><title>정상</title><link>http://e.com/c</link></item>
  </channel></rss>`
  const items = parseRss(broken, 's')
  assert.equal(items.length, 1)
  assert.equal(items[0].title, '정상')
})

test('parseRss는 item이 없으면 빈 배열', () => {
  assert.deepEqual(parseRss('<rss><channel></channel></rss>', 's'), [])
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './news.ts'`

- [ ] **Step 4: 구현**

`src/sources/news.ts`:

```ts
import type { NewsItem } from '../types.ts'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'",
}

// CDATA를 벗기고 XML 엔티티를 디코드한다.
function decode(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  const text = cdata ? cdata[1] : raw
  return text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m] ?? m).trim()
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m ? decode(m[1]) : null
}

// RSS 2.0만 다룬다. 두 피드 모두 <item> 기반이라 XML 파서 의존성이 필요 없다.
export function parseRss(xml: string, source: string): NewsItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? []
  const items: NewsItem[] = []
  for (const b of blocks) {
    const title = tag(b, 'title')
    const url = tag(b, 'link')
    if (!title || !url) continue
    const pub = tag(b, 'pubDate')
    const parsed = pub ? new Date(pub) : null
    items.push({
      title,
      url,
      date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      source,
    })
  }
  return items
}

async function fetchFeed(url: string, source: string, limit: number): Promise<NewsItem[]> {
  const res = await fetch(url, { headers: { 'user-agent': BROWSER_UA } })
  if (!res.ok) throw new Error(`RSS ${source} HTTP ${res.status}`)
  return parseRss(await res.text(), source).slice(0, limit)
}

// Yahoo 종목별 헤드라인. 한국 티커(`005930.KS`)도 같은 엔드포인트로 동작한다.
export function fetchSymbolNews(symbol: string, limit = 8): Promise<NewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`
  return fetchFeed(url, `yahoo:${symbol}`, limit)
}

export function fetchKrEconomyNews(limit = 15): Promise<NewsItem[]> {
  return fetchFeed('https://www.yna.co.kr/rss/economy.xml', 'yonhap', limit)
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 기존 21개 + 뉴스 7개 = 28개

- [ ] **Step 6: 스모크 체크에 뉴스 추가**

`src/sources/smoke.ts`의 import에 `import { fetchKrEconomyNews, fetchSymbolNews } from './news.ts'`를 추가하고,
`checks` 배열에 두 항목을 기존 항목과 같은 모양으로 넣는다:

```ts
  ['news yahoo 005930.KS', async () => (await fetchSymbolNews('005930.KS', 3)).length],
  ['news yonhap economy', async () => (await fetchKrEconomyNews(3)).length],
```

- [ ] **Step 7: 라이브 확인**

```bash
npm run smoke
```

Expected: 뉴스 2개 항목이 `OK ... 3`. FRED는 키가 있으면 OK, 없으면 기존과 같은 실패.

- [ ] **Step 8: 타입체크 + 커밋**

```bash
npm run typecheck
```

```bash
git add src/types.ts src/sources/news.ts src/sources/news.test.ts src/sources/smoke.ts
git commit -m "feat: add RSS news source for both markets"
```

---

