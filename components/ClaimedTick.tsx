'use client'

import { CLAIMED_TICK_COPY } from '@/lib/ownership'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** Small claimed mark. A rounded shield, in the site’s own orange, not a social-network badge. */
export function ClaimedTick({ kind, className }: { kind: keyof typeof CLAIMED_TICK_COPY; className?: string }) {
  const copy = CLAIMED_TICK_COPY[kind]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-primary align-[-0.15em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
          aria-label={copy.label}
          title={copy.label}
        >
          <svg viewBox="0 0 20 20" className="h-full w-full" aria-hidden="true">
            <path
              fill="currentColor"
              d="M10 1.4c1.8.6 3.7 1.05 5.8 1.2.6.06 1.05.56 1.05 1.16v6.05c0 3.25-2.1 5.9-5.2 7.45-.55.27-1.2.27-1.75 0C5.25 15.7 3.15 13.05 3.15 9.8V3.76c0-.6.45-1.1 1.05-1.16C6.3 2.45 8.2 2 10 1.4Z"
            />
            <path
              d="M6.55 10.15 8.75 12.35 13.5 7.45"
              fill="none"
              stroke="hsl(var(--primary-foreground))"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-64 p-3 text-left">
        <p className="text-sm font-medium text-popover-foreground">{copy.label}</p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{copy.body}</p>
      </PopoverContent>
    </Popover>
  )
}
