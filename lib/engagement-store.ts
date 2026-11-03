import { prisma } from '@/lib/db'
import { heatScore, organicHeat, type EngagementKind, type EngagementPoint } from '@/lib/engagement-heat'

export function missingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'P2021' || code === 'P2022'
}

/** Adds one to today's total. Failures are logged and never shown to the visitor. */
export async function bumpEngagement(eventId: string, kind: EngagementKind): Promise<void> {
  const day = new Date().toISOString().slice(0, 10)
  try {
    await prisma.engagementDay.upsert({
      where: { eventId_day_kind: { eventId, day, kind } },
      create: { eventId, day, kind, count: 1 },
      update: { count: { increment: 1 } },
    })
  } catch (err) {
    if (!missingRelation(err)) console.error('engagement bump failed', (err as Error)?.message)
  }
}

export async function heatForEvents(ids: string[], now = new Date()): Promise<Map<string, number>> {
  const scores = new Map<string, number>()
  if (!ids.length) return scores
  const from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)
  try {
    const rows = await prisma.engagementDay.findMany({
      where: { eventId: { in: ids }, day: { gte: from } },
      select: { eventId: true, day: true, kind: true, count: true },
    })
    const grouped = new Map<string, EngagementPoint[]>()
    for (const row of rows) {
      const list = grouped.get(row.eventId) ?? []
      list.push(row)
      grouped.set(row.eventId, list)
    }
    for (const [id, points] of grouped) {
      const score = organicHeat(false, heatScore(points, now))
      if (score > 0) scores.set(id, score)
    }
  } catch (err) {
    if (!missingRelation(err)) console.error('heat read failed', (err as Error)?.message)
  }
  return scores
}

/** Saves, reactions, going marks and ticket clicks over the last 14 days, split in half. */
export async function actionWindows(eventIds: string[], now = new Date()): Promise<{ recent: number | null; previous: number | null }> {
  if (!eventIds.length) return { recent: null, previous: null }
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`)
  const from = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10)
  try {
    const rows = await prisma.engagementDay.findMany({
      where: {
        eventId: { in: eventIds },
        day: { gte: from },
        kind: { in: ['SAVE', 'GOING', 'REACTION', 'TICKET'] },
      },
      select: { day: true, count: true },
    })
    if (!rows.length) return { recent: null, previous: null }
    let recent = 0
    let previous = 0
    for (const row of rows) {
      const age = Math.round((today - Date.parse(`${row.day}T00:00:00.000Z`)) / 86400000)
      if (age <= 6) recent += row.count
      else if (age <= 13) previous += row.count
    }
    return { recent, previous }
  } catch (err) {
    if (!missingRelation(err)) console.error('engagement window failed', (err as Error)?.message)
    return { recent: null, previous: null }
  }
}
