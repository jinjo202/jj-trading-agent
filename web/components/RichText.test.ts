import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * RichText가 쓰는 분해 규칙만 따로 검증한다. JSX 렌더러를 띄우지 않고도
 * "무엇이 굵어지고 무엇이 평문으로 남는가"는 이 배열로 전부 확인된다.
 */
const split = (text: string): string[] => text.split(/\*\*(.+?)\*\*/gs)

test('짝이 맞는 **는 홀수 인덱스로 분리되어 굵게 처리된다', () => {
  assert.deepEqual(split('a**b**c'), ['a', 'b', 'c'])
  assert.deepEqual(split('**앞**과 **뒤**'), ['', '앞', '과 ', '뒤', ''])
})

// 짝이 안 맞는 별표가 문장을 삼키면 본문이 화면에서 사라진다. 평문으로 남아야 한다.
test('짝이 맞지 않는 **는 글자로 남는다', () => {
  assert.deepEqual(split('a**b'), ['a**b'])
  assert.deepEqual(split('**'), ['**'])
})

test('여러 줄에 걸친 강조도 잡는다', () => {
  assert.deepEqual(split('앞 **두\n줄** 뒤'), ['앞 ', '두\n줄', ' 뒤'])
})

test('강조가 없으면 통째로 한 조각이다', () => {
  assert.deepEqual(split('평범한 문장'), ['평범한 문장'])
})
