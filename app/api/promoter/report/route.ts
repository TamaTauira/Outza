import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { publicEmailError } from '@/lib/email'
import { sendPromoterReport } from '@/lib/promoter-report'

export const dynamic = 'force-dynamic'

/** Whether the weekly report is on. GET used to 405, which made the toggle look like it had not saved. */
export async function GET() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const u = await prisma.user.findUnique({ where: { id: me.id }, select: { weeklyReport: true, lastReportAt: true } })
  return NextResponse.json({ weeklyReport: !!u?.weeklyReport, lastReportAt: u?.lastReportAt ?? null })
}

/** Email the signed-in promoter a performance report now (max once every 10 minutes). */
export async function POST() {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const u = await prisma.user.findUnique({ where: { id: me.id }, select: { lastReportAt: true } })
  if (u?.lastReportAt && Date.now() - u.lastReportAt.getTime() < 10 * 60000) {
    return NextResponse.json({ error: 'A report was sent a few minutes ago. Please check your inbox.' }, { status: 429 })
  }
  const r = await sendPromoterReport(me.id)
  if (!r.ok) {
    console.error('[promoter-report]', String(r.error ?? '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted]'))
    return NextResponse.json({ error: publicEmailError(r.error) }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

/** Turn the weekly emailed report on or off. */
export async function PATCH(req: Request) {
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (!isPromoter(me.role)) return forbidden()
  const b = await req.json().catch(() => ({}))
  const weeklyReport = !!b.weeklyReport
  await prisma.user.update({ where: { id: me.id }, data: { weeklyReport } })
  return NextResponse.json({ ok: true, weeklyReport })
}
