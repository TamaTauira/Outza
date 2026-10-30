import { prisma } from '@/lib/prisma'

/** One open conflict row per listing. A repeat refresh does not stack copies. */
export async function recordFieldConflict(eventId: string, detail: string) {
  const existing = await prisma.qualityAudit.findFirst({
    where: { eventId, action: 'TIME_CONFLICT', status: 'OPEN' },
    select: { id: true },
  })
  if (existing) return
  await prisma.qualityAudit.create({
    data: { eventId, action: 'TIME_CONFLICT', detail: detail.slice(0, 2000), status: 'OPEN' },
  })
}
