import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** body: { going: boolean } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const { going } = await req.json().catch(() => ({ going: true }))
  const ev = await prisma.event.findUnique({ where: { id }, select: { id: true } })
  if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (going) {
    await prisma.attendance.createMany({ data: [{ userId: me.id, eventId: id }], skipDuplicates: true })
  } else {
    await prisma.attendance.deleteMany({ where: { userId: me.id, eventId: id } })
  }
  const attendeeCount = await prisma.attendance.count({ where: { eventId: id } })
  return NextResponse.json({ going: !!going, attendeeCount })
}
