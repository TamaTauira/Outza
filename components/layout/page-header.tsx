import type { ReactNode } from 'react'
import { PageHeading } from '@/components/page-heading'
import { cn } from '@/lib/utils'

/** Eyebrow, title and lede for pages that are not one of the four tab heroes. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  lede?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="vp-eyebrow text-muted-foreground">{eyebrow}</p> : null}
        <PageHeading className={cn(eyebrow && 'mt-2')}>{title}</PageHeading>
        {lede ? <div className="mt-2 max-w-[var(--vp-measure)] text-body text-muted-foreground">{lede}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  )
}
