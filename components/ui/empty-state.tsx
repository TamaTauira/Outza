import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared empty state: one heading, one sentence, one action. */
export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string
  body: string
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('px-4 py-10 text-center', className)}>
      {icon ? <div className="mb-3 flex justify-center text-primary">{icon}</div> : null}
      <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-[var(--vp-measure)] text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
