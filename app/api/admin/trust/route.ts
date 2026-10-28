import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden } from '@/lib/session'
import { approveClaim } from '@/lib/trust'

export const dynamic = 'force-dynamic'

async function admin() {
  const me = await getSessionUser()
  if (!me) return { error: unauthorized() }
  if (me.role !== 'ADMIN') return { error: forbidden() }
  return { me }
}

const ev = { select: { id: true, title: true, city: true, date: true, source: true, ticketUrl: true, organiserUrl: true, status: true, promoterId: true } }

export async function GET() {
  const a = await admin()
  if (a.error) return a.error
  const [reports, claims, counts] = await Promise.all([
    prisma.eventReport.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 200, include: { event: ev } }),
    prisma.eventClaim.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 200, include: { event: ev, user: { select: { email: true, name: true, role: true } } } }),
    prisma.eventReport.groupBy({ by: ['status'], _count: true }),
  ])
  return NextResponse.json({ reports, claims, counts })
}

/** body: { kind: 'report', id, action: 'RESOLVED'|'DISMISSED' } | { kind: 'claim', id, action: 'APPROVE'|'REJECT', note? } */
export async function PATCH(req: Request) {
  const a = await admin()
  if (a.error) return a.error
  const b = await req.json().catch(() => ({}))
  if (typeof b.id !== 'string') return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (b.kind === 'report' && (b.action === 'RESOLVED' || b.action === 'DISMISSED')) {
    await prisma.eventReport.update({ where: { id: b.id }, data: { status: b.action, resolvedAt: new Date() } })
    return NextResponse.json({ ok: true })
  }
  if (b.kind === 'claim' && b.action === 'APPROVE') {
    const c = await approveClaim(b.id, typeof b.note === 'string' ? b.note.slice(0, 300) : 'Verified by an admin')
    return c ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  }
  if (b.kind === 'claim' && b.action === 'REJECT') {
    await prisma.eventClaim.update({ where: { id: b.id }, data: { status: 'REJECTED', reviewedAt: new Date(), reviewNote: typeof b.note === 'string' ? b.note.slice(0, 300) : null } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
