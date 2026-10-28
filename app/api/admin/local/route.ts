import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden } from '@/lib/session'
import { recurrenceLabel } from '@/lib/local-shared'

export const dynamic = 'force-dynamic'

async function admin() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (me.role !== 'ADMIN') return forbidden()
  return null
}

export async function GET() {
  const err = await admin()
  if (err) return err
  const [pending, recent, counts] = await Promise.all([
    prisma.localListing.findMany({ where: { status: 'PENDING', expiresAt: { gte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 200 }),
    prisma.localListing.findMany({ where: { status: 'APPROVED', expiresAt: { gte: new Date() } }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.localListing.groupBy({ by: ['status'], _count: true }),
  ])
  const shape = (l: (typeof pending)[number]) => ({ ...l, ipHash: undefined, schedule: recurrenceLabel(l) })
  return NextResponse.json({ pending: pending.map(shape), recent: recent.map(shape), counts })
}

/** body: { id, action: 'APPROVE'|'REJECT'|'REMOVE', note? } */
export async function PATCH(req: Request) {
  const err = await admin()
  if (err) return err
  const b = await req.json().catch(() => ({}))
  const map: Record<string, string> = { APPROVE: 'APPROVED', REJECT: 'REJECTED', REMOVE: 'REMOVED' }
  if (typeof b.id !== 'string' || !map[b.action]) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  await prisma.localListing.update({
    where: { id: b.id },
    data: { status: map[b.action], ...(b.action === 'APPROVE' ? { reportCount: 0 } : {}), ...(typeof b.note === 'string' && b.note.trim() ? { reviewNote: b.note.trim().slice(0, 300) } : {}) },
  })
  return NextResponse.json({ ok: true })
}
