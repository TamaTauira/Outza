'use client'

import { Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Bookmark everywhere. Brand pink once the event is saved. */
export function SaveButton({
  saved,
  onClick,
  label,
  className,
}: {
  saved: boolean
  onClick: () => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      aria-pressed={saved}
      aria-label={label}
      className={cn('grid h-control w-control shrink-0 place-items-center rounded-full bg-muted text-foreground', className)}
    >
      <Bookmark className={cn('h-4 w-4', saved && 'fill-current text-brand-pink')} aria-hidden />
    </button>
  )
}
