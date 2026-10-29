import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden } from '@/lib/session'
import { reportReasonLabel } from '@/lib/trust-shared'
import { sourceLabel } from '@/lib/quality'
import { QUEUE_FLAG_ACTIONS, pendingTotal, type QueueKind } from '@/lib/trust-queue'
import { applyTrustItems } from '@/lib/trust-review'

export const dynamic = 'force-dynamic'

async function admin() {
  const me = await getSessionUser()
  if (!me) return { error: unauthorized() }
  if (me.role !== 'ADMIN') return { error: forbidden() }
  return { me }
}

const ev = { select: { id: true, title: true, city: true, date: true, source: true, ticketUrl: true, organiserUrl: true, status: true, promoterId: true } }

export async function GET(req: Request) {
  const a = await admin()
  if (a.error) return a.error
  const countOnly = new URL(req.url).searchParams.get('count') === '1'
  const [reportCount, claimCount, flagCount] = await Promise.all([
    prisma.eventReport.count({ where: { status: 'OPEN' } }),
    prisma.eventClaim.count({ where: { status: 'PENDING' } }),
    prisma.qualityAudit.count({ where: { status: 'OPEN', action: { in: [...QUEUE_FLAG_ACTIONS] } } }),
  ])
  const pending = pendingTotal({ reports: reportCount, claims: claimCount, flags: flagCount })
  if (countOnly) return NextResponse.json({ pending, reports: reportCount, claims: claimCount, flags: flagCount })

  const [reports, claims, flags] = await Promise.all([
    prisma.eventReport.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 200, include: { event: ev } }),
    prisma.eventClaim.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 200, include: { event: ev, user: { select: { email: true, name: true, role: true } } } }),
    prisma.qualityAudit.findMany({
      where: { status: 'OPEN', action: { in: [...QUEUE_FLAG_ACTIONS] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ])
  const flagEvents = flags.flatMap((f) => f.eventId ? [f.eventId] : [])
  const events = flagEvents.length
    ? await prisma.event.findMany({ where: { id: { in: flagEvents } }, select: ev.select })
    : []
  const byId = new Map(events.map((event) => [event.id, event]))
  const items = [
    ...reports.map((r) => ({
      key: `report:${r.id}`, kind: 'report' as const, id: r.id, issue: reportReasonLabel(r.reason),
      note: r.details, source: sourceLabel(r.event.source), createdAt: r.createdAt, event: r.event,
      who: r.email || 'Anonymous',
    })),
    ...claims.map((c) => ({
      key: `claim:${c.id}`, kind: 'claim' as const, id: c.id, issue: 'Organiser claim',
      note: [c.orgName, c.position, c.message].filter(Boolean).join(' — '),
      source: sourceLabel(c.event.source), createdAt: c.createdAt, event: c.event,
      who: c.user.email,
    })),
    ...flags.map((f) => ({
      key: `flag:${f.id}`, kind: 'flag' as const, id: f.id,
      issue: f.action === 'DUPLICATE_FLAGGED' ? 'Flagged duplicate' : 'Expired listings',
      note: f.detail, source: f.eventId && byId.get(f.eventId) ? sourceLabel(byId.get(f.eventId)!.source) : 'Quality check',
      createdAt: f.createdAt, event: f.eventId ? byId.get(f.eventId) ?? null : null,
      who: 'Quality check',
    })),
  ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  return NextResponse.json({ pending, reports, claims, items })
}

const kinds = new Set<QueueKind>(['report', 'claim', 'flag'])

/** One item: { kind, id, action }. Bulk: { action: 'approve'|'dismiss', items: [{ kind, id }] }. */
export async function PATCH(req: Request) {
  const a = await admin()
  if (a.error) return a.error
  const b = await req.json().catch(() => ({}))
  const action = b.action === 'approve' || b.action === 'APPROVE' || b.action === 'RESOLVED' ? 'approve'
    : b.action === 'dismiss' || b.action === 'DISMISSED' || b.action === 'REJECT' ? 'dismiss'
    : null
  const items = Array.isArray(b.items)
    ? b.items.flatMap((item: { kind?: unknown; id?: unknown }) => (
      kinds.has(item?.kind as QueueKind) && typeof item?.id === 'string' ? [{ kind: item.kind as QueueKind, id: item.id }] : []
    )).slice(0, 100)
    : (kinds.has(b.kind) && typeof b.id === 'string' && action ? [{ kind: b.kind as QueueKind, id: b.id }] : [])
  if (!action || !items.length) return NextResponse.json({ error: 'Choose at least one item' }, { status: 400 })
  const result = await applyTrustItems(items, action)
  return NextResponse.json({ ok: true, ...result })
}
