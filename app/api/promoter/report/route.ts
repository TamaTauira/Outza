import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSessionUser, unauthorized, forbidden, isPromoter } from '@/lib/session'
import { sendPromoterReport } from '@/lib/promoter-report'

export const dynamic = 'force-dynamic'

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
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
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
