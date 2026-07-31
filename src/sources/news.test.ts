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
