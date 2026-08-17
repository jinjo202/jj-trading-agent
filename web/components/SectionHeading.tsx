/**
 * 섹션 제목. 전부 같은 크기의 회색 소제목이면 페이지가 평평해져서
 * "무엇부터 읽어야 하는가"가 안 보인다. 제목은 본문보다 확실히 무겁게 두고,
 * 부연은 제목 아래 작은 글씨로 내려 제목 줄이 짧게 유지되도록 한다.
 */
export function SectionHeading({
  title,
  note,
  right,
}: {
  title: string
  note?: string
  right?: React.ReactNode
}) {
  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {right}
      </div>
      {note && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{note}</p>}
    </div>
  )
}
