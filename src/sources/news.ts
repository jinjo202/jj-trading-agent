import type { NewsItem } from '../types.ts'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'",
  '&nbsp;': ' ',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
}

// CDATA를 벗기고 XML 엔티티를 디코드한다.
function decode(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  const text = cdata ? cdata[1] : raw
  return decodeEntities(text).trim()
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))
  return m ? decode(m[1]) : null
}

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
