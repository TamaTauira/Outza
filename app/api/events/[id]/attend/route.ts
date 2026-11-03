import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { setReaction } from '@/lib/reactions-store'
import { getSessionUser, unauthorized } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** body: { going: boolean }. Going stays on Attendance and, when the table exists, on reactions. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  const { id } = await params
  const { going } = await req.json().catch(() => ({ going: true }))
  const result = await setReaction(me.id, id, 'GOING', !!going)
  if (result.status === 404) return NextResponse.json({ error: result.error }, { status: 404 })
  if (result.status === 429) return NextResponse.json({ error: result.error }, { status: 429 })
  const attendeeCount = await prisma.attendance.count({ where: { eventId: id } })
  return NextResponse.json({ going: !!going, attendeeCount })
}
