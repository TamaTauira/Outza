import { prisma } from '@/lib/db'

export type SignalKind = 'VIEW' | 'TICKET' | 'SHARE' | 'ITINERARY'

/** Records a signed-in person's first interaction of this kind with an event. Returns true when it was new. */
export async function recordSignal(userId: string, eventId: string, kind: SignalKind): Promise<boolean> {
  try {
    const r = await prisma.eventSignal.createMany({ data: [{ userId, eventId, kind }], skipDuplicates: true })
    return r.count > 0
  } catch (err) {
    console.error('event signal failed', (err as Error)?.message)
    return false
  }
}
