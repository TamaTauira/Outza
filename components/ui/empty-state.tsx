import type { ReactNode } from 'react'
import Link from 'next/link'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ActionObject = { href?: string; label: string; onClick?: () => void }

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
  secondary?: { href: string; label: string }
  examples?: string[]
  icon?: ReactNode
  mascot?: boolean
  size?: 'inline' | 'page'
  className?: string
}) {
  const copy = body ?? lede ?? ''
  const showMascot = mascot ?? size === 'page'
  const actionNode = isActionObject(action) ? <ActionButton action={action} /> : action

  return (
    <div className={cn(size === 'page' ? 'px-4 pb-8 pt-2 text-center sm:pb-10 sm:pt-4' : 'px-4 py-10 text-center', className)}>
      {showMascot ? <VibePeepMascot className="mx-auto w-24 sm:w-28" alt="VibePeep the robot, waving" /> : null}
      {!showMascot && icon ? <div className="mb-3 flex justify-center text-primary">{icon}</div> : null}
      <h2 className={cn('font-display font-bold tracking-tight', size === 'page' ? 'mt-4 text-h2' : 'text-h3')}>{title}</h2>
      {copy ? <p className="mx-auto mt-2 max-w-[var(--vp-measure)] text-body text-muted-foreground">{copy}</p> : null}
      {(actionNode || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actionNode}
          {secondary ? <Button variant="outline" asChild><Link href={secondary.href}>{secondary.label}</Link></Button> : null}
        </div>
      )}
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
  return !!action && typeof action === 'object' && 'label' in action
}

function ActionButton({ action }: { action: ActionObject }) {
  if (action.onClick) return <Button type="button" onClick={action.onClick}>{action.label}</Button>
  return <Button asChild><Link href={action.href ?? '/'}>{action.label}</Link></Button>
}
