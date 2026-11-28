import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { bumpEngagement, missingRelation } from '@/lib/engagement-store'
import { reactionsEnabled } from '@/lib/feature-flags'
import { REACTION_KINDS, isReactionKind, reactionRateLimited, reactionTarget, reactionWrite, type ReactionKind } from '@/lib/reactions'

export type ReactionCounts = Record<ReactionKind, number>

/** The delegates the reaction store reads and writes. Tests pass a fake. */
export type ReactionDb = Pick<PrismaClient, 'event' | 'eventReaction' | 'attendance' | 'localListing' | 'localReaction'>

function emptyCounts(): ReactionCounts {
  return { HOT: 0, LOVE: 0, INTERESTED: 0, EXCITED: 0, GOING: 0 }
}

export async function reactionState(userId: string | null, eventId: string, db: ReactionDb = prisma) {
  const target = reactionTarget(eventId)
  if (target.type === 'local') return localReactionState(userId, target.listingId, db)
  return eventReactionState(userId, target.eventId, db)
}

async function eventReactionState(userId: string | null, eventId: string, db: ReactionDb) {
  if (!reactionsEnabled()) return { enabled: false as const, ready: true as const, counts: emptyCounts(), mine: [] as ReactionKind[] }
  try {
    const [rows, mine] = await Promise.all([
      db.eventReaction.groupBy({ by: ['kind'], where: { eventId }, _count: { _all: true } }),
      userId ? db.eventReaction.findMany({ where: { userId, eventId }, select: { kind: true } }) : Promise.resolve([]),
    ])
    const counts = emptyCounts()
    for (const row of rows) if (isReactionKind(row.kind)) counts[row.kind] = row._count._all
    return {
      enabled: true as const,
      ready: true as const,
      counts,
      mine: mine.map((row) => row.kind).filter(isReactionKind),
    }
  } catch (err) {
    if (!missingRelation(err)) console.error('reactions read failed', (err as Error)?.message)
    return { enabled: true as const, ready: false as const, counts: emptyCounts(), mine: [] as ReactionKind[] }
  }
}

async function localReactionState(userId: string | null, listingId: string, db: ReactionDb) {
  if (!reactionsEnabled()) return { enabled: false as const, ready: true as const, counts: emptyCounts(), mine: [] as ReactionKind[] }
  try {
    const [rows, mine] = await Promise.all([
      db.localReaction.groupBy({ by: ['kind'], where: { listingId }, _count: { _all: true } }),
      userId ? db.localReaction.findMany({ where: { userId, listingId }, select: { kind: true } }) : Promise.resolve([]),
    ])
    const counts = emptyCounts()
    for (const row of rows) if (isReactionKind(row.kind)) counts[row.kind] = row._count._all
    return {
      enabled: true as const,
      ready: true as const,
      counts,
      mine: mine.map((row) => row.kind).filter(isReactionKind),
    }
  } catch (err) {
    if (!missingRelation(err)) console.error('local reactions read failed', (err as Error)?.message)
    return { enabled: true as const, ready: false as const, counts: emptyCounts(), mine: [] as ReactionKind[] }
  }
}

export async function setReaction(userId: string, eventId: string, kind: ReactionKind, turnOn: boolean, db: ReactionDb = prisma) {
  if (!REACTION_KINDS.includes(kind)) return { status: 400 as const, error: 'Unknown reaction' }
  const target = reactionTarget(eventId)
  if (target.type === 'local') return setLocalReaction(userId, target.listingId, kind, turnOn, db)
  return setEventReaction(userId, target.eventId, kind, turnOn, db)
}

async function setEventReaction(userId: string, eventId: string, kind: ReactionKind, turnOn: boolean, db: ReactionDb) {
  if (kind !== 'GOING' && !reactionsEnabled()) return { status: 200 as const, enabled: false as const }
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) return { status: 404 as const, error: 'Event not found' }

  let existing = false
  let recent = 0
  try {
    const row = await db.eventReaction.findUnique({ where: { userId_eventId_kind: { userId, eventId, kind } }, select: { kind: true } })
    existing = !!row
    recent = await db.eventReaction.count({ where: { userId, updatedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } })
  } catch (err) {
    if (!missingRelation(err)) throw err
    if (kind !== 'GOING') return { status: 503 as const, error: 'Reactions are not ready yet.' }
  }

  const action = reactionWrite({ active: existing, turnOn })
  if (action === 'add' && reactionRateLimited(recent)) {
    return { status: 429 as const, error: 'Too many reactions in the last hour. Try again later.' }
  }

  if (kind === 'GOING') {
    if (turnOn) await db.attendance.createMany({ data: [{ userId, eventId }], skipDuplicates: true })
    else await db.attendance.deleteMany({ where: { userId, eventId } })
  }

  if (action !== 'unchanged') {
    try {
      if (action === 'add') {
        await db.eventReaction.create({ data: { userId, eventId, kind } })
        await bumpEngagement(eventId, kind === 'GOING' ? 'GOING' : 'REACTION')
        const { METRIC, recordProductMetrics } = await import('@/lib/product-metrics')
        await recordProductMetrics([{
          name: kind === 'GOING' ? METRIC.going : METRIC.reaction,
          subjectId: eventId,
          subjectKind: 'event',
          dim: kind === 'GOING' ? '' : kind,
        }])
      } else {
        await db.eventReaction.deleteMany({ where: { userId, eventId, kind } })
      }
    } catch (err) {
      if (!(kind === 'GOING' && missingRelation(err))) throw err
    }
  }

  const state = await eventReactionState(userId, eventId, db)
  return { status: 200 as const, ...state, going: kind === 'GOING' ? turnOn : state.mine.includes('GOING') }
}

async function setLocalReaction(userId: string, listingId: string, kind: ReactionKind, turnOn: boolean, db: ReactionDb) {
  if (kind !== 'GOING' && !reactionsEnabled()) return { status: 200 as const, enabled: false as const }
  const listing = await db.localListing.findUnique({ where: { id: listingId }, select: { id: true } })
  if (!listing) return { status: 404 as const, error: 'Listing not found' }

  let existing = false
  let recent = 0
  try {
    const row = await db.localReaction.findUnique({ where: { userId_listingId_kind: { userId, listingId, kind } }, select: { kind: true } })
    existing = !!row
    recent = await db.localReaction.count({ where: { userId, updatedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } })
  } catch (err) {
    if (!missingRelation(err)) throw err
    if (kind !== 'GOING') return { status: 503 as const, error: 'Reactions are not ready yet.' }
  }

  const action = reactionWrite({ active: existing, turnOn })
  if (action === 'add' && reactionRateLimited(recent)) {
    return { status: 429 as const, error: 'Too many reactions in the last hour. Try again later.' }
  }

  // No Attendance or EngagementDay sync: both are keyed to Event rows, and a
  // Local listing is not one. A Local "Going" is the reaction row itself.
  if (action !== 'unchanged') {
    try {
      if (action === 'add') {
        await db.localReaction.create({ data: { userId, listingId, kind } })
        const { METRIC, recordProductMetrics } = await import('@/lib/product-metrics')
        await recordProductMetrics([{
          name: kind === 'GOING' ? METRIC.going : METRIC.reaction,
          subjectId: listingId,
          subjectKind: 'local',
          dim: kind === 'GOING' ? '' : kind,
        }])
      } else {
        await db.localReaction.deleteMany({ where: { userId, listingId, kind } })
      }
    } catch (err) {
      if (!(kind === 'GOING' && missingRelation(err))) throw err
    }
  }

  const state = await localReactionState(userId, listingId, db)
  return { status: 200 as const, ...state, going: kind === 'GOING' ? turnOn : state.mine.includes('GOING') }
}
