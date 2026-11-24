import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared call-to-action band. Dark or card, same padding and radius. */
export function CtaBanner({
  tone = 'card',
  title,
  lede,
  action,
  className,
}: {
  tone?: 'dark' | 'card'
  title: string
  lede?: string
  action?: ReactNode
  className?: string
}) {
  const dark = tone === 'dark'
  return (
    <section className={cn(
      'mt-section flex flex-col items-start justify-between gap-4 rounded-hero px-5 py-5 sm:flex-row sm:items-center',
      dark ? 'bg-[var(--vp-banner)] text-white' : 'border border-border bg-card text-card-foreground',
      className,
    )}>
      <div>
        <h2 className="font-display text-h3">{title}</h2>
        {lede ? <p className={cn('mt-1 text-sm', dark ? 'text-white/80' : 'text-muted-foreground')}>{lede}</p> : null}
      </div>
      {action}
    </section>
  )
}
