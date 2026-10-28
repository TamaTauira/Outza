import { prisma } from '@/lib/db'

export async function getFriendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  })
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId))
}

/** Map of eventId -> friend display names attending */
export async function friendsGoing(userId: string, eventIds: string[]) {
  const out: Record<string, string[]> = {}
  if (!eventIds.length) return out
  const friendIds = await getFriendIds(userId)
  if (!friendIds.length) return out
  const rows = await prisma.attendance.findMany({
    where: { eventId: { in: eventIds }, userId: { in: friendIds } },
    select: { eventId: true, user: { select: { name: true, email: true } } },
  })
  for (const r of rows) (out[r.eventId] ||= []).push(r.user.name || r.user.email.split('@')[0])
  return out
}
