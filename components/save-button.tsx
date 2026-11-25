'use client'

import { Bookmark } from 'lucide-react'
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
        variant === 'stack'
          ? 'flex h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-xs font-semibold'
          : 'grid h-11 w-11 shrink-0 place-items-center rounded-full',
        variant === 'stack'
          ? (saved ? 'border-primary text-primary' : 'border-border text-foreground')
          : (tone === 'media' ? 'bg-black/55 text-white' : 'bg-muted text-foreground'),
        className,
      )}
    >
      <Bookmark className={cn('h-4 w-4', saved && 'fill-current', variant === 'icon' && saved && 'text-brand-pink')} aria-hidden />
      {variant === 'stack' ? <span>{saved ? 'Saved' : 'Save'}</span> : null}
    </button>
  )
}
