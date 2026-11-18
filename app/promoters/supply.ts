import { prisma } from '@/lib/prisma'
import { sydneyToday } from '@/lib/event-store'

export type SupplySnapshot = {
  events: number
  cities: number
  sources: number
  updated: string | null
}

/** Real catalogue counts. Returns null when the database cannot be read, and never fills in a guess. */
export async function supplySnapshot(): Promise<SupplySnapshot | null> {
  try {
    const today = sydneyToday()
    const from = new Date(`${today.toISOString().slice(0, 10)}T00:00:00.000Z`)
    const where = { date: { gte: from } }
    const [events, cityRows, sourceRows, refresh] = await Promise.all([
      prisma.event.count({ where }),
      prisma.event.groupBy({ by: ['city'], where }),
      prisma.event.groupBy({ by: ['source'], where }),
      prisma.refreshLog.findFirst({ where: { status: 'completed' }, orderBy: { endedAt: 'desc' }, select: { endedAt: true } }),
    ])
    return {
      events,
      cities: cityRows.filter((row) => row.city).length,
      sources: sourceRows.filter((row) => row.source).length,
      updated: refresh?.endedAt?.toISOString() ?? null,
    }
  } catch (err) {
    console.error('promoter supply snapshot failed', err instanceof Error ? err.message : err)
    return null
  }
}
