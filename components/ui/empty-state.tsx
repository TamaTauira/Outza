import type { ReactNode } from 'react'
import Link from 'next/link'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ActionObject = { href?: string; label: string; onClick?: () => void }

/** One Tummer width for every page empty state. 112px on a phone, 128px from 640px. */
const PAGE_MASCOT_CLASS = 'mx-auto w-28 sm:w-32'
const PAGE_MASCOT_SIZES = '(max-width: 640px) 112px, 128px'

/** One empty state. `page` is the mascot layout. `inline` is a quiet block inside a page. */
export function EmptyState({
  title,
  body,
  lede,
  action,
  secondary,
  examples,
  icon,
  mascot,
  size = 'inline',
  className,
}: {
  title: string
  body?: string
  lede?: string
  action?: ReactNode | ActionObject
  secondary?: { href?: string; label: string; onClick?: () => void }
  examples?: string[]
  icon?: ReactNode
  mascot?: boolean
  size?: 'inline' | 'page'
  className?: string
}) {
  const copy = body ?? lede ?? ''
  const showMascot = mascot ?? size === 'page'
  const actionNode = isActionObject(action) ? <ActionButton action={action} /> : action
  const page = size === 'page'

  return (
    <div className={cn(page ? 'rounded-card bg-card px-5 py-8 shadow-vp-md sm:px-10 sm:py-12' : 'px-4 py-10 text-center', className)}>
      <div className={cn(page ? 'grid items-center gap-6 text-center lg:grid-cols-[9rem_minmax(0,1fr)] lg:text-left' : 'text-center')}>
        {showMascot ? <VibePeepMascot className={PAGE_MASCOT_CLASS} sizes={PAGE_MASCOT_SIZES} alt="VibePeep the robot, waving" /> : null}
        {!showMascot && icon ? <div className="mb-3 flex justify-center text-primary">{icon}</div> : null}
        <div>
          <h2 className={cn('font-display font-bold tracking-tight', page ? 'text-h2' : 'text-h3', showMascot && !page ? 'mt-4' : null)}>{title}</h2>
          {copy ? <p className={cn('mx-auto mt-2 max-w-[var(--vp-measure)] text-body text-muted-foreground', page && 'lg:mx-0')}>{copy}</p> : null}
          {(actionNode || secondary) ? (
            <div className={cn('mt-5 flex flex-wrap items-center justify-center gap-2', page && 'lg:justify-start')}>
              {actionNode}
              {secondary ? <ActionButton action={{ ...secondary, href: secondary.href }} outline /> : null}
            </div>
          ) : null}
        </div>
      </div>
      {examples && examples.length > 0 ? (
        <ul className="mx-auto mt-8 max-w-md space-y-2 text-left lg:grid lg:max-w-none lg:grid-cols-3 lg:gap-card lg:space-y-0" aria-hidden>
          {examples.map((example) => (
            <li key={example} className="rounded-card border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{example}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function isActionObject(action: ReactNode | ActionObject | undefined): action is ActionObject {
  return !!action && typeof action === 'object' && 'label' in action && !('$$typeof' in action)
}

function ActionButton({ action, outline = false }: { action: ActionObject; outline?: boolean }) {
  const variant = outline ? 'outline' : 'default'
  if (action.onClick) return <Button type="button" variant={variant} onClick={action.onClick}>{action.label}</Button>
  return <Button variant={variant} asChild><Link href={action.href ?? '/'}>{action.label}</Link></Button>
}
