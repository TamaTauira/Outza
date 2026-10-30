import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden } from '@/lib/session'
import { approveVenueClaim, rejectVenueClaim } from '@/lib/venue-access'

export const dynamic = 'force-dynamic'

async function admin() {
  const me = await getSessionUser()
  if (!me) return { error: unauthorized() }
  if (me.role !== 'ADMIN') return { error: forbidden() }
  return { me }
}

export async function GET() {
  const gate = await admin()
  if (gate.error) return gate.error
  const [claims, changes, reports] = await Promise.all([
    prisma.venueClaimRequest.findMany({
      where: { status: { in: ['PENDING', 'DISPUTE'] } },
      orderBy: { submittedAt: 'desc' },
      take: 100,
      include: { venue: { select: { id: true, name: true, city: true } }, user: { select: { email: true, name: true } } },
    }),
    prisma.venueProfileChange.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { venue: { select: { id: true, name: true } } },
    }),
    prisma.venueEventReport.findMany({
      where: { status: { in: ['OPEN', 'IN_REVIEW'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { event: { select: { id: true, title: true, status: true } }, venue: { select: { name: true } } },
    }),
  ])
  return NextResponse.json({ claims, changes, reports })
}

export async function POST(req: Request) {
  const gate = await admin()
  if (gate.error || !gate.me) return gate.error
  const body = await req.json().catch(() => ({}))
  if (body?.kind === 'claim' && body?.id) {
    if (body.action === 'approve') await approveVenueClaim(String(body.id), gate.me.id, 'Approved by an admin')
    else await rejectVenueClaim(String(body.id), gate.me.id, 'Rejected by an admin')
    return NextResponse.json({ ok: true })
  }
  if (body?.kind === 'change' && body?.id) {
    const change = await prisma.venueProfileChange.findUnique({ where: { id: String(body.id) } })
    if (!change || change.status !== 'PENDING') return NextResponse.json({ error: 'Already reviewed' }, { status: 409 })
    if (body.action === 'approve') {
      const allowed = new Set(['address', 'legalName', 'website', 'officialDomain'])
      if (!allowed.has(change.fieldName)) return NextResponse.json({ error: 'That field is not reviewed here.' }, { status: 400 })
      const data: Record<string, string> = { [change.fieldName]: change.proposedValue }
      if (change.fieldName === 'website') {
        try { data.officialDomain = new URL(change.proposedValue).hostname.replace(/^www\./, '') } catch { /* keep the website only */ }
      }
      await prisma.venue.update({ where: { id: change.venueId }, data })
      await prisma.venueProfileChange.update({ where: { id: change.id }, data: { status: 'APPROVED', reviewedAt: new Date() } })
      await prisma.venueAuditLog.create({ data: { venueId: change.venueId, actorId: gate.me.id, action: 'profile-approved', updatedValue: `${change.fieldName}` } })
    } else {
      await prisma.venueProfileChange.update({ where: { id: change.id }, data: { status: 'REJECTED', reviewedAt: new Date() } })
    }
    return NextResponse.json({ ok: true })
  }
  if (body?.kind === 'report' && body?.id) {
    await prisma.venueEventReport.update({ where: { id: String(body.id) }, data: { status: body.action === 'dismiss' ? 'DISMISSED' : 'RESOLVED', reviewedAt: new Date(), caution: false } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
