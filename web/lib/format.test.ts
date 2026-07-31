import { test } from 'node:test'
import assert from 'node:assert/strict'
import { equityWeightLabel, scoreGaugeColor, signalLabel, stanceClassName } from './format.ts'

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
