'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldCheck, ShieldAlert, Shield, RefreshCw, Repeat } from 'lucide-react'
import { checkedAgo } from '@/lib/board'
import { cn } from '@/lib/utils'

export type EventQuality = {
  confidence: { score: number; level: 'high' | 'medium' | 'low'; reasons: string[] }
  status: { label: string; tone: 'bad' | 'warn'; note: string } | null
  price: { range: string; fees: string | null }
  recurrence: string | null
  sources: string[]
  checkedAt: string
  verified?: { ok: boolean; missing: string[] }
  schedule?: { label: string; detail: string }
  availability?: { label: string; note: string }
}

export const CONFIDENCE_META = {
  high: { label: 'High confidence', short: 'Confirmed', Icon: ShieldCheck, text: 'text-free', bg: 'bg-free/15', bar: 'bg-free' },
  medium: { label: 'Medium confidence', short: 'Check details', Icon: Shield, text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/15', bar: 'bg-amber-500' },
  low: { label: 'Low confidence', short: 'Unconfirmed', Icon: ShieldAlert, text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/15', bar: 'bg-red-500' },
} as const

/** Cancelled / postponed / reported-sold-out banner. Always attributed, never presented as live availability. */
export function StatusBanner({ status }: { status: EventQuality['status'] }) {
  if (!status) return null
  return (
    <div className={cn('flex items-start gap-3 rounded-lg px-4 py-3 mb-5', status.tone === 'bad' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300')}>
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">{status.label}</p>
        <p className="text-sm opacity-90">{status.note}</p>
      </div>
    </div>
  )
}

/** Explains how much the listing can be trusted: source, recency of the last check, agreement between sources and completeness. */
export function DataConfidence({ quality }: { quality: EventQuality }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => { setNow(Date.now()) }, [])
  const { confidence: c } = quality
  const meta = CONFIDENCE_META[c.level]
  const ago = now ? checkedAgo(quality.checkedAt, now) : null

  return (
    <section className="rounded-lg bg-muted/50 p-4" aria-label="Listing confidence">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', meta.bg, meta.text)}>
          <meta.Icon className="w-3.5 h-3.5" />{meta.label}
        </span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{c.score}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-border overflow-hidden mb-3" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.score} aria-label="Confidence score">
        <div className={cn('h-full rounded-full', meta.bar)} style={{ width: `${c.score}%` }} />
      </div>
      <p className="flex items-center gap-1.5 text-sm text-foreground mb-2">
        <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        Last verified <span className="font-medium">{ago ?? 'recently'}</span>
      </p>
      {quality.recurrence && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
          <Repeat className="w-3.5 h-3.5" />{quality.recurrence} event
        </p>
      )}
      {quality.verified && (
        <p className={cn('text-sm font-semibold mb-2', quality.verified.ok ? 'text-primary' : 'text-muted-foreground')}>
          {quality.verified.ok ? 'VibePeep Verified' : 'Not VibePeep Verified'}
        </p>
      )}
      {quality.schedule && <p className="text-sm text-foreground mb-1"><span className="font-medium">{quality.schedule.label}.</span> {quality.schedule.detail}</p>}
      {quality.availability && <p className="text-sm text-foreground mb-2"><span className="font-medium">Availability: {quality.availability.label}.</span> {quality.availability.note}</p>}
      <ul className="space-y-1 text-sm text-muted-foreground list-disc pl-5">
        {(quality.verified && !quality.verified.ok ? quality.verified.missing : c.reasons).map((r) => <li key={r}>{r}</li>)}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Details can change. Always confirm the date, price and availability with the ticket seller before you go.
      </p>
    </section>
  )
}
