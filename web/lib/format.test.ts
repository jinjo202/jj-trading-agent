import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  companyStanceLabel,
  equityWeightLabel,
  marketCapLabel,
  numLabel,
  pctLabel,
  priceLabel,
  scoreGaugeColor,
  signalLabel,
  stanceClassName,
} from './format.ts'

test('equityWeightLabel은 [하한,상한]을 "60-70%"로 표시한다', () => {
  assert.equal(equityWeightLabel([60, 70]), '60-70%')
})

test('equityWeightLabel은 하한==상한이면 단일 숫자로 표시한다', () => {
  assert.equal(equityWeightLabel([65, 65]), '65%')
})

test('signalLabel은 세 신호를 각각 다른 문구/색으로 매핑한다', () => {
  assert.equal(signalLabel('increase').text, '비중 확대')
  assert.equal(signalLabel('reduce').text, '비중 축소')
  assert.equal(signalLabel('hold').text, '유지')
  assert.notEqual(signalLabel('increase').className, signalLabel('reduce').className)
})

test('stanceClassName은 OW/N/UW를 서로 다른 클래스로 매핑한다', () => {
  const ow = stanceClassName('OW')
  const uw = stanceClassName('UW')
  const n = stanceClassName('N')
  assert.notEqual(ow, uw)
  assert.notEqual(ow, n)
  assert.notEqual(n, uw)
})

test('scoreGaugeColor는 50 미만/이상에서 다른 색을 낸다', () => {
  assert.notEqual(scoreGaugeColor(30), scoreGaugeColor(70))
})

test('scoreGaugeColor는 0-100 경계에서 던지지 않는다', () => {
  assert.doesNotThrow(() => scoreGaugeColor(0))
  assert.doesNotThrow(() => scoreGaugeColor(100))
})

test('pctLabel은 소수 비율을 부호 붙인 퍼센트로 표시한다', () => {
  assert.equal(pctLabel(0.1234), '+12.3%')
  assert.equal(pctLabel(-0.0456), '-4.6%')
  assert.equal(pctLabel(0), '+0.0%')
})

// null은 "데이터 없음"이다. 0으로 표시하면 실제 0%와 구별되지 않는다.
test('pctLabel은 null/undefined/NaN을 "-"로 표시한다', () => {
  assert.equal(pctLabel(null), '-')
  assert.equal(pctLabel(undefined), '-')
  assert.equal(pctLabel(Number.NaN), '-')
})

test('pctLabel은 이미 퍼센트 단위인 값을 scale:1로 처리한다', () => {
  assert.equal(pctLabel(12.3, { scale: 1 }), '+12.3%')
})

test('pctLabel은 부호를 끌 수 있다', () => {
  assert.equal(pctLabel(0.42, { sign: false }), '42.0%')
})

test('numLabel은 숫자를 천단위 구분해 표시하고 null은 "-"로 둔다', () => {
  assert.equal(numLabel(1234567), '1,234,567')
  assert.equal(numLabel(12.345, 2), '12.35')
  assert.equal(numLabel(null), '-')
  assert.equal(numLabel(Number.NaN), '-')
})

// 삼성전자 시총은 500조 규모다. 천단위 구분만 하면 모바일에서 읽을 수 없다.
test('marketCapLabel은 KR을 조/억 단위로 압축한다', () => {
  assert.equal(marketCapLabel(512_000_000_000_000, 'KR'), '512.0조')
  assert.equal(marketCapLabel(3_400_000_000_000, 'KR'), '3.4조')
  assert.equal(marketCapLabel(45_000_000_000, 'KR'), '450억')
})

test('marketCapLabel은 US를 T/B/M 단위로 압축한다', () => {
  assert.equal(marketCapLabel(3_400_000_000_000, 'US'), '$3.40T')
  assert.equal(marketCapLabel(78_000_000_000, 'US'), '$78.0B')
  assert.equal(marketCapLabel(450_000_000, 'US'), '$450M')
})

// 매출 추이에 적자 분기가 들어온다. 음수가 압축을 건너뛰면 원본 자릿수가 화면에 새어 나온다.
test('marketCapLabel은 음수도 압축하고 부호를 유지한다', () => {
  assert.equal(marketCapLabel(-3_000_000_000_000, 'KR'), '-3.0조')
  assert.equal(marketCapLabel(-45_000_000_000, 'KR'), '-450억')
  assert.equal(marketCapLabel(-78_000_000_000, 'US'), '-$78.0B')
  assert.equal(marketCapLabel(-450_000_000, 'US'), '-$450M')
})

test('marketCapLabel은 결측을 "-"로 둔다', () => {
  assert.equal(marketCapLabel(null, 'KR'), '-')
  assert.equal(marketCapLabel(Number.NaN, 'US'), '-')
})

test('priceLabel은 시장별 통화 표기를 붙인다', () => {
  assert.equal(priceLabel(71_500, 'KR'), '71,500원')
  assert.equal(priceLabel(214.37, 'US'), '$214.37')
  assert.equal(priceLabel(null, 'US'), '-')
})

test('companyStanceLabel은 세 스탠스를 각각 다른 문구/색으로 매핑한다', () => {
  assert.equal(companyStanceLabel('positive').text, '긍정적')
  assert.equal(companyStanceLabel('neutral').text, '중립')
  assert.equal(companyStanceLabel('cautious').text, '신중')
  assert.notEqual(companyStanceLabel('positive').className, companyStanceLabel('cautious').className)
})
