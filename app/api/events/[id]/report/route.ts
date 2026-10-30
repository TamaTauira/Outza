import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { REPORT_REASONS, reportReasonLabel } from '@/lib/trust-shared'
import { notifyTrustTeam } from '@/lib/trust'
import { eventPath } from '@/lib/seo'
import { noteCommunityReport } from '@/lib/community'

export const dynamic = 'force-dynamic'

/** body: { reason, details?, email? } — anyone can report incorrect details. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const b = await req.json().catch(() => ({}))
    const reason = REPORT_REASONS.some((r) => r.key === b.reason) ? String(b.reason) : null
    if (!reason) return NextResponse.json({ error: 'Please choose what is wrong' }, { status: 400 })
    const details = String(b.details ?? '').trim().slice(0, 2000) || null
    if (reason === 'OTHER' && !details) return NextResponse.json({ error: 'Please tell us what is wrong' }, { status: 400 })
    const email = String(b.email ?? '').trim().slice(0, 200)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'That email address doesn’t look right' }, { status: 400 })

    const ev = await prisma.event.findUnique({ where: { id }, select: { id: true, title: true, city: true } })
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    const me = await getSessionUser().catch(() => null)

    // Light abuse guard: one open report per reason per event from the same signed-in user or email.
    const who = me?.id ? { userId: me.id } : email ? { email } : null
    if (who) {
      const dupe = await prisma.eventReport.findFirst({ where: { eventId: ev.id, reason, status: 'OPEN', ...who }, select: { id: true } })
      if (dupe) return NextResponse.json({ ok: true, duplicate: true })
    }
    await prisma.eventReport.create({ data: { eventId: ev.id, userId: me?.id ?? null, reason, details, email: email || me?.email || null } })
    await noteCommunityReport(ev.id).catch((err) => console.error('community report note failed', err?.message))
    await notifyTrustTeam(`Listing report: ${reportReasonLabel(reason)} — ${ev.title.slice(0, 60)}`, [
      ['Event', `${ev.title} (${ev.city})`], ['Link', eventPath(ev)], ['Problem', reportReasonLabel(reason)], ['Details', details], ['Reporter', email || me?.email || 'Anonymous'],
    ])
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Report failed:', err?.message)
    return NextResponse.json({ error: 'Could not send your report' }, { status: 500 })
  }
}
