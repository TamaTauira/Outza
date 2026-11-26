'use client'

import { Bookmark } from 'lucide-react'
import { EventActionButton } from '@/components/event-action-button'
import { cn } from '@/lib/utils'

/** Bookmark everywhere. The visible word is Saved once the event is saved. */
export function SaveButton({
  saved,
  onClick,
  label,
  tone = 'surface',
  variant = 'icon',
  className,
}: {
  saved: boolean
  onClick: () => void
  /** Accessible name. The stack variant shows Save or Saved as the visible word. */
  label?: string
  tone?: 'surface' | 'media'
  variant?: 'icon' | 'stack'
  className?: string
}) {
  const name = label ?? (saved ? 'Saved' : 'Save')
  if (variant === 'stack') {
    return (
      <EventActionButton
        icon={Bookmark}
        label={saved ? 'Saved' : 'Save'}
        ariaLabel={name}
        pressed={saved}
        iconClassName={saved ? 'fill-current' : undefined}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onClick()
        }}
        className={className}
      />
    )
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      aria-pressed={saved}
      aria-label={name}
      className={cn(
        'grid h-11 w-11 shrink-0 place-items-center rounded-full',
        tone === 'media' ? 'bg-black/55 text-white' : 'bg-muted text-foreground',
        className,
      )}
    >
      <Bookmark className={cn('h-4 w-4', saved && 'fill-current text-brand-pink')} aria-hidden />
    </button>
  )
}
