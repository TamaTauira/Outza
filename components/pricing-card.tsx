import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * One commercial tier. Prices, duration and product ids are passed in.
 * Unavailable plans stay visible and are not purchasable.
 */
export function PricingCard({
  name,
  price,
  duration,
  placement,
  inclusions,
  exclusions,
  renewal,
  action,
  unavailable = false,
  className,
}: {
  name: string
  price: string
  duration: string
  placement: string
  inclusions: string[]
  exclusions?: string[]
  renewal: string
  action?: ReactNode
  unavailable?: boolean
  className?: string
}) {
  return (
    <article className={cn('flex min-w-0 flex-col rounded-[var(--vp-radius-xl)] border border-border bg-card p-5', unavailable && 'opacity-80', className)}>
      <h3 className="font-display text-xl font-bold">{name}</h3>
      <p className="mt-2 font-display text-3xl font-extrabold tabular-nums">{price}</p>
      <p className="mt-1 text-sm text-muted-foreground">{duration}</p>
      <p className="mt-3 text-sm">{placement}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        {inclusions.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {exclusions && exclusions.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {exclusions.map((item) => <li key={item}>Not included: {item}</li>)}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{renewal}</p>
      {unavailable ? <p className="mt-4 text-sm font-semibold">Not on sale</p> : action ? <div className="mt-4">{action}</div> : null}
    </article>
  )
}
