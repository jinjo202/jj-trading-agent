import { Fragment } from 'react'

/**
 * agent가 쓴 문장의 `**굵게**`만 렌더한다.
 *
 * 마크다운 라이브러리를 넣지 않는 이유: 여기 들어오는 것은 LLM이 쓴 한두 문단이고
 * 필요한 문법은 강조 하나뿐이다. 파서를 통째로 들이면 표·링크·이미지까지 렌더 가능해져
 * **LLM 출력이 곧 마크업이 되는 표면**이 생긴다. 굵게만 처리하고 나머지는 평문으로 둔다.
 *
 * 짝이 맞지 않는 `**`는 그대로 글자로 남는다 — 문장을 삼키는 것보다 낫다.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/gs)
  return (
    <span className={className}>
      {parts.map((part, i) =>
        // split의 캡처 그룹은 항상 홀수 인덱스에 온다.
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-neutral-900 dark:text-neutral-100">
            {part}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  )
}
