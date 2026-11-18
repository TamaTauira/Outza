import { cn } from '@/lib/utils'

const TONES = {
  free: 'bg-emerald-700 text-white',
  soldOut: 'bg-foreground text-background',
  cancelled: 'bg-destructive text-destructive-foreground',
  postponed: 'bg-[var(--vp-brand-amber)] text-[#1a1408]',
  sponsored: 'bg-[var(--vp-brand-amber)] text-[#1a1408]',
  past: 'bg-muted text-muted-foreground',
  pending: 'bg-muted text-foreground',
  approved: 'bg-emerald-700/15 text-emerald-800 dark:text-emerald-200',
  rejected: 'bg-destructive/15 text-destructive',
  live: 'bg-free/15 text-free',
} as const

export type StatusTone = keyof typeof TONES

/** Status is text plus a tone. Colour is never the only signal. */
export function StatusLabel({ tone, children, className }: { tone: StatusTone; children: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-[var(--vp-radius-sm)] px-2 py-0.5 text-[13px] font-semibold leading-none', TONES[tone], className)}>
      {children}
    </span>
  )
}
