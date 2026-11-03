/**
 * Alerts for ingestion health. An empty or shrinking feed is recorded.
 * Nothing here deletes listings.
 */
import { prisma } from '@/lib/prisma'

export type VolumeSignal = 'zero' | 'drop' | null

/**
 * Compare this run with the previous finished run of the same source.
 * A timeout or a hard failure is not treated as a real drop.
 * A source that has never saved events (for example Ticketek with no feed configured) stays quiet.
 */
export function volumeAlert(previous: number | null, current: number, opts: { timedOut?: boolean; failed?: boolean } = {}): VolumeSignal {
  if (opts.timedOut || opts.failed) return null
  if (previous == null || previous < 20) return null
  if (current === 0) return 'zero'
  if (previous >= 40 && current < previous * 0.5) return 'drop'
  return null
}

/** A successful response with no rows. Callers must not delete the listings they already have. */
export function emptyFeedAlert(received: number): boolean {
  return received === 0
}

/** True when parsing breaks often enough to look like a feed change, not a few bad rows. */
export function parseFailureAlert(parsed: number, failed: number): boolean {
  if (failed < 10) return false
  const total = parsed + failed
  return total > 0 && failed / total >= 0.2
}

/** Share of a quality pass that was auto-merged. Small passes stay quiet. */
export function duplicateSpikeAlert(considered: number, merged: number): boolean {
  if (considered < 200 || merged < 0) return false
  return merged / considered >= 0.25
}

/** Most rows had no venue name from the source. */
export function venueGapAlert(withVenue: number, total: number): boolean {
  if (total < 30) return false
  return withVenue / total < 0.5
}

/** An empty source never retires listings that are already stored. */
export function retireOnEmpty(_received: number): false {
  return false
}

export type QualityAlertKind = 'ZERO_EVENTS' | 'VOLUME_DROP' | 'DUPLICATE_SPIKE' | 'PARSE_FAILURES' | 'VENUE_GAP'

function missingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'P2021' || code === 'P2022'
}

/** Store the alert and reuse the existing owner-fault email. Never throws. Never deletes events. */
export async function recordQualityAlert(input: { kind: QualityAlertKind; source: string; detail: string }) {
  try {
    await prisma.dataQualityAlert.create({
      data: { kind: input.kind, source: input.source.slice(0, 80), detail: input.detail.slice(0, 2000) },
    })
  } catch (err) {
    if (!missingRelation(err)) console.error('[quality-alert] store failed', (err as { message?: string })?.message)
  }
  try {
    const { reportFault } = await import('@/lib/owner-alerts')
    await reportFault({
      area: 'Event data quality',
      key: `quality-${input.kind}-${input.source}`,
      route: '/admin/sources',
      title: `${input.source}: ${input.kind.toLowerCase().replace(/_/g, ' ')}`,
      detail: input.detail,
    })
  } catch (err) {
    console.error('[quality-alert] fault report failed', (err as { message?: string })?.message)
  }
}
