import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** One lede under every account heading: same size, line-height and colour. */
export const accountLedeClass = 'text-sm leading-relaxed text-muted-foreground'

/**
 * Heading for an account card. Title, optional badge and lede share one gap
 * before whatever the card does next.
 */
export function AccountCardHeader({
  title,
  lede,
  aside,
  className,
}: {
  title: ReactNode
  lede?: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 font-semibold leading-snug">{title}</h2>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {lede ? <div className={cn('mt-2', accountLedeClass)}>{lede}</div> : null}
    </div>
  )
}

/**
 * A block inside a settings card. Password and Close account use it so the
 * heading, the paragraph and the first control keep the same gaps.
 */
export function SettingsSection({
  title,
  lede,
  children,
  className,
  id,
}: {
  title: string
  lede?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={className}>
      <h2 className="font-semibold leading-snug">{title}</h2>
      {lede ? <div className={cn('mt-2 space-y-3', accountLedeClass)}>{lede}</div> : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}
