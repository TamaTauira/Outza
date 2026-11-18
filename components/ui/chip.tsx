import * as React from 'react'
import { cn } from '@/lib/utils'

/** Equal-height filter chip. Selected state is a fill, not colour alone. */
export function Chip({
  pressed = false,
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        pressed ? 'bg-foreground text-background' : 'bg-muted text-foreground hover:bg-secondary',
        className,
      )}
      {...props}
    />
  )
}
