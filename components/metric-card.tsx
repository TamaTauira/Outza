import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

/** A verified figure, the window it covers, and a plain definition. No sample numbers. */
export function MetricCard({
  label,
  value,
  window,
  definition,
  icon: Icon,
  className,
}: {
  label: string
  value: string
  window?: string
  definition: string
  icon?: ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <div className={cn('rounded-[var(--vp-radius-lg)] border border-border bg-card p-5', className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
        <span>{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</p>
      {window ? <p className="mt-1 text-xs text-muted-foreground">{window}</p> : null}
      <p className="mt-1 text-xs text-muted-foreground">{definition}</p>
    </div>
  )
}
