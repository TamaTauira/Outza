import type { ComponentType, MouseEvent } from 'react'
import { cn } from '@/lib/utils'

type IconProps = { className?: string; 'aria-hidden'?: boolean | 'true' }

/** Outlined stack button used by every control in the event action row. */
export function EventActionButton({
  icon: Icon,
  label,
  ariaLabel,
  pressed = false,
  onClick,
  className,
  iconClassName,
}: {
  icon: ComponentType<IconProps>
  label: string
  /** Accessible name when it should be longer than the visible word. */
  ariaLabel?: string
  pressed?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  className?: string
  iconClassName?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={ariaLabel ?? label}
      title={ariaLabel ?? label}
      className={cn(
        'flex h-11 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border bg-transparent px-1 text-xs font-semibold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        pressed ? 'border-primary text-primary' : 'border-border text-foreground hover:bg-muted',
        className,
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', iconClassName)} aria-hidden />
      <span className="max-w-full truncate leading-none">{label}</span>
    </button>
  )
}

/** Four equal actions. One column when the row only has Share. */
export function eventActionRowClass(single = false) {
  return cn('grid gap-2', single ? 'grid-cols-1' : 'grid-cols-4')
}
