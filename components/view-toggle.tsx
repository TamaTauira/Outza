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
  compact = false,
}: {
  value: 'list' | 'map'
  onChange: (next: 'list' | 'map') => void
  listLabel?: string
  mapLabel?: string
  label?: string
  /** Shorter buttons so the control can sit beside a heading on a phone. */
  compact?: boolean
}) {
  const options = [
    { key: 'list' as const, text: listLabel, Icon: LayoutList },
    { key: 'map' as const, text: mapLabel, Icon: MapIcon },
  ]
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex max-w-full shrink-0 rounded-full bg-muted', compact ? 'p-0.5' : 'p-1')}>
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
              'inline-flex min-w-0 items-center justify-center rounded-full font-semibold transition-colors',
              compact ? 'h-8 gap-1 px-2 text-xs sm:h-11 sm:gap-1.5 sm:px-4 sm:text-sm' : 'h-11 gap-1.5 px-3 text-sm sm:px-4',
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
