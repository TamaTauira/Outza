'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Choice<T extends string> = { key: T; text: string; Icon?: LucideIcon }

/** One segmented control. Selected segment is the foreground fill. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (next: T) => void
  options: Choice<T>[]
  label: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex max-w-full shrink-0 rounded-full bg-muted p-1', className)}>
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
              'inline-flex h-control min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold sm:px-4',
              on ? 'bg-foreground text-background shadow-vp-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
            <span className="truncate">{text}</span>
          </button>
        )
      })}
    </div>
  )
}
