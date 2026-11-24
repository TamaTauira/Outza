import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const PAD = { sm: 'p-card-sm', md: 'p-card', lg: 'p-card-lg' } as const
const TONE = {
  card: 'border border-border bg-card text-card-foreground shadow-vp-sm',
  muted: 'bg-muted text-foreground',
  dark: 'bg-[var(--vp-banner)] text-[var(--vp-text-primary)]',
  dashed: 'border border-dashed border-border bg-muted/40 text-foreground',
} as const

/** The one card surface. 16px radius, shared padding. */
export function Surface({
  pad = 'md',
  tone = 'card',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  pad?: keyof typeof PAD
  tone?: keyof typeof TONE
  children?: ReactNode
}) {
  return (
    <div className={cn('rounded-card', PAD[pad], TONE[tone], className)} {...props}>
      {children}
    </div>
  )
}
