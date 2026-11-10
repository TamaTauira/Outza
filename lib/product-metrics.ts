import { prisma } from '@/lib/db'
import { missingRelation } from '@/lib/engagement-store'
import { collapseHits, type MetricHit } from '@/lib/organiser-reach'

/**
 * Shared first-party counters for organiser analytics and the admin metrics dashboard.
 * Rows are daily totals. They never store a user id, IP, email, or exact address.
 * See docs/product-metrics.md for the name and dim contract.
 */
export const METRIC = {
  seen: 'seen',
  open: 'open',
  save: 'save',
  ticket: 'ticket',
  info: 'info',
  reaction: 'reaction',
  going: 'going',
  share: 'share',
  calendar: 'calendar',
  plan: 'plan',
  itinerary: 'itinerary',
  search: 'search',
  place: 'place',
  hour: 'hour',
  followCategory: 'follow_category',
  followVenue: 'follow_venue',
  spotlightImpression: 'spotlight_impression',
  spotlightClick: 'spotlight_click',
  shareVisit: 'share_visit',
} as const

export async function recordProductMetrics(hits: MetricHit[], now = new Date()): Promise<void> {
  const rows = collapseHits(hits, now).slice(0, 40)
  if (!rows.length) return
  try {
    await Promise.all(rows.map((row) => prisma.productMetric.upsert({
      where: { day_name_subjectId_subjectKind_dim: { day: row.day, name: row.name, subjectId: row.subjectId, subjectKind: row.subjectKind, dim: row.dim } },
      create: row,
      update: { count: { increment: row.count } },
    })))
  } catch (err) {
    if (!missingRelation(err)) console.error('product metric failed', (err as Error)?.message)
  }
}

export async function recordSeen(eventIds: string[], surface: string, term?: string | null, now = new Date()): Promise<void> {
  const ids = [...new Set(eventIds)].filter(Boolean).slice(0, 12)
  if (!ids.length) return
  const hits: MetricHit[] = ids.map((subjectId) => ({ name: METRIC.seen, subjectId, subjectKind: 'event', dim: surface, at: now }))
  if (term) for (const subjectId of ids) hits.push({ name: METRIC.search, subjectId, subjectKind: 'event', dim: term, at: now })
  await recordProductMetrics(hits, now)
}
