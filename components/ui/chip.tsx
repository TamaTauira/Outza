import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Filter chip. Selected state is the brand fill, in both themes. */
export function Chip({
  pressed = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium',
        pressed ? 'bg-primary text-primary-foreground' : 'border border-input bg-transparent hover:bg-muted',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
