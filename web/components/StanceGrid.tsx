import { stanceClassName } from '@/lib/format'

export function StanceGrid({
  title, items,
}: {
  title: string
  items: { label: string; stance: 'OW' | 'N' | 'UW'; sub?: string }[]
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-neutral-500">{title}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((it) => (
          <div key={it.label} className={`rounded-md p-2 text-sm ${stanceClassName(it.stance)}`}>
            <div className="font-medium">{it.label}</div>
            <div className="text-xs opacity-80">{it.stance}{it.sub ? ` · ${it.sub}` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
