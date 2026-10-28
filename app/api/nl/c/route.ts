import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { siteUrl } from '@/lib/email'
import { exploreUrl, utm, verify } from '@/lib/newsletter/links'
import { ticketHref, isTicketekUrl } from '@/lib/affiliate'

export const dynamic = 'force-dynamic'

/** Newsletter click redirect: logs the click (real sends only) and forwards with UTM tags. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const s = sp.get('s') ?? '', p = sp.get('p') ?? '', t = sp.get('t') ?? '', e = sp.get('e') ?? ''
  if (!verify(sp.get('k'), s, p, t, e)) return NextResponse.redirect(siteUrl())

  const send = s && s !== 'preview' ? await prisma.newsletterSend.findUnique({ where: { id: s }, select: { id: true, city: true, edition: true, sentAt: true } }).catch(() => null) : null
  const ev = e ? await prisma.event.findUnique({ where: { id: e }, select: { id: true, category: true, ticketUrl: true } }).catch(() => null) : null
  const ctx = { sendId: s, edition: send?.edition ?? 'weekly', issueDate: (send?.sentAt ?? new Date()).toISOString().slice(0, 10), city: send?.city ?? 'Sydney' }

  let dest = siteUrl()
  if (t === 'explore') dest = exploreUrl(ctx.city)
  else if (t === 'prefs') dest = `${siteUrl()}/account`
  else if (ev && t === 'ticket' && ev.ticketUrl && /^https?:\/\//.test(ev.ticketUrl)) dest = ticketHref(ev.ticketUrl) ?? ev.ticketUrl
  else if (ev) dest = `${siteUrl()}/events/${ev.id}`
  // Affiliate tracking links must reach the seller untouched, so no UTM tags on them
  if (t !== 'prefs' && !(t === 'ticket' && ev && isTicketekUrl(ev.ticketUrl) && dest !== ev.ticketUrl)) dest = utm(dest, ctx, p)

  if (send) {
    await prisma.newsletterClick.create({ data: { sendId: send.id, eventId: ev?.id ?? null, placement: p, target: t, category: ev?.category ?? null } }).catch(() => {})
    if (ev && t === 'ticket') await prisma.event.update({ where: { id: ev.id }, data: { ticketClicks: { increment: 1 } } }).catch(() => {})
  }
  return NextResponse.redirect(dest, 302)
}
