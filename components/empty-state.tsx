import Link from 'next/link'
import { VibePeepMascot } from '@/components/vibepeep-mascot'

/** Shared signed-out and empty layout: mascot, one line, one primary action, greyed examples. */
export function EmptyState({
  title,
  lede,
  action,
  secondary,
  examples,
}: {
  title: string
  lede: string
  action: { href?: string; label: string; onClick?: () => void }
  secondary?: { href: string; label: string }
  examples: string[]
}) {
  return (
    <div className="px-4 py-10 text-center">
      <VibePeepMascot className="mx-auto w-28 sm:w-32" alt="VibePeep the robot, waving" />
      <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground sm:text-base">{lede}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {action.onClick ? (
          <button type="button" onClick={action.onClick} className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90">{action.label}</button>
        ) : (
          <Link href={action.href ?? '/'} className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90">{action.label}</Link>
        )}
        {secondary && <Link href={secondary.href} className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted">{secondary.label}</Link>}
      </div>
      <ul className="mx-auto mt-8 max-w-md space-y-2 text-left" aria-hidden>
        {examples.map((example) => (
          <li key={example} className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground/80">{example}</li>
        ))}
      </ul>
    </div>
  )
}
