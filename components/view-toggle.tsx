'use client'

import { LayoutList, Map as MapIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shared List / Map control. The two buttons always stay on the same dataset. */
export function ViewToggle({
  value,
  onChange,
  listLabel = 'List',
  mapLabel = 'Map',
  label = 'List or map',
}: {
  value: 'list' | 'map'
  onChange: (next: 'list' | 'map') => void
  listLabel?: string
  mapLabel?: string
  label?: string
}) {
  const options = [
    { key: 'list' as const, text: listLabel, Icon: LayoutList },
    { key: 'map' as const, text: mapLabel, Icon: MapIcon },
  ]
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full rounded-full bg-muted p-1">
      {options.map(({ key, text, Icon }) => {
        const on = value === key
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(key)}
            className={cn(
              'inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors sm:px-4',
              on ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{text}</span>
          </button>
        )
      })}
    </div>
  )
}
