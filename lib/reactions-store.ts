import { prisma } from '@/lib/db'
import { bumpEngagement, missingRelation } from '@/lib/engagement-store'
import { reactionsEnabled } from '@/lib/feature-flags'
import { REACTION_KINDS, isReactionKind, reactionRateLimited, reactionWrite, type ReactionKind } from '@/lib/reactions'

export type ReactionCounts = Record<ReactionKind, number>

function emptyCounts(): ReactionCounts {
  return { HOT: 0, LOVE: 0, INTERESTED: 0, EXCITED: 0, GOING: 0 }
}

export async function reactionState(userId: string | null, eventId: string) {
  if (!reactionsEnabled()) return { enabled: false as const, ready: true as const, counts: emptyCounts(), mine: [] as ReactionKind[] }
  try {
    const [rows, mine] = await Promise.all([
      prisma.eventReaction.groupBy({ by: ['kind'], where: { eventId }, _count: { _all: true } }),
      userId ? prisma.eventReaction.findMany({ where: { userId, eventId }, select: { kind: true } }) : Promise.resolve([]),
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

export async function setReaction(userId: string, eventId: string, kind: ReactionKind, turnOn: boolean) {
  if (!REACTION_KINDS.includes(kind)) return { status: 400 as const, error: 'Unknown reaction' }
  if (kind !== 'GOING' && !reactionsEnabled()) return { status: 200 as const, enabled: false as const }
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) return { status: 404 as const, error: 'Event not found' }

  let existing = false
  let recent = 0
  try {
    const row = await prisma.eventReaction.findUnique({ where: { userId_eventId_kind: { userId, eventId, kind } }, select: { kind: true } })
    existing = !!row
    recent = await prisma.eventReaction.count({ where: { userId, updatedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } })
  } catch (err) {
    if (!missingRelation(err)) throw err
    if (kind !== 'GOING') return { status: 503 as const, error: 'Reactions are not ready yet.' }
  }

  const action = reactionWrite({ active: existing, turnOn })
  if (action === 'add' && reactionRateLimited(recent)) {
    return { status: 429 as const, error: 'Too many reactions in the last hour. Try again later.' }
  }

  if (kind === 'GOING') {
    if (turnOn) await prisma.attendance.createMany({ data: [{ userId, eventId }], skipDuplicates: true })
    else await prisma.attendance.deleteMany({ where: { userId, eventId } })
  }

  if (action !== 'unchanged') {
    try {
      if (action === 'add') {
        await prisma.eventReaction.create({ data: { userId, eventId, kind } })
        await bumpEngagement(eventId, kind === 'GOING' ? 'GOING' : 'REACTION')
        const { METRIC, recordProductMetrics } = await import('@/lib/product-metrics')
        await recordProductMetrics([{
          name: kind === 'GOING' ? METRIC.going : METRIC.reaction,
          subjectId: eventId,
          subjectKind: 'event',
          dim: kind === 'GOING' ? '' : kind,
        }])
      } else {
        await prisma.eventReaction.deleteMany({ where: { userId, eventId, kind } })
      }
    } catch (err) {
      if (!(kind === 'GOING' && missingRelation(err))) throw err
    }
  }

  const state = await reactionState(userId, eventId)
  return { status: 200 as const, ...state, going: kind === 'GOING' ? turnOn : state.mine.includes('GOING') }
}
