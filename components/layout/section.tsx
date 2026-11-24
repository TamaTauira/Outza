import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Section({
  children,
  className,
  id,
  label,
}: {
  children: ReactNode
  className?: string
  id?: string
  label?: string
}) {
  return (
    <section id={id} aria-labelledby={label} className={cn('mt-section', className)}>
      {children}
    </section>
  )
}

export function SectionHeader({
  title,
  lede,
  actions,
  id,
  level = 'h2',
}: {
  title: string
  lede?: string
  actions?: ReactNode
  id?: string
  level?: 'h2' | 'h3'
}) {
  const Title = level === 'h3' ? 'h3' : 'h2'
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Title id={id} className={cn('font-display', level === 'h3' ? 'text-h3' : 'text-h2')}>{title}</Title>
        {lede ? <p className="mt-1 text-muted-foreground">{lede}</p> : null}
      </div>
      {actions}
    </div>
  )
}
