# P2 — 분석 파이프라인 (agent 프롬프트 + 스크리너 + `/daily` 러너) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P1이 저장한 스냅샷을 입력으로 LLM agent 7개 + 반대의견을 돌려 `daily_verdicts` 1행과 `company_reports` 여러 행을 만드는 파이프라인을 만든다. LLM은 파일을 읽고 파일을 쓰며, DB 접근과 숫자 계산은 전부 코드가 한다.

**Architecture:** LLM을 파이프라인 한가운데의 **파일 단계**로 격리한다. `prepare`가 스냅샷·후보·뉴스를 번들 JSON으로 조립 → LLM이 번들을 읽고 결과 JSON을 씀 → `publish`가 스키마 검증 후 DB에 씀. 종목 후보는 `country_sector` agent의 OW 섹터가 정해진 뒤에야 좁힐 수 있으므로 LLM 단계가 두 번(A: agent 1-5, B: fundamental/반대의견/종합/기업리포트)이고, 그 사이에 결정론적 스크리너가 낀다. 이 구조 덕에 P2 코드는 LLM 없이 전부 테스트된다.

**Tech Stack:** Node 24 (타입 스트리핑 직접 실행, `node --test`, `--env-file`), `yahoo-finance2@4`, `@supabase/supabase-js`, Supabase Postgres, Claude Code 슬래시 커맨드.

## Global Constraints

- 런타임: Node 24. TypeScript를 트랜스파일 없이 `node`로 직접 실행한다. `enum`, `namespace`, 생성자 파라미터 프로퍼티 금지. 타입 전용 import는 `import type`.
- 테스트 러너는 Node 내장 `node:test` + `node:assert/strict`.
- **의존성을 추가하지 않는다.** 프로덕션 의존성은 `yahoo-finance2`와 `@supabase/supabase-js` 둘뿐이다. RSS 파싱에 XML 라이브러리를 넣지 않고, 스키마 검증에 zod를 넣지 않는다.
- Yahoo 데이터는 `yahoo-finance2` 라이브러리 경유만. raw HTTP 금지 (`Invalid Crumb`).
- 결측값은 `null`. 0이나 추정치로 채우지 않는다. 백분위·z-score에서 `null`은 제외한다.
- **숫자는 코드가 계산하고 LLM은 해석만 한다.** LLM 출력에 숫자가 있다면 그것은 입력 번들에 있던 숫자를 인용한 것이어야 한다. `evidence[].source`가 비어 있는 agent 출력은 검증에서 거부한다.
- LLM 출력은 신뢰 경계다. `AgentOutput` / `DailyVerdict` / `CompanyReport`는 DB에 쓰기 전 런타임 검증한다.
- `service_role` 키는 `.env`에만 존재하고 커밋되지 않는다. 어떤 파일·로그·리포트에도 키 값을 출력하지 않는다.
- 일일 LLM 호출 예산 13회: 분석 agent 6 + 반대의견 1 + 종합 1 + 기업 리포트 5.
- 주문 실행 코드 경로를 만들지 않는다. 이 시스템은 리서치 도구다.
- 모든 최종 산출물에 `disclaimer`와 `invalidation`이 있어야 한다. 백테스트 성능을 주장하지 않는다.
- Supabase 프로젝트 `jsxhcqnupvvctnjiaric`. 기존 테이블 `todos`/`daily_market`/`credit_split_raw`/`analysis_snapshot`/`ai_commentary`/`lending_balance_raw`는 다른 앱 소유이므로 건드리지 않는다.

---

## 설계서에서 바뀐 것 — 실측으로 확인한 사항

계획을 세우기 전에 설계서 §4가 전제한 것들을 실제로 호출해 봤다. 두 가지가 사실과 달랐다.

| 설계서 전제 | 실측 결과 | 이 계획의 결정 |
|---|---|---|
| 한국 뉴스 = 네이버 뉴스 MCP (세션에 연결됨) | **이 세션에 그런 MCP 서버가 없다.** 연결된 서버는 Supabase / Notion / shadcn / Chrome / semble / Vercel뿐 | MCP를 쓰지 않는다. 뉴스도 코드가 `fetch`로 가져온다 |
| 미국 뉴스 = RSS (미검증) | Yahoo 종목별 헤드라인 RSS `feeds.finance.yahoo.com/rss/2.0/headline?s=<SYMBOL>` 가 **한·미 양쪽 모두 200 + 20건**. `AAPL`도 `005930.KS`도 동작 | **뉴스 소스를 하나로 통일.** 종목 뉴스는 전부 이 엔드포인트 |
| — | 연합뉴스 경제 RSS `yna.co.kr/rss/economy.xml` 200, 120건, CDATA 제목 | 한국 매크로 뉴스로 사용 |
| — | 한국경제 RSS 403, CNBC RSS는 item 0건 | 사용하지 않음 |
| 유니버스 = KOSPI200 + S&P500 정적 JSON | S&P500: `raw.githubusercontent.com/datasets/s-and-p-500-companies` CSV 200, 503행, **GICS 섹터 포함**. KOSPI200: 네이버 `finance.naver.com/sise/entryJongmok.naver?page=N` 200, 6자리 코드 추출됨 | 두 소스로 분기마다 정적 JSON 생성 |
| 스크리닝 비용 | `yahoo-finance2`의 `quote(symbols[])`가 **배치 호출**. 5종목 1.2초에 `marketCap`, `averageDailyVolume3Month`, `fiftyTwoWeekChangePercent`, `currency` 반환 | 1단 스크리닝은 종목당 차트 호출 없이 배치 시세만으로 한다. 700종목이 배치 14회 |

**LLM 실행 방식도 바꿨다.** 설계서 §11은 "Claude Code가 스냅샷을 읽고 agent를 돌린 뒤 Supabase MCP로 결과를 쓴다"고 했다.
대신 **파일 경유**로 한다: `prepare`가 번들 파일을 쓰고, LLM이 그 파일만 읽고 결과 파일을 쓰고, `publish`가 검증 후 DB에 쓴다.
이유는 세 가지다. (a) LLM이 DB에 직접 쓰면 스키마 검증 단계가 사라진다 — 설계서 §14가 요구하는 신뢰 경계가 없어진다.
(b) 번들과 출력이 파일로 남아 그날의 판단을 그대로 재현·감사할 수 있다.
(c) v2(`claude -p` 헤드리스)로 승급할 때 같은 파일 계약을 그대로 쓴다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/sources/news.ts` | Yahoo 종목 RSS + 연합뉴스 경제 RSS. 의존성 없는 RSS 파서 |
| `src/universe.ts` | S&P500 CSV + KOSPI200 구성종목 → 정규화된 유니버스. GICS→Yahoo 섹터 매핑 |
| `src/bin/universe.ts` | 유니버스 갱신 CLI (분기 1회). `data/universe.json` + `universe` 테이블 |
| `src/screener.ts` | 1단 결정론적 스크리너. 유동성 필터 → 모멘텀 랭킹 → 퀄리티 결합 → 상위 12 |
| `src/screener.test.ts` | 스크리너 단위 테스트 (네트워크 없음) |
| `src/schema.ts` | `AgentOutput`/`DailyVerdict`/`CompanyReport` 런타임 검증 |
| `src/schema.test.ts` | 정상·비정상 페이로드 검증 테스트 |
| `src/prepare.ts` | A/B 두 단계 번들 조립 |
| `src/prepare.test.ts` | 번들 조립 테스트 (고정 입력) |
| `src/bin/prepare.ts` | A단계 번들 CLI |
| `src/bin/candidates.ts` | A단계 출력 → 스크리너 → B단계 번들 CLI |
| `src/publish.ts` | 검증 후 `agent_reports`/`daily_verdicts`/`company_reports` 쓰기 |
| `src/bin/publish.ts` | 발행 CLI |
| `src/db.ts` (수정) | 스냅샷 읽기, 유니버스 읽기/쓰기, 리포트 요청 큐 읽기/완료 표시 |
| `src/types.ts` (수정) | `AgentOutput`, `DailyVerdict`, `CompanyReport`, `Bundle*` 타입 추가 |
| `prompts/*.md` | agent 프롬프트 9개 |
| `.claude/commands/daily.md` | `/daily` 슬래시 커맨드 |
| `runs/<date>/*.json` | 번들과 LLM 출력. git 무시 |

파이프라인 전체:

```
npm run prepare      코드   최신 스냅샷 + 지수 뉴스 → runs/<date>/bundle-a.json
   ↓
LLM 단계 A           6회   agent macro/allocation/country_sector/technical/news
                            → runs/<date>/agents-a.json
   ↓
npm run candidates   코드   agents-a의 OW 섹터 → 배치 시세 → 유동성·모멘텀·퀄리티 랭킹
                            → 후보 12 + 후보 뉴스 → runs/<date>/bundle-b.json
   ↓
LLM 단계 B           7회   fundamental / 반대의견 / synthesizer / 기업리포트 5
                            → runs/<date>/agents-b.json
   ↓
npm run publish      코드   스키마 검증 → agent_reports, daily_verdicts, company_reports
```

---

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

  const badDate = parseRss(
    `<rss><channel><item><title>x</title><link>http://e.com/a</link><pubDate>어제쯤</pubDate></item></channel></rss>`,
    's',
  )
  assert.equal(badDate[0].date, null, '파싱 불가한 pubDate는 null이지 "Invalid Date"가 아니다')
})

test('parseRss는 숫자 엔티티도 디코드한다', () => {
  const xml = `<rss><channel><item>
    <title>Apple&#8217;s Q3 &#x2014; chips &amp; margins</title>
    <link>http://e.com/a</link>
  </item></channel></rss>`
  assert.equal(parseRss(xml, 's')[0].title, 'Apple’s Q3 — chips & margins')
})

test('parseRss는 self-closing atom link의 href를 쓴다', () => {
  const xml = `<rss><channel><item>
    <title>기사</title>
    <link rel="alternate" type="text/html" href="https://e.com/x"/>
  </item></channel></rss>`
  assert.equal(parseRss(xml, 's')[0].url, 'https://e.com/x')
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
  '&nbsp;': ' ',
}

// 뉴스 제목에는 &#8217;(오른쪽 작은따옴표), &#x2014;(em dash) 같은 숫자 엔티티가 흔하다.
// 디코드하지 않으면 그 문자열이 그대로 LLM 프롬프트에 들어간다.
function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
}

// CDATA를 벗기고 XML 엔티티를 디코드한다.
function decode(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return decodeEntities(cdata ? cdata[1] : raw).trim()
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m ? decode(m[1]) : null
}

// atom 스타일 `<link rel="alternate" href="..."/>`는 닫는 태그가 없어 tag()로 안 잡힌다.
// 그대로 두면 해당 항목이 조용히 버려지므로 href를 폴백으로 읽는다.
function link(block: string): string | null {
  const paired = tag(block, 'link')
  if (paired) return paired
  const selfClosing = block.match(/<link[^>]*\shref=["']([^"']+)["'][^>]*\/?>/)
  return selfClosing ? decode(selfClosing[1]) : null
}

// RSS 2.0만 다룬다. 두 피드 모두 <item> 기반이라 XML 파서 의존성이 필요 없다.
export function parseRss(xml: string, source: string): NewsItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? []
  const items: NewsItem[] = []
  for (const b of blocks) {
    const title = tag(b, 'title')
    const url = link(b)
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

Expected: PASS — 기존 21개 + 뉴스 9개 = 30개

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

### Task 2: 유니버스 구축

**Files:**
- Create: `src/universe.ts`
- Test: `src/universe.test.ts`
- Create: `src/bin/universe.ts`
- Modify: `src/db.ts` (유니버스 읽기/쓰기 추가)
- Modify: `package.json` (`universe` 스크립트)

**Interfaces:**
- Consumes: `db.ts`의 `db()`
- Produces:
  - `types.ts`에 `export type UniverseRow = { ticker: string; market: 'KR' | 'US'; name: string; sector: string | null; active: boolean }`
  - `universe.ts`: `GICS_TO_YAHOO_SECTOR: Record<string, string>`, `SECTOR_BY_ETF: Record<string, string>`, `parseSp500Csv(csv: string): UniverseRow[]`, `parseKospi200Page(html: string): string[]`, `buildUniverse(): Promise<UniverseRow[]>`
  - `db.ts`: `upsertUniverse(rows: UniverseRow[]): Promise<void>`, `readUniverse(sectors?: string[]): Promise<UniverseRow[]>`

- [ ] **Step 1: 타입 추가**

`src/types.ts` 끝에:

```ts
export type UniverseRow = {
  ticker: string
  market: 'KR' | 'US'
  name: string
  sector: string | null
  active: boolean
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

두 파서가 이 태스크의 위험 지점이다. CSV는 따옴표 안에 쉼표가 들어 있고(`"Saint Paul, Minnesota"`),
HTML은 같은 종목 코드가 링크 여러 개에 중복 등장한다.

`src/universe.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GICS_TO_YAHOO_SECTOR, SECTOR_BY_ETF, parseKospi200Page, parseSp500Csv } from './universe.ts'

const CSV = `Symbol,Security,GICS Sector,GICS Sub-Industry,Headquarters Location,Date added,CIK,Founded
MMM,3M,Industrials,Industrial Conglomerates,"Saint Paul, Minnesota",1957-03-04,66740,1902
AAPL,Apple Inc.,Information Technology,"Technology Hardware, Storage & Peripherals","Cupertino, California",1982-11-30,320193,1976
BRK.B,Berkshire Hathaway,Financials,Multi-Sector Holdings,"Omaha, Nebraska",1999-02-16,1067983,1839
`

test('parseSp500Csv는 따옴표 안 쉼표에 속지 않는다', () => {
  const rows = parseSp500Csv(CSV)
  assert.equal(rows.length, 3)
  assert.equal(rows[1].ticker, 'AAPL')
  assert.equal(rows[1].name, 'Apple Inc.')
})

test('parseSp500Csv는 GICS 섹터를 Yahoo 어휘로 바꾼다', () => {
  const rows = parseSp500Csv(CSV)
  assert.equal(rows[1].sector, 'Technology')        // Information Technology
  assert.equal(rows[2].sector, 'Financial Services') // Financials
  assert.equal(rows[0].sector, 'Industrials')        // 그대로인 것도 있다
})

test('parseSp500Csv는 Yahoo 티커 표기로 정규화한다', () => {
  // S&P 리스트는 BRK.B, Yahoo는 BRK-B
  assert.equal(parseSp500Csv(CSV)[2].ticker, 'BRK-B')
})

test('parseSp500Csv 결과는 전부 US이고 active', () => {
  for (const r of parseSp500Csv(CSV)) {
    assert.equal(r.market, 'US')
    assert.equal(r.active, true)
  }
})

test('parseKospi200Page는 6자리 코드를 중복 없이 뽑는다', () => {
  const html = `
    <a href="/item/main.naver?code=005930">삼성전자</a>
    <a href="/item/main.naver?code=005930">삼성전자</a>
    <a href="/item/main.naver?code=000660">SK하이닉스</a>
    <a href="/sise/sise_index.naver?code=KPI200">코스피200</a>
  `
  assert.deepEqual(parseKospi200Page(html), ['005930', '000660'])
})

test('GICS 매핑은 11개 섹터를 모두 덮고 ETF 매핑과 같은 어휘를 쓴다', () => {
  const yahooSectors = new Set(Object.values(GICS_TO_YAHOO_SECTOR))
  const etfSectors = new Set(Object.values(SECTOR_BY_ETF))
  assert.equal(etfSectors.size, 11)
  for (const s of etfSectors) {
    assert.ok(yahooSectors.has(s), `ETF 섹터 ${s}가 GICS 매핑 결과에 없다`)
  }
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './universe.ts'`

- [ ] **Step 4: `src/universe.ts` 구현**

```ts
import { fetchFundamentals } from './sources/yahoo.ts'
import type { UniverseRow } from './types.ts'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

// 섹터 어휘는 Yahoo `summaryProfile.sector`로 통일한다.
// 한국 종목은 Yahoo가 직접 이 어휘로 주고, 미국은 GICS라서 매핑이 필요하다.
export const GICS_TO_YAHOO_SECTOR: Record<string, string> = {
  'Information Technology': 'Technology',
  'Financials': 'Financial Services',
  'Health Care': 'Healthcare',
  'Consumer Discretionary': 'Consumer Cyclical',
  'Consumer Staples': 'Consumer Defensive',
  'Communication Services': 'Communication Services',
  'Industrials': 'Industrials',
  'Energy': 'Energy',
  'Utilities': 'Utilities',
  'Materials': 'Basic Materials',
  'Real Estate': 'Real Estate',
}

// P1의 SECTOR_ETFS와 같은 11개 ETF. 섹터 ETF 상대모멘텀을 종목 섹터와 잇는 다리.
export const SECTOR_BY_ETF: Record<string, string> = {
  XLK: 'Technology',
  XLF: 'Financial Services',
  XLE: 'Energy',
  XLV: 'Healthcare',
  XLI: 'Industrials',
  XLY: 'Consumer Cyclical',
  XLP: 'Consumer Defensive',
  XLU: 'Utilities',
  XLB: 'Basic Materials',
  XLRE: 'Real Estate',
  XLC: 'Communication Services',
}

// 따옴표로 감싼 필드 안의 쉼표를 존중하는 최소 CSV 분해기.
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ }
      else quoted = !quoted
    } else if (c === ',' && !quoted) {
      out.push(cur); cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

export function parseSp500Csv(csv: string): UniverseRow[] {
  const lines = csv.trim().split(/\r?\n/)
  const header = splitCsvLine(lines[0])
  const iSym = header.indexOf('Symbol')
  const iName = header.indexOf('Security')
  const iSector = header.indexOf('GICS Sector')
  const rows: UniverseRow[] = []
  for (const line of lines.slice(1)) {
    const f = splitCsvLine(line)
    const sym = f[iSym]?.trim()
    if (!sym) continue
    rows.push({
      ticker: sym.replace(/\./g, '-'), // BRK.B -> BRK-B (Yahoo 표기)
      market: 'US',
      name: f[iName]?.trim() ?? sym,
      sector: GICS_TO_YAHOO_SECTOR[f[iSector]?.trim()] ?? null,
      active: true,
    })
  }
  return rows
}

export function parseKospi200Page(html: string): string[] {
  const codes = html.match(/code=(\d{6})/g) ?? []
  return [...new Set(codes.map((c) => c.slice(5)))]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchPageCodes(page: number): Promise<string[]> {
  const res = await fetch(
    `https://finance.naver.com/sise/entryJongmok.naver?&page=${page}`,
    { headers: { 'user-agent': BROWSER_UA, referer: 'https://finance.naver.com/' } },
  )
  if (!res.ok) throw new Error(`KOSPI200 page ${page} HTTP ${res.status}`)
  return parseKospi200Page(await res.text())
}

// 페이지당 종목 수를 고정값으로 가정하지 않는다 — 실측 결과 페이지당 약 10종목이고,
// 네이버가 언제든 바꿀 수 있다.
// 다만 "빈 페이지 = 목록 끝"은 rate limit이나 차단 페이지와 구분되지 않는다.
// 그래서 빈 페이지는 한 번 재시도하고, 최종 수집량이 비상식적으로 적으면 조용히 끝내지 않고 던진다.
// 유니버스가 절반만 채워진 채로 통과하는 것이 이 함수의 가장 나쁜 실패다.
async function fetchKospi200Codes(): Promise<string[]> {
  const all = new Set<string>()
  for (let page = 1; page <= 30; page++) {
    let codes = await fetchPageCodes(page)
    if (codes.length === 0) {
      await sleep(1000)
      codes = await fetchPageCodes(page)
      if (codes.length === 0) break
    }
    for (const c of codes) all.add(c)
    await sleep(300)
  }
  if (all.size < 150) {
    throw new Error(`KOSPI200 구성종목이 ${all.size}개뿐입니다. 절반이 누락된 채로 진행하지 않습니다`)
  }
  return [...all]
}

export async function buildUniverse(): Promise<UniverseRow[]> {
  const res = await fetch(
    'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv',
    { headers: { 'user-agent': BROWSER_UA } },
  )
  if (!res.ok) throw new Error(`S&P500 CSV HTTP ${res.status}`)
  const us = parseSp500Csv(await res.text())

  // 한국은 이름·섹터가 없으므로 종목당 quoteSummary를 한 번씩 부른다.
  // 분기 1회 실행이라 200회 순차 호출을 감수한다.
  const kr: UniverseRow[] = []
  for (const code of await fetchKospi200Codes()) {
    const ticker = `${code}.KS`
    try {
      const f = await fetchFundamentals(ticker)
      kr.push({
        ticker,
        market: 'KR',
        name: f.name ?? code,
        sector: f.sector,
        active: true,
      })
    } catch (e) {
      console.error(`유니버스 ${ticker} 조회 실패: ${(e as Error).message}`)
    }
  }
  return [...us, ...kr]
}
```

- [ ] **Step 5: `src/db.ts`에 유니버스 접근 추가**

기존 export는 그대로 두고 아래를 덧붙인다:

```ts
import type { UniverseRow } from './types.ts'

export async function upsertUniverse(rows: UniverseRow[]): Promise<void> {
  // Supabase는 한 번에 큰 배열도 받지만 500행씩 끊어 타임아웃을 피한다.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db()
      .from('universe')
      .upsert(rows.slice(i, i + 500), { onConflict: 'ticker,market' })
    if (error) throw new Error(`universe upsert 실패: ${error.message}`)
  }
}

export async function readUniverse(sectors?: string[]): Promise<UniverseRow[]> {
  let q = db().from('universe').select('ticker,market,name,sector,active').eq('active', true)
  if (sectors && sectors.length > 0) q = q.in('sector', sectors)
  const { data, error } = await q
  if (error) throw new Error(`universe 읽기 실패: ${error.message}`)
  return (data ?? []) as UniverseRow[]
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 30 + 유니버스 6 = 36개

- [ ] **Step 7: CLI 작성**

`src/bin/universe.ts`:

```ts
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
```

`package.json`의 `scripts`에 추가:

```json
    "universe": "node --env-file=.env src/bin/universe.ts",
```

- [ ] **Step 8: 실제 유니버스 구축**

```bash
npm run universe
```

Expected: `유니버스 700종목 내외 (KR 200 전후, US 500 전후), 섹터 없음 <20`.
한국 200종목의 순차 조회 때문에 3-6분 걸린다. `섹터 없음`이 50을 넘으면 Yahoo 응답 형태를 확인하고 원인을 보고한다.

- [ ] **Step 9: DB 확인**

Supabase MCP `execute_sql` (project_id `jsxhcqnupvvctnjiaric`):

```sql
select market, count(*) as n, count(sector) as with_sector from universe group by market;
select sector, count(*) from universe group by sector order by 2 desc;
```

Expected: KR/US 두 행. 섹터 목록이 `Technology`, `Financial Services` 등 Yahoo 어휘 11종 안에 들어온다.
`Information Technology` 같은 GICS 원문이 남아 있으면 매핑 누락이므로 고친다.

- [ ] **Step 10: 커밋**

`data/universe.json`은 커밋한다 — 설계서가 "리포지토리의 정적 JSON"으로 두라고 했고, DB가 비어도 재현 가능해야 한다.

```bash
git add src/types.ts src/universe.ts src/universe.test.ts src/bin/universe.ts src/db.ts package.json data/universe.json
git commit -m "feat: build KOSPI200 + S&P500 universe with unified sector vocabulary"
```

---

### Task 3: 1단 결정론적 스크리너

**Files:**
- Create: `src/screener.ts`
- Test: `src/screener.test.ts`

**Interfaces:**
- Consumes: `types.ts`의 `UniverseRow`, `Fundamentals`; `sources/yahoo.ts`의 `fetchFundamentals`; `indicators.ts`의 `zscore`
- Produces:
  - `types.ts`에 `export type QuoteRow = { symbol: string; price: number | null; marketCap: number | null; avgVolume3m: number | null; yearChangePct: number | null; currency: string | null }`
  - `types.ts`에 `export type Candidate = { ticker: string; name: string; market: 'KR' | 'US'; sector: string | null; turnover: number | null; yearChangePct: number | null; roe: number | null; operatingMargin: number | null; forwardPE: number | null; priceToBook: number | null; score: number }`
  - `screener.ts`: `fetchQuotes(symbols: string[]): Promise<QuoteRow[]>`, `filterByLiquidity(rows: UniverseRow[], quotes: QuoteRow[], keepFraction?: number): { row: UniverseRow; quote: QuoteRow }[]`, `rankByMomentum(pairs, topN): typeof pairs`, `scoreCandidates(pairs, funds: Map<string, Fundamentals>, topN?: number): Candidate[]`, `computeTech(bars: Ohlcv[]): CandidateTech`

- [ ] **Step 1: 타입 추가**

`src/types.ts` 끝에:

```ts
export type QuoteRow = {
  symbol: string
  price: number | null
  marketCap: number | null
  avgVolume3m: number | null
  yearChangePct: number | null
  currency: string | null
}

export type Candidate = {
  ticker: string
  name: string
  market: 'KR' | 'US'
  sector: string | null
  turnover: number | null        // price * avgVolume3m, 현지통화
  yearChangePct: number | null
  roe: number | null
  operatingMargin: number | null
  forwardPE: number | null
  priceToBook: number | null
  score: number                  // 모멘텀 z + 퀄리티 z 합
  tech: CandidateTech | null     // 후보 확정 후 일봉으로 계산해 채운다
}

export type CandidateTech = {
  distSma200: number | null
  distSma60: number | null
  rsi14: number | null
  macdHist: number | null
  week52Position: number | null
  realizedVol20: number | null
}
```

`tech`가 있는 이유: 최종 `DailyVerdict.picks[].scores.tech`를 LLM이 채워야 하는데,
번들에 종목 단위 기술적 지표가 없으면 그 숫자를 **지어내는 수밖에 없다**.
"숫자는 코드가 계산한다"는 원칙이 깨지는 지점이라 후보 12종목에 한해 코드가 계산해 넣는다.

- [ ] **Step 2: 실패하는 테스트 작성**

핵심 위험은 **통화 혼동**이다. KRW 거래대금은 USD보다 자릿수가 크므로 두 시장을 한 줄에 세워 자르면
한국 종목이 전부 살아남거나 전부 죽는다. 필터는 반드시 시장별로 따로 돌아야 한다.

`src/screener.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTech, filterByLiquidity, rankByMomentum, scoreCandidates } from './screener.ts'
import type { Fundamentals, QuoteRow, UniverseRow } from './types.ts'

const u = (ticker: string, market: 'KR' | 'US'): UniverseRow => ({
  ticker, market, name: ticker, sector: 'Technology', active: true,
})

const q = (
  symbol: string, price: number, vol: number, chg: number, currency: string,
): QuoteRow => ({
  symbol, price, marketCap: price * 1e6, avgVolume3m: vol,
  yearChangePct: chg, currency,
})

const f = (roe: number | null, margin: number | null): Fundamentals => ({
  symbol: 'x', name: null, sector: null, price: null, marketCap: null,
  forwardPE: 10, priceToBook: 1, roe, debtToEquity: null,
  revenueGrowth: null, operatingMargin: margin,
})

test('유동성 필터는 시장별로 따로 자른다', () => {
  // KRW 거래대금이 USD보다 압도적으로 크다. 한 줄로 세우면 US가 전멸한다.
  const rows = [u('A.KS', 'KR'), u('B.KS', 'KR'), u('C', 'US'), u('D', 'US')]
  const quotes = [
    q('A.KS', 100000, 1_000_000, 10, 'KRW'),  // 1e11
    q('B.KS', 50000, 100_000, 10, 'KRW'),     // 5e9
    q('C', 300, 50_000_000, 10, 'USD'),       // 1.5e10
    q('D', 20, 100_000, 10, 'USD'),           // 2e6
  ]
  const kept = filterByLiquidity(rows, quotes, 0.5).map((p) => p.row.ticker)
  assert.deepEqual(kept.sort(), ['A.KS', 'C'], '시장별 상위 절반이 남아야 한다')
})

test('유동성 필터는 가격이나 거래량이 null이면 제외한다', () => {
  const rows = [u('A', 'US'), u('B', 'US')]
  const quotes = [
    q('A', 10, 1000, 5, 'USD'),
    { ...q('B', 10, 1000, 5, 'USD'), avgVolume3m: null },
  ]
  assert.deepEqual(filterByLiquidity(rows, quotes, 1).map((p) => p.row.ticker), ['A'])
})

test('유동성 필터는 시세가 아예 없는 종목을 조용히 버리지 않고 제외한다', () => {
  const kept = filterByLiquidity([u('A', 'US'), u('GHOST', 'US')], [q('A', 10, 1000, 5, 'USD')], 1)
  assert.deepEqual(kept.map((p) => p.row.ticker), ['A'])
})

test('모멘텀 랭킹은 52주 수익률 내림차순 상위 N', () => {
  const rows = [u('A', 'US'), u('B', 'US'), u('C', 'US')]
  const quotes = [q('A', 10, 1e6, 5, 'USD'), q('B', 10, 1e6, 90, 'USD'), q('C', 10, 1e6, 40, 'USD')]
  const pairs = filterByLiquidity(rows, quotes, 1)
  assert.deepEqual(rankByMomentum(pairs, 2).map((p) => p.row.ticker), ['B', 'C'])
})

test('모멘텀이 null인 종목은 랭킹에서 빠진다', () => {
  const rows = [u('A', 'US'), u('B', 'US')]
  const quotes = [{ ...q('A', 10, 1e6, 5, 'USD'), yearChangePct: null }, q('B', 10, 1e6, 1, 'USD')]
  const pairs = filterByLiquidity(rows, quotes, 1)
  assert.deepEqual(rankByMomentum(pairs, 5).map((p) => p.row.ticker), ['B'])
})

test('스코어는 모멘텀과 퀄리티를 합치고, 퀄리티 결측은 그 항만 0으로 둔다', () => {
  const rows = [u('A', 'US'), u('B', 'US'), u('C', 'US')]
  const quotes = [q('A', 10, 1e6, 10, 'USD'), q('B', 10, 1e6, 50, 'USD'), q('C', 10, 1e6, 90, 'USD')]
  const pairs = rankByMomentum(filterByLiquidity(rows, quotes, 1), 3)
  const funds = new Map<string, Fundamentals>([
    ['A', f(0.30, 0.30)],
    ['B', f(0.05, 0.05)],
    ['C', f(null, null)],   // 결측: 퀄리티 항 없이 모멘텀만으로 평가
  ])
  const out = scoreCandidates(pairs, funds, 3)
  assert.equal(out.length, 3)
  assert.ok(out[0].score >= out[1].score && out[1].score >= out[2].score, '점수 내림차순')
  const c = out.find((x) => x.ticker === 'C')!
  assert.equal(c.roe, null, '결측은 null로 남고 0으로 채우지 않는다')
  assert.ok(Number.isFinite(c.score), '퀄리티 결측이 점수를 NaN으로 만들지 않는다')
})

test('scoreCandidates는 turnover를 현지통화 그대로 싣고 tech는 아직 null', () => {
  const pairs = filterByLiquidity([u('A.KS', 'KR')], [q('A.KS', 100000, 1000, 10, 'KRW')], 1)
  const out = scoreCandidates(pairs, new Map(), 1)
  assert.equal(out[0].turnover, 100000 * 1000)
  assert.equal(out[0].tech, null, 'tech는 후보 확정 뒤 일봉으로 따로 채운다')
})

test('computeTech는 상승 추세에서 이동평균 위, RSI 100', () => {
  // high/low를 종가와 같게 둬야 52주 밴드가 종가 범위와 일치한다 (P1에서 같은 함정을 겪었다)
  const bars = Array.from({ length: 300 }, (_, i) => {
    const c = 100 + i * 0.1
    return { date: `d${i}`, open: c, high: c, low: c, close: c, volume: 1000 }
  })
  const t = computeTech(bars)
  assert.ok(t.distSma200! > 0)
  assert.equal(t.rsi14, 100)
  assert.equal(t.week52Position, 1)
})

test('computeTech는 데이터가 짧으면 각 항을 null로 둔다', () => {
  const bars = Array.from({ length: 5 }, (_, i) => ({
    date: `d${i}`, open: 100, high: 100, low: 100, close: 100, volume: 1000,
  }))
  const t = computeTech(bars)
  assert.equal(t.distSma200, null)
  assert.equal(t.week52Position, null)
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './screener.ts'`

- [ ] **Step 4: 구현**

`src/screener.ts`:

```ts
import YahooFinance from 'yahoo-finance2'
import {
  distFromSma, macd, realizedVol, rsi, week52Position, zscore,
} from './indicators.ts'
import type {
  Candidate, CandidateTech, Fundamentals, Ohlcv, QuoteRow, UniverseRow,
} from './types.ts'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export type Pair = { row: UniverseRow; quote: QuoteRow }

// quote()는 배치 호출이다. 700종목이 50개씩 14번이면 끝나므로
// 종목당 차트 호출(수백 회)을 피할 수 있다.
export async function fetchQuotes(symbols: string[]): Promise<QuoteRow[]> {
  const out: QuoteRow[] = []
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50)
    try {
      const res = await yf.quote(chunk)
      for (const r of res) {
        out.push({
          symbol: r.symbol,
          price: num(r.regularMarketPrice),
          marketCap: num(r.marketCap),
          avgVolume3m: num(r.averageDailyVolume3Month),
          yearChangePct: num(r.fiftyTwoWeekChangePercent),
          currency: r.currency ?? null,
        })
      }
    } catch (e) {
      console.error(`시세 배치 실패 (${chunk[0]}...): ${(e as Error).message}`)
    }
  }
  return out
}

// 거래대금은 현지통화라 KRW와 USD를 같은 줄에 세울 수 없다. 반드시 시장별로 자른다.
export function filterByLiquidity(
  rows: UniverseRow[],
  quotes: QuoteRow[],
  keepFraction = 0.5,
): Pair[] {
  const bySymbol = new Map(quotes.map((q) => [q.symbol, q]))
  const withTurnover: { pair: Pair; turnover: number }[] = []
  for (const row of rows) {
    const quote = bySymbol.get(row.ticker)
    if (!quote || quote.price === null || quote.avgVolume3m === null) continue
    withTurnover.push({ pair: { row, quote }, turnover: quote.price * quote.avgVolume3m })
  }

  const kept: Pair[] = []
  for (const market of ['KR', 'US'] as const) {
    const inMarket = withTurnover
      .filter((x) => x.pair.row.market === market)
      .sort((a, b) => b.turnover - a.turnover)
    const n = Math.max(1, Math.ceil(inMarket.length * keepFraction))
    kept.push(...inMarket.slice(0, n).map((x) => x.pair))
  }
  return kept
}

export function rankByMomentum(pairs: Pair[], topN: number): Pair[] {
  return pairs
    .filter((p) => p.quote.yearChangePct !== null)
    .sort((a, b) => (b.quote.yearChangePct as number) - (a.quote.yearChangePct as number))
    .slice(0, topN)
}

// 모멘텀 z + ROE z + 영업이익률 z. 결측 항은 그 항만 0으로 두고 나머지로 평가한다.
// 결측을 평균값으로 대체하지 않는 것은 설계서의 null 정책과 같은 이유다.
export function scoreCandidates(
  pairs: Pair[],
  funds: Map<string, Fundamentals>,
  topN = 12,
): Candidate[] {
  const moms = pairs.map((p) => p.quote.yearChangePct)
  const roes = pairs.map((p) => funds.get(p.row.ticker)?.roe ?? null)
  const margins = pairs.map((p) => funds.get(p.row.ticker)?.operatingMargin ?? null)

  const candidates = pairs.map((p) => {
    const f = funds.get(p.row.ticker)
    const parts = [
      p.quote.yearChangePct === null ? null : zscore(moms, p.quote.yearChangePct),
      f?.roe == null ? null : zscore(roes, f.roe),
      f?.operatingMargin == null ? null : zscore(margins, f.operatingMargin),
    ]
    const score = parts.reduce<number>((a, z) => a + (z ?? 0), 0)
    return {
      ticker: p.row.ticker,
      name: p.row.name,
      market: p.row.market,
      sector: p.row.sector,
      turnover:
        p.quote.price === null || p.quote.avgVolume3m === null
          ? null
          : p.quote.price * p.quote.avgVolume3m,
      yearChangePct: p.quote.yearChangePct,
      roe: f?.roe ?? null,
      operatingMargin: f?.operatingMargin ?? null,
      forwardPE: f?.forwardPE ?? null,
      priceToBook: f?.priceToBook ?? null,
      score,
      tech: null,
    }
  })

  return candidates.sort((a, b) => b.score - a.score).slice(0, topN)
}

// 최종 후보 12종목에만 쓴다. 종목 단위 기술적 지표를 코드가 계산해 두어야
// synthesizer가 picks[].scores.tech를 지어내지 않는다.
export function computeTech(bars: Ohlcv[]): CandidateTech {
  const closes = bars.map((b) => b.close)
  const m = macd(closes)
  return {
    distSma200: distFromSma(closes, 200),
    distSma60: distFromSma(closes, 60),
    rsi14: rsi(closes, 14),
    macdHist: m ? m.hist : null,
    week52Position: week52Position(bars),
    realizedVol20: realizedVol(closes, 20),
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 36 + 스크리너 9 = 45개

- [ ] **Step 6: 라이브 배치 시세 확인**

```bash
node --env-file=.env --input-type=module -e "const s=await import('./src/screener.ts');const d=await import('./src/db.ts');const u=await d.readUniverse(['Technology']);console.log('universe tech',u.length);const t0=Date.now();const q=await s.fetchQuotes(u.map(r=>r.ticker));console.log('quotes',q.length,'in',Date.now()-t0,'ms');const kept=s.filterByLiquidity(u,q,0.5);console.log('after liquidity',kept.length);console.log(s.rankByMomentum(kept,5).map(p=>[p.row.ticker,p.quote.yearChangePct]))"
```

Expected: Technology 섹터 유니버스 수, 같은 수의 시세, 절반으로 줄어든 후보, 모멘텀 상위 5의 티커와 52주 수익률.
시세 개수가 유니버스보다 크게 적으면 어떤 티커가 빠졌는지 확인하고 보고한다.

- [ ] **Step 7: 커밋**

```bash
git add src/types.ts src/screener.ts src/screener.test.ts
git commit -m "feat: add deterministic stage-1 screener with per-market liquidity filter"
```

---

### Task 4: LLM 출력 스키마 검증

**Files:**
- Create: `src/schema.ts`
- Test: `src/schema.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `types.ts`에 `AgentOutput`, `DailyVerdict`, `CompanyReport` (설계서 §6.1 / §7 / §8.1 그대로)
  - `schema.ts`: `validateAgentOutput(v: unknown): AgentOutput`, `validateDailyVerdict(v: unknown): DailyVerdict`, `validateCompanyReport(v: unknown): CompanyReport`. 실패 시 어느 필드가 왜 틀렸는지 담은 `Error`를 던진다.

- [ ] **Step 1: 타입 추가**

`src/types.ts` 끝에 (설계서 §6.1, §7, §8.1과 동일):

```ts
export type AgentOutput = {
  agent: string
  score: number
  confidence: number
  signal: 'bullish' | 'neutral' | 'bearish'
  headline: string
  reasoning: string
  evidence: { label: string; value: string; source: string }[]
  flags: string[]
}

export type DailyVerdict = {
  date: string
  equity_score: number
  signal: 'increase' | 'hold' | 'reduce'
  suggested_equity_weight: [number, number]
  conviction: 'low' | 'medium' | 'high'
  drivers: { agent: string; direction: '+' | '-'; weight: number; point: string }[]
  counter_case: string
  countries: { code: 'KR' | 'US'; stance: 'OW' | 'N' | 'UW'; rationale: string }[]
  sectors: { name: string; stance: 'OW' | 'N' | 'UW'; etf: string; rationale: string }[]
  picks: {
    ticker: string; name: string; market: 'KR' | 'US'; sector: string
    thesis: string
    scores: { tech: number; fund: number; news: number }
    risk: string
  }[]
  invalidation: string[]
  disclaimer: string
}

export type CompanyReport = {
  ticker: string; name: string; market: 'KR' | 'US'; sector: string
  generated_at: string
  snapshot: {
    price: number; change_1d: number; change_1m: number; change_12m: number
    market_cap: number
    per: number | null; pbr: number | null; roe: number | null
    per_pctile_in_sector: number | null
    debt_to_equity: number | null
    week52: { high: number; low: number; position: number }
    revenue_trend: { period: string; value: number }[]
    op_margin_trend: { period: string; value: number }[]
  }
  business: string
  thesis: string[]
  bear_points: string[]
  catalysts: string[]
  technical_read: string
  news: { title: string; url: string; date: string; takeaway: string }[]
  verdict: { stance: 'positive' | 'neutral' | 'cautious'; one_liner: string; confidence: number }
  invalidation: string[]
  disclaimer: string
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

검증기의 값어치는 **거부**에 있다. 통과 케이스 하나보다 거부 케이스가 많아야 한다.

`src/schema.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAgentOutput, validateDailyVerdict } from './schema.ts'

const goodAgent = {
  agent: 'macro',
  score: 62,
  confidence: 0.7,
  signal: 'bullish',
  headline: '금리 인하 기대가 완만한 확장 국면을 지지',
  reasoning: '2s10s가 정상화됐고 HY 스프레드는 축소 중이다. 실업률은 안정적이다.',
  evidence: [
    { label: '2s10s', value: '0.70%p', source: 'features.macro.curve2s10s' },
    { label: 'HY 스프레드', value: '3.2%', source: 'features.macro.hySpread' },
  ],
  flags: ['CPI 발표 대기'],
}

test('정상 AgentOutput은 통과하고 같은 객체를 돌려준다', () => {
  assert.deepEqual(validateAgentOutput(goodAgent), goodAgent)
})

test('score가 0-100 밖이면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, score: 120 }), /score/)
  assert.throws(() => validateAgentOutput({ ...goodAgent, score: -1 }), /score/)
})

test('confidence가 0-1 밖이면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, confidence: 70 }), /confidence/)
})

test('signal이 허용값 밖이면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, signal: 'very bullish' }), /signal/)
})

test('evidence가 비어 있으면 거부 — 근거 없는 판단은 받지 않는다', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, evidence: [] }), /evidence/)
})

test('evidence 항목에 source가 없으면 거부', () => {
  const noSource = [{ label: '2s10s', value: '0.70%p' }]
  assert.throws(() => validateAgentOutput({ ...goodAgent, evidence: noSource }), /source/)
})

test('숫자 필드에 숫자 모양 문자열이 오면 거부', () => {
  assert.throws(() => validateAgentOutput({ ...goodAgent, score: '62' }), /score/)
})

test('객체가 아니면 거부', () => {
  assert.throws(() => validateAgentOutput(null), /object/)
  assert.throws(() => validateAgentOutput('{}'), /object/)
})

const goodVerdict = {
  date: '2026-07-31',
  equity_score: 68,
  signal: 'increase',
  suggested_equity_weight: [60, 70],
  conviction: 'medium',
  drivers: [{ agent: 'macro', direction: '+', weight: 0.3, point: '금리 정상화' }],
  counter_case: '밸류에이션이 이미 높고 브레드스가 좁다.',
  countries: [{ code: 'KR', stance: 'OW', rationale: '상대 밸류에이션 매력' }],
  sectors: [{ name: 'Technology', stance: 'OW', etf: 'XLK', rationale: '상대모멘텀 우위' }],
  picks: [{
    ticker: '005930.KS', name: '삼성전자', market: 'KR', sector: 'Technology',
    thesis: '메모리 사이클 회복', scores: { tech: 70, fund: 65, news: 60 }, risk: '수요 둔화',
  }],
  invalidation: ['HY 스프레드가 5%를 넘으면 이 논리는 깨진다'],
  disclaimer: '투자자문이 아닙니다.',
}

test('정상 DailyVerdict은 통과', () => {
  assert.deepEqual(validateDailyVerdict(goodVerdict), goodVerdict)
})

test('suggested_equity_weight는 [하한, 상한] 두 개여야 하고 하한 <= 상한', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, suggested_equity_weight: [70] }), /suggested_equity_weight/)
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, suggested_equity_weight: [70, 60] }), /suggested_equity_weight/)
})

test('invalidation이 비면 거부 — 반증 조건 없는 결론은 받지 않는다', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, invalidation: [] }), /invalidation/)
})

test('counter_case가 비면 거부 — 반대의견 단계는 필수다', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, counter_case: '   ' }), /counter_case/)
})

test('disclaimer가 없으면 거부', () => {
  const { disclaimer: _drop, ...noDisclaimer } = goodVerdict
  assert.throws(() => validateDailyVerdict(noDisclaimer), /disclaimer/)
})

test('date가 YYYY-MM-DD가 아니면 거부', () => {
  assert.throws(() => validateDailyVerdict({ ...goodVerdict, date: '2026/07/31' }), /date/)
})

test('픽의 market이 KR/US가 아니면 거부', () => {
  const bad = { ...goodVerdict, picks: [{ ...goodVerdict.picks[0], market: 'JP' }] }
  assert.throws(() => validateDailyVerdict(bad), /market/)
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './schema.ts'`

- [ ] **Step 4: 구현**

`src/schema.ts`:

```ts
import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

class Path {
  // ponytail: 문자열 경로를 손으로 잇는다. 검증기 하나 쓰자고 zod를 넣지 않는다.
  constructor(readonly at: string) {}
  child(key: string | number): Path {
    return new Path(typeof key === 'number' ? `${this.at}[${key}]` : `${this.at}.${key}`)
  }
  fail(msg: string): never {
    throw new Error(`${this.at}: ${msg}`)
  }
}

function obj(v: unknown, p: Path): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) p.fail('object가 아님')
  return v as Record<string, unknown>
}

function str(v: unknown, p: Path, { allowEmpty = false } = {}): string {
  if (typeof v !== 'string') p.fail(`문자열이어야 함 (받은 값: ${typeof v})`)
  if (!allowEmpty && (v as string).trim() === '') p.fail('비어 있으면 안 됨')
  return v as string
}

function numIn(v: unknown, p: Path, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) p.fail(`숫자여야 함 (받은 값: ${typeof v})`)
  const n = v as number
  if (n < lo || n > hi) p.fail(`${lo}-${hi} 범위여야 함 (받은 값: ${n})`)
  return n
}

function oneOf<T extends string>(v: unknown, p: Path, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    p.fail(`${allowed.join('|')} 중 하나여야 함 (받은 값: ${JSON.stringify(v)})`)
  }
  return v as T
}

function arr(v: unknown, p: Path, { min = 0 } = {}): unknown[] {
  if (!Array.isArray(v)) p.fail('배열이어야 함')
  const a = v as unknown[]
  if (a.length < min) p.fail(`최소 ${min}개 필요 (받은 개수: ${a.length})`)
  return a
}

function strArray(v: unknown, p: Path, { min = 0 } = {}): string[] {
  return arr(v, p, { min }).map((x, i) => str(x, p.child(i)))
}

function isoDate(v: unknown, p: Path): string {
  const s = str(v, p)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) p.fail(`YYYY-MM-DD 형식이어야 함 (받은 값: ${s})`)
  return s
}

export function validateAgentOutput(v: unknown): AgentOutput {
  const p = new Path('AgentOutput')
  const o = obj(v, p)
  return {
    agent: str(o.agent, p.child('agent')),
    score: numIn(o.score, p.child('score'), 0, 100),
    confidence: numIn(o.confidence, p.child('confidence'), 0, 1),
    signal: oneOf(o.signal, p.child('signal'), ['bullish', 'neutral', 'bearish'] as const),
    headline: str(o.headline, p.child('headline')),
    reasoning: str(o.reasoning, p.child('reasoning')),
    // 근거는 최소 1개. 출처 없는 숫자를 막는 장치라 비면 통과시키지 않는다.
    evidence: arr(o.evidence, p.child('evidence'), { min: 1 }).map((e, i) => {
      const ep = p.child('evidence').child(i)
      const eo = obj(e, ep)
      return {
        label: str(eo.label, ep.child('label')),
        value: str(eo.value, ep.child('value')),
        source: str(eo.source, ep.child('source')),
      }
    }),
    flags: strArray(o.flags, p.child('flags')),
  }
}

export function validateDailyVerdict(v: unknown): DailyVerdict {
  const p = new Path('DailyVerdict')
  const o = obj(v, p)

  const wp = p.child('suggested_equity_weight')
  const w = arr(o.suggested_equity_weight, wp)
  if (w.length !== 2) wp.fail(`[하한, 상한] 두 개여야 함 (받은 개수: ${w.length})`)
  const lo = numIn(w[0], wp.child(0), 0, 100)
  const hi = numIn(w[1], wp.child(1), 0, 100)
  if (lo > hi) wp.fail(`하한이 상한보다 큼 (${lo} > ${hi})`)

  return {
    date: isoDate(o.date, p.child('date')),
    equity_score: numIn(o.equity_score, p.child('equity_score'), 0, 100),
    signal: oneOf(o.signal, p.child('signal'), ['increase', 'hold', 'reduce'] as const),
    suggested_equity_weight: [lo, hi],
    conviction: oneOf(o.conviction, p.child('conviction'), ['low', 'medium', 'high'] as const),
    drivers: arr(o.drivers, p.child('drivers'), { min: 1 }).map((d, i) => {
      const dp = p.child('drivers').child(i)
      const dobj = obj(d, dp)
      return {
        agent: str(dobj.agent, dp.child('agent')),
        direction: oneOf(dobj.direction, dp.child('direction'), ['+', '-'] as const),
        weight: numIn(dobj.weight, dp.child('weight'), 0, 1),
        point: str(dobj.point, dp.child('point')),
      }
    }),
    counter_case: str(o.counter_case, p.child('counter_case')),
    countries: arr(o.countries, p.child('countries'), { min: 1 }).map((c, i) => {
      const cp = p.child('countries').child(i)
      const co = obj(c, cp)
      return {
        code: oneOf(co.code, cp.child('code'), ['KR', 'US'] as const),
        stance: oneOf(co.stance, cp.child('stance'), ['OW', 'N', 'UW'] as const),
        rationale: str(co.rationale, cp.child('rationale')),
      }
    }),
    sectors: arr(o.sectors, p.child('sectors'), { min: 1 }).map((s, i) => {
      const sp = p.child('sectors').child(i)
      const so = obj(s, sp)
      return {
        name: str(so.name, sp.child('name')),
        stance: oneOf(so.stance, sp.child('stance'), ['OW', 'N', 'UW'] as const),
        etf: str(so.etf, sp.child('etf')),
        rationale: str(so.rationale, sp.child('rationale')),
      }
    }),
    picks: arr(o.picks, p.child('picks')).map((k, i) => {
      const kp = p.child('picks').child(i)
      const ko = obj(k, kp)
      const scores = obj(ko.scores, kp.child('scores'))
      return {
        ticker: str(ko.ticker, kp.child('ticker')),
        name: str(ko.name, kp.child('name')),
        market: oneOf(ko.market, kp.child('market'), ['KR', 'US'] as const),
        sector: str(ko.sector, kp.child('sector')),
        thesis: str(ko.thesis, kp.child('thesis')),
        scores: {
          tech: numIn(scores.tech, kp.child('scores').child('tech'), 0, 100),
          fund: numIn(scores.fund, kp.child('scores').child('fund'), 0, 100),
          news: numIn(scores.news, kp.child('scores').child('news'), 0, 100),
        },
        risk: str(ko.risk, kp.child('risk')),
      }
    }),
    // 반증 조건 없는 결론은 받지 않는다 (설계서 §7).
    invalidation: strArray(o.invalidation, p.child('invalidation'), { min: 1 }),
    disclaimer: str(o.disclaimer, p.child('disclaimer')),
  }
}

export function validateCompanyReport(v: unknown): CompanyReport {
  const p = new Path('CompanyReport')
  const o = obj(v, p)
  const sp = p.child('snapshot')
  const s = obj(o.snapshot, sp)
  const wp = sp.child('week52')
  const w = obj(s.week52, wp)

  const nullableNum = (x: unknown, path: Path): number | null => {
    if (x === null) return null
    if (typeof x !== 'number' || !Number.isFinite(x)) path.fail('숫자 또는 null이어야 함')
    return x as number
  }
  const trend = (x: unknown, path: Path) =>
    arr(x, path).map((t, i) => {
      const tp = path.child(i)
      const to = obj(t, tp)
      if (typeof to.value !== 'number' || !Number.isFinite(to.value)) tp.child('value').fail('숫자여야 함')
      return { period: str(to.period, tp.child('period')), value: to.value as number }
    })

  return {
    ticker: str(o.ticker, p.child('ticker')),
    name: str(o.name, p.child('name')),
    market: oneOf(o.market, p.child('market'), ['KR', 'US'] as const),
    sector: str(o.sector, p.child('sector')),
    generated_at: str(o.generated_at, p.child('generated_at')),
    snapshot: {
      price: numIn(s.price, sp.child('price'), 0, Number.MAX_SAFE_INTEGER),
      change_1d: numIn(s.change_1d, sp.child('change_1d'), -1, 10),
      change_1m: numIn(s.change_1m, sp.child('change_1m'), -1, 100),
      change_12m: numIn(s.change_12m, sp.child('change_12m'), -1, 1000),
      market_cap: numIn(s.market_cap, sp.child('market_cap'), 0, Number.MAX_SAFE_INTEGER),
      per: nullableNum(s.per, sp.child('per')),
      pbr: nullableNum(s.pbr, sp.child('pbr')),
      roe: nullableNum(s.roe, sp.child('roe')),
      per_pctile_in_sector: nullableNum(s.per_pctile_in_sector, sp.child('per_pctile_in_sector')),
      debt_to_equity: nullableNum(s.debt_to_equity, sp.child('debt_to_equity')),
      week52: {
        high: numIn(w.high, wp.child('high'), 0, Number.MAX_SAFE_INTEGER),
        low: numIn(w.low, wp.child('low'), 0, Number.MAX_SAFE_INTEGER),
        position: numIn(w.position, wp.child('position'), 0, 1),
      },
      revenue_trend: trend(s.revenue_trend, sp.child('revenue_trend')),
      op_margin_trend: trend(s.op_margin_trend, sp.child('op_margin_trend')),
    },
    business: str(o.business, p.child('business')),
    thesis: strArray(o.thesis, p.child('thesis'), { min: 1 }),
    bear_points: strArray(o.bear_points, p.child('bear_points'), { min: 1 }),
    catalysts: strArray(o.catalysts, p.child('catalysts')),
    technical_read: str(o.technical_read, p.child('technical_read')),
    news: arr(o.news, p.child('news')).map((n, i) => {
      const np = p.child('news').child(i)
      const no = obj(n, np)
      return {
        title: str(no.title, np.child('title')),
        url: str(no.url, np.child('url')),
        date: str(no.date, np.child('date'), { allowEmpty: true }),
        takeaway: str(no.takeaway, np.child('takeaway')),
      }
    }),
    verdict: (() => {
      const vp = p.child('verdict')
      const vo = obj(o.verdict, vp)
      return {
        stance: oneOf(vo.stance, vp.child('stance'), ['positive', 'neutral', 'cautious'] as const),
        one_liner: str(vo.one_liner, vp.child('one_liner')),
        confidence: numIn(vo.confidence, vp.child('confidence'), 0, 1),
      }
    })(),
    invalidation: strArray(o.invalidation, p.child('invalidation'), { min: 1 }),
    disclaimer: str(o.disclaimer, p.child('disclaimer')),
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 45 + 스키마 15 = 60개

- [ ] **Step 6: 타입체크 + 커밋**

```bash
npm run typecheck
```

```bash
git add src/types.ts src/schema.ts src/schema.test.ts
git commit -m "feat: add runtime validators for LLM output schemas"
```

---

### Task 5: 번들 조립 (A단계 · B단계)

**Files:**
- Create: `src/prepare.ts`
- Test: `src/prepare.test.ts`
- Create: `src/bin/prepare.ts`
- Create: `src/bin/candidates.ts`
- Modify: `src/db.ts` (스냅샷 읽기, 리포트 요청 큐 읽기)
- Modify: `package.json` (`prepare`, `candidates` 스크립트)
- Modify: `.gitignore` (`runs/`)

**Interfaces:**
- Consumes: `db.ts`의 `db()`·`kstDate()`·`readUniverse()`; `screener.ts` 전부; `sources/news.ts`; `sources/yahoo.ts`의 `fetchFundamentals`; `types.ts`의 `FeatureSet`
- Produces:
  - `types.ts`에 `BundleA`, `BundleB` 타입
  - `db.ts`: `readLatestSnapshot(kind: SnapshotKind): Promise<{ date: string; payload: unknown } | null>`, `readOpenReportRequests(limit?: number): Promise<{ id: number; ticker: string; market: 'KR' | 'US' }[]>`
  - `prepare.ts`: `buildBundleA(features: FeatureSet, indexNews: NewsItem[], krNews: NewsItem[]): BundleA`, `owSectorsFrom(agents: AgentOutput[]): string[]`, `buildBundleB(bundleA: BundleA, agents: AgentOutput[], candidates: Candidate[], news: Record<string, NewsItem[]>, requested: { ticker: string; market: 'KR' | 'US' }[]): BundleB`

- [ ] **Step 1: 타입 추가**

`src/types.ts` 끝에:

```ts
export type BundleA = {
  date: string
  features: FeatureSet
  news: { market: NewsItem[]; korea: NewsItem[] }
  agents_to_run: string[]
  disclaimer: string
}

export type BundleB = {
  date: string
  features: FeatureSet
  agents_a: AgentOutput[]
  candidates: Candidate[]
  candidate_news: Record<string, NewsItem[]>
  company_reports_for: { ticker: string; market: 'KR' | 'US' }[]
  agents_to_run: string[]
  disclaimer: string
}
```

- [ ] **Step 2: `src/db.ts`에 읽기 함수 추가**

```ts
export async function readLatestSnapshot(
  kind: SnapshotKind,
): Promise<{ date: string; payload: unknown } | null> {
  const { data, error } = await db()
    .from('market_snapshots')
    .select('date,payload')
    .eq('kind', kind)
    .order('date', { ascending: false })
    .limit(1)
  if (error) throw new Error(`market_snapshots 읽기 실패 (${kind}): ${error.message}`)
  const row = data?.[0]
  return row ? { date: row.date as string, payload: row.payload } : null
}

export async function readOpenReportRequests(
  limit = 5,
): Promise<{ id: number; ticker: string; market: 'KR' | 'US' }[]> {
  const { data, error } = await db()
    .from('report_requests')
    .select('id,ticker,market')
    .is('fulfilled_at', null)
    .order('requested_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`report_requests 읽기 실패: ${error.message}`)
  return (data ?? []) as { id: number; ticker: string; market: 'KR' | 'US' }[]
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

`src/prepare.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBundleA, buildBundleB, owSectorsFrom } from './prepare.ts'
import type { AgentOutput, Candidate, FeatureSet, NewsItem } from './types.ts'

const features = {
  date: '2026-07-31',
  assets: {},
  macro: {
    available: true, dgs2: 3.5, dgs10: 4.2, dgs3mo: 4.5,
    cpiYoY: 0.025, coreCpiYoY: 0.03, unrate: 4.1, hySpread: 3.2,
    curve2s10s: 0.7, curve3m10y: -0.3,
  },
  regime: { vixLevel: 18, vixTerm: 0.9, breadth: 0.01, usdkrw: 1350, usdkrwChange20d: 0.01 },
  relative: { krVsUs3m: 0.04, sectors: [{ etf: 'XLK', rel3m: 0.06 }] },
  foreignRatioSamsung: 52.1,
  missing: [],
} as unknown as FeatureSet

const news = (t: string): NewsItem => ({ title: t, url: 'http://e.com/' + t, date: null, source: 's' })

const agent = (name: string, extra: Partial<AgentOutput> = {}): AgentOutput => ({
  agent: name, score: 60, confidence: 0.6, signal: 'bullish',
  headline: 'h', reasoning: 'r',
  evidence: [{ label: 'l', value: 'v', source: 'features.x' }],
  flags: [], ...extra,
})

const candidate = (ticker: string): Candidate => ({
  ticker, name: ticker, market: 'US', sector: 'Technology',
  turnover: 1e9, yearChangePct: 30, roe: 0.2, operatingMargin: 0.25,
  forwardPE: 20, priceToBook: 5, score: 1.2,
})

test('buildBundleA는 features와 뉴스를 담고 실행할 agent 5개를 명시한다', () => {
  const b = buildBundleA(features, [news('us')], [news('kr')])
  assert.equal(b.date, '2026-07-31')
  assert.equal(b.news.market.length, 1)
  assert.equal(b.news.korea.length, 1)
  assert.deepEqual(b.agents_to_run, ['macro', 'allocation', 'country_sector', 'technical', 'news'])
  assert.ok(b.disclaimer.length > 0)
})

test('owSectorsFrom은 country_sector의 evidence에서 OW 섹터를 뽑는다', () => {
  const cs = agent('country_sector', {
    evidence: [
      { label: 'sector:Technology', value: 'OW', source: 'features.relative.sectors' },
      { label: 'sector:Utilities', value: 'UW', source: 'features.relative.sectors' },
      { label: 'sector:Energy', value: 'OW', source: 'features.relative.sectors' },
      { label: 'country:US', value: 'OW', source: 'features.relative.krVsUs3m' },
    ],
  })
  assert.deepEqual(owSectorsFrom([agent('macro'), cs]), ['Technology', 'Energy'])
})

test('owSectorsFrom은 country_sector가 없거나 OW가 없으면 빈 배열', () => {
  assert.deepEqual(owSectorsFrom([agent('macro')]), [])
  assert.deepEqual(owSectorsFrom([agent('country_sector', { evidence: [{ label: 'sector:X', value: 'UW', source: 's' }] })]), [])
})

test('buildBundleB는 A단계 결과와 후보를 싣고 B단계 agent를 명시한다', () => {
  const a = buildBundleA(features, [], [])
  const b = buildBundleB(a, [agent('macro')], [candidate('AAPL')], { AAPL: [news('x')] }, [])
  assert.equal(b.date, a.date)
  assert.equal(b.candidates.length, 1)
  assert.equal(b.candidate_news.AAPL.length, 1)
  assert.deepEqual(b.agents_to_run, ['fundamental', 'counter', 'synthesizer', 'company_report'])
})

test('buildBundleB의 company_reports_for는 요청 큐를 그대로 싣는다', () => {
  const a = buildBundleA(features, [], [])
  const req = [{ ticker: 'MSFT', market: 'US' as const }]
  const b = buildBundleB(a, [agent('macro')], [candidate('AAPL')], {}, req)
  assert.deepEqual(b.company_reports_for, req)
})
```

- [ ] **Step 4: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './prepare.ts'`

- [ ] **Step 5: `src/prepare.ts` 구현**

```ts
import type { AgentOutput, BundleA, BundleB, Candidate, FeatureSet, NewsItem } from './types.ts'

export const DISCLAIMER =
  '이 문서는 공개 데이터를 정리·해석한 리서치 자료이며 투자자문이 아닙니다. ' +
  '작성자는 라이선스를 가진 투자자문업자가 아니며, 어떤 수익도 보장하지 않습니다. ' +
  '투자 판단과 그 결과에 대한 책임은 전적으로 투자자 본인에게 있습니다.'

export function buildBundleA(
  features: FeatureSet,
  indexNews: NewsItem[],
  krNews: NewsItem[],
): BundleA {
  return {
    date: features.date,
    features,
    news: { market: indexNews, korea: krNews },
    agents_to_run: ['macro', 'allocation', 'country_sector', 'technical', 'news'],
    disclaimer: DISCLAIMER,
  }
}

// country_sector agent는 섹터 스탠스를 evidence에 `label: 'sector:<Yahoo섹터명>', value: 'OW'`
// 형태로 남긴다. 스크리너가 자유 서술을 파싱하지 않아도 되게 만든 계약이다.
export function owSectorsFrom(agents: AgentOutput[]): string[] {
  const cs = agents.find((a) => a.agent === 'country_sector')
  if (!cs) return []
  return cs.evidence
    .filter((e) => e.label.startsWith('sector:') && e.value.trim().toUpperCase() === 'OW')
    .map((e) => e.label.slice('sector:'.length).trim())
    .filter((s) => s.length > 0)
}

export function buildBundleB(
  bundleA: BundleA,
  agents: AgentOutput[],
  candidates: Candidate[],
  news: Record<string, NewsItem[]>,
  requested: { ticker: string; market: 'KR' | 'US' }[],
): BundleB {
  return {
    date: bundleA.date,
    features: bundleA.features,
    agents_a: agents,
    candidates,
    candidate_news: news,
    company_reports_for: requested,
    agents_to_run: ['fundamental', 'counter', 'synthesizer', 'company_report'],
    disclaimer: DISCLAIMER,
  }
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 60 + prepare 5 = 65개

- [ ] **Step 7: A단계 CLI**

`src/bin/prepare.ts`:

```ts
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
```

- [ ] **Step 8: B단계 CLI**

`src/bin/candidates.ts`:

```ts
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
```

- [ ] **Step 9: 스크립트와 gitignore**

`package.json`의 `scripts`에 추가:

```json
    "prepare:bundle": "node --env-file=.env src/bin/prepare.ts",
    "candidates": "node --env-file=.env src/bin/candidates.ts",
```

`prepare`가 아니라 `prepare:bundle`인 이유: npm은 `prepare`를 라이프사이클 훅으로 취급해
`npm install` 때마다 실행해 버린다.

`.gitignore`에 한 줄 추가:

```
runs/
```

- [ ] **Step 10: A단계 실행 확인**

```bash
npm run prepare:bundle
```

Expected: `A단계 번들: runs/<날짜>/bundle-a.json (뉴스 미국 12, 한국 15, 결측 0)`.
`features 스냅샷이 없습니다`가 나오면 P1의 `npm run collect`를 먼저 돌려야 한다.

```bash
node -e "const b=require('./runs/'+new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})+'/bundle-a.json');console.log(Object.keys(b),'assets',Object.keys(b.features.assets).length,'bytes',JSON.stringify(b).length)"
```

Expected: 키 5개, 자산 23개 내외, 크기 15KB 이하. 크기가 100KB를 넘으면 LLM 입력으로 과하니 보고한다.

- [ ] **Step 11: 타입체크 + 커밋**

```bash
npm run typecheck
```

```bash
git add src/types.ts src/prepare.ts src/prepare.test.ts src/bin/prepare.ts src/bin/candidates.ts src/db.ts package.json .gitignore
git commit -m "feat: add A/B stage bundle builders and candidate screening CLI"
```

---

### Task 6: 발행 (검증 후 DB 쓰기)

**Files:**
- Create: `src/publish.ts`
- Test: `src/publish.test.ts`
- Create: `src/bin/publish.ts`
- Modify: `src/db.ts` (리포트 쓰기, 요청 완료 표시)
- Modify: `package.json` (`publish` 스크립트)

**Interfaces:**
- Consumes: `schema.ts` 전부; `db.ts`의 `db()`
- Produces:
  - `publish.ts`: `splitOutputs(raw: unknown): { agents: AgentOutput[]; verdict: DailyVerdict; reports: CompanyReport[] }`
  - `db.ts`: `writeAgentReports(date: string, agents: AgentOutput[]): Promise<void>`, `writeDailyVerdict(verdict: DailyVerdict): Promise<void>`, `writeCompanyReports(reports: CompanyReport[]): Promise<void>`, `markRequestsFulfilled(pairs: { ticker: string; market: string }[]): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 작성**

`splitOutputs`가 순수 함수라 네트워크 없이 검증한다. LLM 출력 파일 하나에 세 종류가 섞여 오므로
그 분리와 검증이 이 태스크의 위험 지점이다.

`src/publish.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitOutputs } from './publish.ts'

const agent = {
  agent: 'fundamental', score: 60, confidence: 0.6, signal: 'bullish',
  headline: 'h', reasoning: 'r',
  evidence: [{ label: 'ROE', value: '18.9%', source: 'candidates[0].roe' }], flags: [],
}

const verdict = {
  date: '2026-07-31', equity_score: 68, signal: 'increase',
  suggested_equity_weight: [60, 70], conviction: 'medium',
  drivers: [{ agent: 'macro', direction: '+', weight: 0.3, point: 'p' }],
  counter_case: '반대 논거', countries: [{ code: 'KR', stance: 'OW', rationale: 'r' }],
  sectors: [{ name: 'Technology', stance: 'OW', etf: 'XLK', rationale: 'r' }],
  picks: [], invalidation: ['조건'], disclaimer: 'd',
}

test('splitOutputs는 세 종류를 나눠 담는다', () => {
  const out = splitOutputs({ agents: [agent], verdict, company_reports: [] })
  assert.equal(out.agents.length, 1)
  assert.equal(out.verdict.equity_score, 68)
  assert.equal(out.reports.length, 0)
})

test('splitOutputs는 verdict가 없으면 거부', () => {
  assert.throws(() => splitOutputs({ agents: [agent], company_reports: [] }), /verdict/)
})

test('splitOutputs는 agent 하나가 깨져도 조용히 넘기지 않는다', () => {
  const broken = { ...agent, evidence: [] }
  assert.throws(() => splitOutputs({ agents: [agent, broken], verdict, company_reports: [] }), /evidence/)
})

test('splitOutputs는 최상위가 객체가 아니면 거부', () => {
  assert.throws(() => splitOutputs([agent]), /object/)
})

test('splitOutputs는 company_reports가 없으면 빈 배열로 둔다', () => {
  assert.deepEqual(splitOutputs({ agents: [agent], verdict }).reports, [])
})
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
npm test
```

Expected: FAIL — `Cannot find module './publish.ts'`

- [ ] **Step 3: `src/publish.ts` 구현**

```ts
import { validateAgentOutput, validateCompanyReport, validateDailyVerdict } from './schema.ts'
import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

export function splitOutputs(raw: unknown): {
  agents: AgentOutput[]
  verdict: DailyVerdict
  reports: CompanyReport[]
} {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('LLM 출력: 최상위가 object가 아님')
  }
  const o = raw as Record<string, unknown>
  if (o.verdict === undefined) throw new Error('LLM 출력: verdict가 없음')
  const agentsRaw = Array.isArray(o.agents) ? o.agents : []
  const reportsRaw = Array.isArray(o.company_reports) ? o.company_reports : []
  return {
    agents: agentsRaw.map(validateAgentOutput),
    verdict: validateDailyVerdict(o.verdict),
    reports: reportsRaw.map(validateCompanyReport),
  }
}
```

- [ ] **Step 4: `src/db.ts`에 쓰기 함수 추가**

```ts
import type { AgentOutput, CompanyReport, DailyVerdict } from './types.ts'

export async function writeAgentReports(date: string, agents: AgentOutput[]): Promise<void> {
  if (agents.length === 0) return
  const rows = agents.map((a) => ({ date, agent: a.agent, output: a }))
  const { error } = await db().from('agent_reports').upsert(rows, { onConflict: 'date,agent' })
  if (error) throw new Error(`agent_reports 쓰기 실패: ${error.message}`)
}

// published는 false로 둔다. 사람이 확인한 뒤 공개하는 것이 기본값이다.
export async function writeDailyVerdict(verdict: DailyVerdict): Promise<void> {
  const { error } = await db()
    .from('daily_verdicts')
    .upsert({ date: verdict.date, verdict, published: false }, { onConflict: 'date' })
  if (error) throw new Error(`daily_verdicts 쓰기 실패: ${error.message}`)
}

export async function writeCompanyReports(reports: CompanyReport[]): Promise<void> {
  if (reports.length === 0) return
  const rows = reports.map((r) => ({
    ticker: r.ticker,
    market: r.market,
    date: r.generated_at.slice(0, 10),
    payload: r,
  }))
  const { error } = await db()
    .from('company_reports')
    .upsert(rows, { onConflict: 'ticker,market,date' })
  if (error) throw new Error(`company_reports 쓰기 실패: ${error.message}`)
}

export async function markRequestsFulfilled(
  pairs: { ticker: string; market: string }[],
): Promise<void> {
  for (const p of pairs) {
    const { error } = await db()
      .from('report_requests')
      .update({ fulfilled_at: new Date().toISOString() })
      .eq('ticker', p.ticker)
      .eq('market', p.market)
      .is('fulfilled_at', null)
    if (error) throw new Error(`report_requests 갱신 실패 (${p.ticker}): ${error.message}`)
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm test
```

Expected: PASS — 65 + publish 5 = 70개

- [ ] **Step 6: CLI 작성**

`src/bin/publish.ts`:

```ts
import { readFile } from 'node:fs/promises'
import {
  markRequestsFulfilled, writeAgentReports, writeCompanyReports, writeDailyVerdict,
} from '../db.ts'
import { splitOutputs } from '../publish.ts'

const date = process.argv[2]
if (!date) {
  console.error('사용법: npm run publish -- YYYY-MM-DD')
  process.exit(1)
}

try {
  // A단계 agent 출력과 B단계 출력을 합쳐서 발행한다.
  const a = JSON.parse(await readFile(`runs/${date}/agents-a.json`, 'utf8')) as unknown[]
  const b = JSON.parse(await readFile(`runs/${date}/agents-b.json`, 'utf8')) as Record<string, unknown>
  const merged = {
    ...b,
    agents: [...(Array.isArray(a) ? a : []), ...(Array.isArray(b.agents) ? b.agents : [])],
  }

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
```

`package.json`의 `scripts`에 추가:

```json
    "publish:run": "node --env-file=.env src/bin/publish.ts",
```

`publish`가 아니라 `publish:run`인 이유: npm의 `publish` 라이프사이클과 겹치지 않게 하기 위해서다.

- [ ] **Step 7: 타입체크 + 커밋**

```bash
npm run typecheck
```

```bash
git add src/publish.ts src/publish.test.ts src/bin/publish.ts src/db.ts package.json
git commit -m "feat: add validated publish path for agent outputs"
```

---

### Task 7: agent 프롬프트 9개

**Files:**
- Create: `prompts/macro.md`, `prompts/allocation.md`, `prompts/country_sector.md`, `prompts/technical.md`, `prompts/news.md`, `prompts/fundamental.md`, `prompts/counter.md`, `prompts/synthesizer.md`, `prompts/company_report.md`
- Create: `prompts/README.md`

**Interfaces:**
- Consumes: `BundleA` / `BundleB`의 필드 경로, `AgentOutput` / `DailyVerdict` / `CompanyReport` 스키마
- Produces: 파일뿐. `/daily` 커맨드가 이 파일들을 읽어 LLM에게 준다.

- [ ] **Step 1: 공통 규칙 문서 작성**

`prompts/README.md`:

```markdown
# agent 프롬프트

각 파일은 agent 하나의 지시문이다. `/daily` 커맨드가 번들 JSON과 함께 읽는다.

## 모든 agent에 적용되는 규칙

1. **숫자를 만들지 않는다.** 번들에 있는 숫자만 쓴다. 번들에 없는 값이 필요하면
   그 사실을 `flags`에 적고 없는 채로 판단한다. 추정치를 지어내면 안 된다.
2. **`evidence`의 `source`는 번들 안의 실제 경로**여야 한다.
   예: `features.macro.curve2s10s`, `features.regime.vixTerm`, `candidates[3].roe`,
   `news.korea[2].title`. 경로가 없는 evidence는 검증기가 거부한다.
3. `null`은 "모른다"는 뜻이다. 0으로 읽지 않는다.
   `features.missing`에 있는 항목은 그 값이 아예 수집되지 않았다는 뜻이므로,
   그 항목에 의존하는 판단은 `flags`에 한계를 적는다.
4. 출력은 **JSON 하나**다. 마크다운 코드펜스도, 설명 문장도 붙이지 않는다.
5. `score`는 0-100이고 50이 중립이다. `confidence`는 0-1이다.
   확신이 약하면 점수를 극단으로 밀지 말고 `confidence`를 낮춘다.
6. 한국어로 쓴다. 종목명·티커·지표명은 원문 그대로 둔다.
7. 수익률을 약속하거나 "반드시", "확실히" 같은 표현을 쓰지 않는다.

## 출력 계약

`macro`, `allocation`, `country_sector`, `technical`, `news`, `fundamental`, `counter`는
`AgentOutput` 하나를 낸다:

```json
{
  "agent": "macro",
  "score": 62,
  "confidence": 0.7,
  "signal": "bullish",
  "headline": "한 줄 요약",
  "reasoning": "3-6문장",
  "evidence": [{ "label": "2s10s", "value": "0.70%p", "source": "features.macro.curve2s10s" }],
  "flags": ["주의사항"]
}
```

`synthesizer`는 `DailyVerdict`, `company_report`는 `CompanyReport`를 낸다.
정확한 필드는 `src/types.ts`에 있고 `src/schema.ts`가 강제한다.
```

- [ ] **Step 2: 매크로/배분/국가섹터 프롬프트**

`prompts/macro.md`:

```markdown
# macro agent

`features.macro`와 `features.regime`을 읽고 현재 매크로 레짐을 판정한다.

## 보는 값

- `features.macro.curve2s10s`, `curve3m10y` — 장단기 금리차. 음수는 역전
- `features.macro.cpiYoY`, `coreCpiYoY` — 전년동월 대비 물가
- `features.macro.unrate` — 실업률
- `features.macro.hySpread` — 하이일드 스프레드. 확대는 신용 스트레스
- `features.regime.vixLevel`, `vixTerm` — VIX 수준과 기간구조.
  `vixTerm`이 1을 넘으면 백워데이션이고 단기 스트레스 신호다
- `features.regime.usdkrw`, `usdkrwChange20d` — 원달러 수준과 20일 변화

## 판단

레짐을 확장/둔화/침체/회복 중 하나로 부르고 그 근거를 댄다.
`score`는 주식에 우호적일수록 높다. 금리차 역전 + HY 스프레드 확대 + VIX 백워데이션이
겹치면 40 아래로, 셋 다 반대면 60 위로 간다.

`headline`에 레짐 이름을 반드시 포함한다.
`features.macro.available`이 false이거나 `features.missing`에 `fred`가 있으면
매크로 없이 판단하고 있다는 사실을 `flags` 첫 항목에 적고 `confidence`를 0.4 이하로 둔다.
```

`prompts/allocation.md`:

```markdown
# allocation agent

`macro` agent의 결과와 지수 추세를 합쳐 권장 주식비중 범위를 낸다.

## 보는 값

- 직전 `macro` agent의 `score`와 `signal`
- `features.assets['^GSPC']`, `features.assets['^KS11']`의
  `distSma200`(200일선 이격), `distSma60`, `realizedVol20`, `mom12_1`
- `features.regime.breadth` — RSP/SPY 비율의 60일 평균 대비 이격.
  음수는 소수 종목이 지수를 끌고 있다는 뜻

## 판단

`headline`에 권장 비중 범위를 `60-70%` 형태로 적는다.
`reasoning`에서 그 범위를 고른 이유를 매크로 점수, 200일선 이격, 실현변동성 순으로 설명한다.

원칙:
- 지수가 200일선 위 + 매크로 60 이상 → 비중 상단
- 지수가 200일선 아래 + 실현변동성 상승 → 비중 하단
- 브레드스가 음수면 상단을 낮춘다. 지수가 올라도 폭이 좁으면 취약하다

`score`는 비중 범위 중앙값을 그대로 쓴다(예: 60-70%면 65).
```

`prompts/country_sector.md`:

```markdown
# country_sector agent

한국과 미국 중 어디를, 11개 섹터 중 어디를 늘릴지 정한다.

## 보는 값

- `features.relative.krVsUs3m` — EWY 3개월 수익률 − SPY 3개월 수익률. 양수면 한국 우위
- `features.relative.sectors` — `{etf, rel3m}` 배열. SPY 대비 3개월 초과수익
- `features.regime.usdkrw`, `usdkrwChange20d` — 원화 약세는 한국 주식의 달러 수익률을 깎는다
- `features.foreignRatioSamsung` — 외국인 수급의 대리 지표
- `features.assets`의 각 섹터 ETF 항목 — `distSma200`, `rsi14`로 과열 여부 확인

## ETF ↔ 섹터 대응

XLK=Technology, XLF=Financial Services, XLE=Energy, XLV=Healthcare,
XLI=Industrials, XLY=Consumer Cyclical, XLP=Consumer Defensive,
XLU=Utilities, XLB=Basic Materials, XLRE=Real Estate, XLC=Communication Services

## 출력에서 반드시 지킬 형식

**이 agent의 `evidence`는 다음 단계의 스크리너가 기계적으로 읽는다.** 자유 서술이 아니다.

- 섹터 스탠스는 `label`을 `sector:<위 표의 섹터명>`, `value`를 `OW`/`N`/`UW`로 적는다.
- 국가 스탠스는 `label`을 `country:KR` 또는 `country:US`, `value`를 `OW`/`N`/`UW`로 적는다.
- `source`는 그 판단의 근거가 된 번들 경로다.

**OW 섹터를 최소 1개, 최대 3개 낸다.** 하나도 없으면 다음 단계가 멈춘다.
확신이 없으면 상대모멘텀이 가장 높은 섹터 하나를 OW로 두고 `confidence`를 낮춘다.

예:

```json
{
  "label": "sector:Technology",
  "value": "OW",
  "source": "features.relative.sectors[0].rel3m"
}
```
```

- [ ] **Step 3: 기술/뉴스/펀더멘털 프롬프트**

`prompts/technical.md`:

```markdown
# technical agent

지수의 추세와 모멘텀을 읽는다. 개별 종목은 보지 않는다 — 그건 B단계 몫이다.

## 보는 값

`features.assets['^GSPC']`, `['^IXIC']`, `['^KS11']`, `['^KQ11']` 각각의:
- `distSma20`, `distSma60`, `distSma200` — 이동평균 이격(비율). 0.05면 5% 위
- `rsi14` — 70 위 과열, 30 아래 과매도
- `macdHist` — 양수면 상승 모멘텀 강화
- `realizedVol20` — 연율화 실현변동성
- `week52Position` — 0이 52주 저점, 1이 고점
- `ret1m`, `ret3m`

## 판단

네 지수의 신호가 엇갈리면 그 사실 자체가 중요한 정보다. `reasoning`에 어긋나는 지점을 적는다.
`score`는 추세가 강할수록 높다. 다만 `rsi14`가 75를 넘는 지수가 둘 이상이면
과열을 `flags`에 적고 점수를 80 위로 올리지 않는다.

`week52Position`이 null인 지수는 데이터가 200봉 미만이라는 뜻이므로 판단에서 제외하고 `flags`에 적는다.
```

`prompts/news.md`:

```markdown
# news agent

`news.market`(미국 지수 ETF 헤드라인)과 `news.korea`(연합뉴스 경제) 헤드라인을 읽는다.

## 판단

1. 시장 방향에 실제로 영향을 줄 사건 **3개**를 고른다. 주가와 무관한 기사는 버린다.
2. 각 사건이 강세 요인인지 약세 요인인지 밝힌다.
3. `score`는 전반적 심리다. 50이 중립이다.

## 제약

- **헤드라인 제목만 주어진다. 본문은 없다.** 제목에 없는 내용을 추측해 쓰지 않는다.
- 같은 사건이 여러 매체에 중복되면 하나로 센다.
- `evidence`의 `source`는 `news.korea[2].title` 처럼 배열 인덱스까지 적는다.
- 헤드라인이 5개 미만이면 `flags`에 적고 `confidence`를 0.3 이하로 둔다.
- 기사 제목을 인용할 때는 원문 그대로 옮긴다. 요약해서 바꿔 쓰지 않는다.
```

`prompts/fundamental.md`:

```markdown
# fundamental agent

`candidates` 배열(12종목)의 퀄리티와 밸류를 평가한다.

## 보는 값

각 후보의 `roe`, `operatingMargin`, `forwardPE`, `priceToBook`, `yearChangePct`,
`turnover`(현지통화 거래대금), `sector`, `market`, `score`(코드가 계산한 모멘텀+퀄리티 z합),
그리고 `tech`(코드가 일봉으로 계산한 `distSma200`, `distSma60`, `rsi14`, `macdHist`,
`week52Position`, `realizedVol20`).

## 판단

- `score`는 후보군 전체의 퀄리티 수준이다. 개별 종목 점수가 아니다.
- `reasoning`에서 후보군에서 **가장 두드러진 3종목**을 이름과 숫자로 짚는다.
- 밸류에이션이 부담스러운 종목이 있으면 `flags`에 티커와 함께 적는다.

## 제약

- **한국과 미국 종목의 PER/PBR을 직접 비교하지 않는다.** 회계 관행과 시장 구조가 다르다.
  비교는 같은 시장, 같은 섹터 안에서만 한다.
- `priceToBook`이 null인 한국 종목이 흔하다. 없는 값으로 판단을 만들지 말고 `flags`에 적는다.
- `turnover`는 통화 단위가 시장마다 다르다. 시장 간 크기 비교에 쓰지 않는다.
```

- [ ] **Step 4: 반대의견/종합/기업리포트 프롬프트**

`prompts/counter.md`:

```markdown
# counter agent (반대의견)

지금까지 나온 agent 결과 전부를 읽고 **우세한 결론의 반대편**을 세운다.

이 단계의 목적은 균형 잡힌 시각이 아니다. **확증편향을 깨는 것**이다.
따라서 다수 의견에 동의하는 문장을 쓰지 않는다.

## 방법

1. `agents_a`와 `fundamental` 결과에서 우세한 방향을 확인한다.
2. **그 반대 방향의 논거를 만든다.** 같은 번들의 숫자로.
   같은 데이터가 반대 결론을 지지할 수 있는 지점을 찾는다.
3. 우세 결론이 무너지려면 무엇이 사실이어야 하는지 적는다.

## 출력

`AgentOutput` 형식이되 `agent`는 `"counter"`.
- `signal`은 우세 방향의 반대로 둔다.
- `score`는 반대 논거의 설득력이다. 억지스러우면 낮게 준다 —
  약한 반대의견을 강한 척 포장하는 것이 이 단계에서 가장 나쁜 실패다.
- `evidence`는 우세 결론이 근거로 쓴 것과 **같은 숫자를 다르게 읽은 것**이면 가장 좋다.
- `flags`에 "이 반대의견이 성립하려면 필요한 조건"을 적는다.
```

`prompts/synthesizer.md`:

```markdown
# synthesizer agent

모든 agent 결과 + 반대의견을 읽고 최종 `DailyVerdict`을 만든다. 출력 스키마는 `src/types.ts`의 `DailyVerdict`.

## 반드시 지킬 것

1. **`counter_case`에 반대의견을 요약하고, 왜 수용했는지 또는 왜 반박하는지 적는다.**
   반대의견을 무시하고 넘어가면 안 된다. 반박한다면 어떤 숫자로 반박하는지 밝힌다.
2. **`drivers`는 agent 카드로 역추적 가능해야 한다.** `agent` 필드는 실제 agent 이름
   (`macro`, `allocation`, `country_sector`, `technical`, `news`, `fundamental`)이어야 하고,
   `weight`의 합은 1.0 근처여야 한다.
3. **`invalidation`은 구체적이고 관측 가능해야 한다.**
   "시장이 나빠지면"은 안 된다. "HY 스프레드가 5.0%를 넘으면", "^GSPC가 200일선 아래로 마감하면"처럼
   숫자와 조건으로 쓴다. 최소 2개.
4. `picks`는 `candidates`에서 최대 5종목. 각 `ticker`/`name`/`market`/`sector`는
   후보 배열의 값을 그대로 복사한다. 새 종목을 지어내지 않는다.
   `scores.tech`는 그 후보의 `tech` 블록(`distSma200`, `rsi14`, `macdHist`, `week52Position`)을
   0-100으로 해석한 값이다. `tech`가 null인 후보는 `scores.tech`를 50(중립)으로 두고
   그 사실을 `risk`에 적는다. `scores.fund`는 `roe`/`operatingMargin`/밸류에이션에서,
   `scores.news`는 `news` agent 결과와 `candidate_news`에서 나온다.
   **세 점수 모두 번들의 숫자를 근거로 해야 한다.** 근거 없이 숫자를 배정하지 않는다.
5. `sectors`의 `etf` 필드는 `country_sector` agent가 쓴 ETF 티커와 일치해야 한다.
6. `disclaimer`는 번들의 `disclaimer` 문자열을 그대로 복사한다.

## 점수와 신호

- `equity_score`는 agent 점수들의 가중 평균에 가깝게 두되, 반대의견이 강하면(counter score 65 이상) 낮춘다.
- `signal`: `increase` / `hold` / `reduce`.
- `conviction`: agent들이 서로 어긋나거나 `features.missing`이 비어 있지 않으면 `low`.

## 금지

- 수익률·목표주가 제시 금지.
- 백테스트 성과 언급 금지.
- 매수/매도 주문 지시 금지. 이 문서는 리서치 자료다.
```

`prompts/company_report.md`:

```markdown
# company_report agent

종목 하나의 1장짜리 기업분석 리포트를 만든다. 출력 스키마는 `src/types.ts`의 `CompanyReport`.

## 역할 분담

`snapshot` 블록은 **코드가 계산해 번들에 넣어준 값**이다. 그대로 복사한다.
숫자를 다시 계산하거나 반올림하거나 채워 넣지 않는다. null은 null로 남긴다.

너는 서술만 쓴다: `business`, `thesis`, `bear_points`, `catalysts`, `technical_read`,
`news[].takeaway`, `verdict`, `invalidation`.

## 순서 (Data → Concept → Thesis)

1. `snapshot`과 `candidate_news`의 사실을 먼저 읽는다.
2. `business`: 이 회사가 무엇으로 돈을 버는지 2-3문장. 아는 범위에서 쓰고,
   모르면 섹터 수준의 서술로 남기고 `flags` 대신 `bear_points`에 정보 부족을 적는다.
3. `thesis` 3개와 `bear_points` 3개. **개수는 같아야 한다.**
   강세 논거만 3개 쓰고 약세를 1개 쓰면 이 리포트는 쓸모가 없다.
4. `technical_read`: `snapshot.week52.position`과 가격 변화율로 차트상 위치를 해석한다.
5. `news[].takeaway`: 제목에서 읽히는 함의만 쓴다. 본문은 주어지지 않았다.
6. `verdict.one_liner`: 한 문장. `verdict.confidence`는 0-1.
7. `invalidation`: 이 논지가 깨지는 관측 가능한 조건 최소 2개.

## 제약

- `generated_at`은 ISO 8601 문자열로 쓴다.
- `disclaimer`는 번들의 문자열을 그대로 복사한다.
- 목표주가를 쓰지 않는다. 매수/매도를 지시하지 않는다.
- 실적 수치를 기억에서 꺼내 쓰지 않는다. 번들에 있는 것만 쓴다.
```

- [ ] **Step 5: 프롬프트가 스키마와 어긋나지 않는지 확인**

프롬프트에 적힌 필드 경로가 실제 타입과 맞는지 눈으로 대조한다:

```bash
grep -o "features\.[a-zA-Z_.\[\]0-9']*" prompts/*.md | sort -u
```

Expected: 출력된 경로가 전부 `src/types.ts`의 `FeatureSet`에 실재해야 한다.
`features.regime.breadth`, `features.macro.curve2s10s`, `features.relative.sectors`,
`features.assets['^GSPC'].distSma200` 등. 없는 경로가 나오면 프롬프트를 고친다.

- [ ] **Step 6: 커밋**

```bash
git add prompts/
git commit -m "docs: add agent prompts with evidence-path contract"
```

---

### Task 8: `/daily` 슬래시 커맨드 + 엔드투엔드 실행

**Files:**
- Create: `.claude/commands/daily.md`
- Modify: `docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md` (§4 뉴스 소스, §11 실행 방식 정정)

**Interfaces:**
- Consumes: 앞선 모든 태스크
- Produces: 사람이 `/daily`를 실행하면 `daily_verdicts` 1행이 생긴다

- [ ] **Step 1: 슬래시 커맨드 작성**

`.claude/commands/daily.md`:

```markdown
---
description: 오늘의 시장 판단을 생성한다 (수집 → agent 분석 → DB 발행)
---

오늘의 투자 판단을 생성한다. 아래 순서를 그대로 따른다.

## 0. 날짜 확인

```bash
node -e "console.log(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}))"
```

이 값을 `<DATE>`로 쓴다.

## 1. 수집 (LLM 없음)

```bash
npm run collect
```

실패하면 멈추고 사용자에게 보고한다. 오래된 스냅샷으로 판단을 만들지 않는다.

## 2. A단계 번들

```bash
npm run prepare:bundle
```

## 3. A단계 agent 5개 실행

`runs/<DATE>/bundle-a.json`을 읽는다. `prompts/README.md`의 공통 규칙을 먼저 읽는다.
그다음 아래 5개를 **순서대로** 실행한다. 각각 해당 프롬프트 파일을 읽고, 번들을 입력으로
`AgentOutput` JSON 하나씩 만든다.

1. `prompts/macro.md`
2. `prompts/allocation.md` — 1의 결과를 함께 본다
3. `prompts/country_sector.md`
4. `prompts/technical.md`
5. `prompts/news.md`

다섯 결과를 배열로 묶어 `runs/<DATE>/agents-a.json`에 쓴다.

**주의**: `country_sector`의 `evidence`에 `label: "sector:<섹터명>", value: "OW"` 항목이
최소 1개 있어야 다음 단계가 돈다. 없으면 그 agent를 다시 실행한다.

## 4. 후보 선정 (LLM 없음)

```bash
npm run candidates -- <DATE>
```

`OW 섹터가 하나도 없습니다` 오류가 나면 3단계로 돌아간다.

## 5. B단계 agent 실행

`runs/<DATE>/bundle-b.json`을 읽고 순서대로:

1. `prompts/fundamental.md` → `AgentOutput`
2. `prompts/counter.md` → `AgentOutput` (1과 `agents_a` 전부를 입력으로)
3. `prompts/synthesizer.md` → `DailyVerdict` (모든 agent 결과 + 반대의견)
4. `prompts/company_report.md` → `verdict.picks` 상위 5종목 각각에 대해 `CompanyReport`.
   `bundle-b.json`의 `company_reports_for`에 항목이 있으면 그것도 포함한다.
   기업 리포트는 최대 5건까지만 만든다 — 일일 LLM 호출 예산이 13회다.

결과를 하나의 객체로 `runs/<DATE>/agents-b.json`에 쓴다:

```json
{
  "agents": [ <fundamental>, <counter> ],
  "verdict": { ... },
  "company_reports": [ ... ]
}
```

## 6. 발행

```bash
npm run publish:run -- <DATE>
```

검증 오류가 나면 어느 필드가 왜 거부됐는지 메시지에 나온다. 해당 agent 출력을 고쳐
`agents-b.json`을 수정하고 다시 실행한다. **검증을 우회하지 않는다.**

## 7. 보고

사용자에게 한국어로 요약한다: `equity_score`, `signal`, 권장 비중 범위, `counter_case` 한 줄,
OW 국가·섹터, 종목 5개. 마지막에 `daily_verdicts`가 `published=false`로 저장됐다는 사실과,
공개하려면 그 플래그를 직접 바꿔야 한다는 것을 알린다.

## 지켜야 할 것

- 번들에 없는 숫자를 쓰지 않는다.
- 매수/매도를 지시하지 않는다. 이 결과는 리서치 자료다.
- 어떤 단계가 실패하면 다음 단계로 넘어가지 않는다. 부분 결과를 발행하지 않는다.
```

- [ ] **Step 2: 설계서 정정**

`docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md`의 §4 표에서
`네이버 뉴스 (Claude Code MCP) | 세션에 연결됨 | 한국 뉴스 | MCP` 행을 아래 두 행으로 바꾼다:

```markdown
| Yahoo 종목 RSS `feeds.finance.yahoo.com/rss/2.0/headline?s=` | **성공.** `AAPL`·`005930.KS` 모두 20건 | 한·미 종목 뉴스 | 불필요 |
| 연합뉴스 경제 RSS `yna.co.kr/rss/economy.xml` | **성공.** 120건, CDATA 제목 | 한국 매크로 뉴스 | 불필요 |
| ~~네이버 뉴스 MCP~~ | **세션에 그런 서버가 없다.** 설계 시점의 전제가 틀렸음 | 사용하지 않음 | — |
```

같은 문서 §11의 v1 설명에서 "Supabase MCP로 결과를 쓴다"를 아래로 바꾼다:

```markdown
Claude Code가 `prepare`가 만든 번들 파일을 읽고 agent를 순서대로 돌린 뒤 결과 JSON을 파일로 쓴다.
`publish`가 스키마 검증을 통과한 것만 DB에 쓴다. LLM은 DB에 직접 쓰지 않는다 —
검증되지 않은 출력이 DB에 들어가는 경로를 만들지 않기 위해서다.
```

- [ ] **Step 3: 전체 테스트와 타입체크**

```bash
npm test
```

Expected: 70개 전부 통과

```bash
npm run typecheck
```

Expected: 에러 없음

- [ ] **Step 4: 엔드투엔드 실행**

Claude Code에서 `/daily`를 실행한다.

Expected: 7단계가 순서대로 돌고, 마지막에 한국어 요약이 나온다.
중간에 검증 오류가 나면 그것이 정상 동작이다 — 어느 필드가 왜 거부됐는지 보고 프롬프트를 고친다.

- [ ] **Step 5: DB 확인**

Supabase MCP `execute_sql` (project_id `jsxhcqnupvvctnjiaric`):

```sql
select date, published,
       verdict->>'equity_score' as score,
       verdict->>'signal' as signal,
       jsonb_array_length(verdict->'drivers') as drivers,
       jsonb_array_length(verdict->'picks') as picks,
       jsonb_array_length(verdict->'invalidation') as invalidation,
       length(verdict->>'counter_case') as counter_len
from daily_verdicts order by date desc limit 1;

select date, agent, output->>'score' as score, output->>'signal' as signal,
       jsonb_array_length(output->'evidence') as evidence
from agent_reports where date = (select max(date) from agent_reports) order by agent;

select ticker, market, date, length(payload::text) as bytes from company_reports
order by date desc limit 5;
```

Expected: verdict 1행 (`published=false`, drivers ≥ 1, invalidation ≥ 2, counter_len > 50),
agent_reports 7행 (macro/allocation/country_sector/technical/news/fundamental/counter),
company_reports 최대 5행.

- [ ] **Step 6: 커밋**

```bash
git add .claude/commands/daily.md docs/superpowers/specs/2026-07-31-multi-agent-trading-advisor-design.md
git commit -m "feat: add /daily slash command and correct design doc's news source"
```

---

## P2 완료 기준

설계서 §13 P2 기준: **"실데이터 기반 `daily_verdicts` 1행 + `company_reports` 여러 행 생성"**

- [ ] `npm test` — 70개 통과 (P1 21 + 뉴스 9 + 유니버스 6 + 스크리너 9 + 스키마 15 + prepare 5 + publish 5)
- [ ] `npm run smoke` — 뉴스 2개 포함 전부 OK
- [ ] `npm run universe` 후 `universe` 테이블에 KOSPI200 + S&P500이 Yahoo 섹터 어휘로 들어 있음
- [ ] `/daily` 1회 실행으로 `daily_verdicts` 1행 + `agent_reports` 7행 + `company_reports` 1행 이상
- [ ] verdict의 `counter_case`가 비어 있지 않고 `invalidation`이 2개 이상
- [ ] 모든 agent 출력의 `evidence[].source`가 번들의 실제 경로를 가리킴
- [ ] LLM 호출 13회 이하

## P2에서 의도적으로 뺀 것

| 뺀 것 | 이유 | 추가 시점 |
|---|---|---|
| 기업 리포트의 `revenue_trend`/`op_margin_trend` 실데이터 | `yahoo-finance2`의 분기 실적 시계열은 `quoteSummary`의 다른 모듈이 필요하고, 스키마는 빈 배열을 허용한다 | 리포트를 실제로 읽어보고 분기 추세가 아쉬우면 |
| `per_pctile_in_sector` 계산 | 섹터 내 전 종목의 PER이 필요하다. `pctRank`는 이미 있으므로 데이터만 붙이면 된다 | 후보 12종목 밖으로 리포트를 넓힐 때 |
| DART/SEC 원문 공시 | P1에서 뺀 이유와 같다. Yahoo가 두 시장을 같은 형태로 준다 | 원문 공시 인용이 필요해질 때 |
| 리포트 7일 캐시 | 웹이 없으므로 요청 큐가 아직 비어 있다. 캐시할 대상이 없다 | P3에서 웹이 요청을 넣기 시작하면 |
| `published=true` 자동 전환 | 사람이 한 번 읽고 공개하는 것이 기본값이어야 한다 | 판단 품질이 안정되면 |
| 반대의견 n라운드 토론 | 설계서가 이미 1패스로 압축하기로 결정했다 | 하지 않는다 |
