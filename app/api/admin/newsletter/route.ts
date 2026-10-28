import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorized, forbidden } from '@/lib/session'
import { buildNewsletter, sendNewsletter } from '@/lib/newsletter'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function admin() {
  const me = await getSessionUser()
  if (!me) return { err: unauthorized() }
  if (me.role !== 'ADMIN') return { err: forbidden() }
  return { me }
}

const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0)

/** Performance stats for the last 90 days of real sends. */
export async function GET() {
  const g = await admin()
  if (g.err) return g.err
  const since = new Date(Date.now() - 90 * 86400e3)
  const sends = await prisma.newsletterSend.findMany({
    where: { sentAt: { gte: since } }, orderBy: { sentAt: 'desc' }, take: 5000,
    select: { id: true, userId: true, city: true, status: true, subject: true, variant: true, cta: true, sections: true, openedAt: true, sentAt: true, error: true, clicks: { select: { placement: true, target: true, category: true } } },
  })
  const real = sends.filter((s) => s.status === 'SENT')
  const engaged = (s: (typeof real)[number]) => s.clicks.some((c) => c.target !== 'unsubscribe')
  const clickers = real.filter(engaged)
  const opens = real.filter((s) => s.openedAt).length
  const all = real.flatMap((s) => s.clicks.map((c) => ({ ...c, send: s })))
  const group = <K extends string>(keyOf: (s: (typeof real)[number]) => K) => {
    const m = new Map<string, { sends: number; clicked: number }>()
    for (const s of real) { const k = keyOf(s) || '(none)'; const v = m.get(k) ?? { sends: 0, clicked: 0 }; v.sends++; if (engaged(s)) v.clicked++; m.set(k, v) }
    return [...m].map(([key, v]) => ({ key, ...v, ctr: rate(v.clicked, v.sends) })).sort((a, b) => b.sends - a.sends)
  }
  const countBy = (key: 'placement' | 'category') => {
    const m = new Map<string, { clicks: number; sends: Set<string> }>()
    for (const c of all) { if (c.target === 'unsubscribe') continue; const k = c[key] || '(none)'; const v = m.get(k) ?? { clicks: 0, sends: new Set() }; v.clicks++; v.sends.add(c.send.id); m.set(k, v) }
    return [...m].map(([k, v]) => ({ key: k, clicks: v.clicks, uniqueSends: v.sends.size })).sort((a, b) => b.clicks - a.clicks)
  }
  const perUser = new Map<string, number>()
  for (const s of clickers) perUser.set(s.userId, (perUser.get(s.userId) ?? 0) + 1)
  const sponsoredPos = new Map<string, { sends: number; clicks: number }>()
  for (const s of real) {
    const pos = (s.sections as any)?.items?.some((i: any) => i.placement === 'sponsored') ? (s.sections as any).sponsoredPos : null
    if (!pos) continue
    const v = sponsoredPos.get(pos) ?? { sends: 0, clicks: 0 }
    v.sends++; if (s.clicks.some((c) => c.placement === 'sponsored')) v.clicks++
    sponsoredPos.set(pos, v)
  }
  return NextResponse.json({
    totals: {
      sent: real.length, failed: sends.filter((s) => s.status === 'FAILED').length, blocked: sends.filter((s) => s.status === 'BLOCKED').length,
      skipped: sends.filter((s) => s.status === 'SKIPPED').length, tests: sends.filter((s) => s.status === 'TEST').length,
      opensApprox: opens, openRateApprox: rate(opens, real.length), uniqueClickers: clickers.length, ctr: rate(clickers.length, real.length),
      ctor: rate(real.filter((s) => s.openedAt && engaged(s)).length, opens),
      detailVisits: all.filter((c) => c.target === 'detail').length, ticketReferrals: all.filter((c) => c.target === 'ticket').length,
      exploreClicks: all.filter((c) => c.target === 'explore').length, unsubscribes: all.filter((c) => c.target === 'unsubscribe').length,
      repeatEngagers: [...perUser.values()].filter((n) => n >= 2).length,
      optedIn: await prisma.user.count({ where: { emailOptIn: true } }),
    },
    byPlacement: countBy('placement'),
    byCategory: countBy('category'),
    bySubjectStyle: group((s) => s.variant),
    byCta: group((s) => s.cta),
    byCity: group((s) => s.city),
    bySponsoredPosition: [...sponsoredPos].map(([key, v]) => ({ key, sends: v.sends, clicked: v.clicks, ctr: rate(v.clicks, v.sends) })),
    recent: sends.slice(0, 25).map((s) => ({ id: s.id, sentAt: s.sentAt, city: s.city, status: s.status, subject: s.subject, variant: s.variant, clicks: s.clicks.length, opened: !!s.openedAt, error: s.error })),
  })
}

/** { action: 'preview' | 'test', email?, city?, edition? } - preview renders without sending; test sends to the admin. */
export async function POST(req: Request) {
  const g = await admin()
  if (g.err) return g.err
  const b = await req.json().catch(() => ({}))
  const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim().toLowerCase() : g.me!.email
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) return NextResponse.json({ error: `No user with email ${email}` }, { status: 404 })
  const city = typeof b.city === 'string' && b.city ? b.city : undefined
  const edition = ['daily', 'weekly', 'monthly'].includes(b.edition) ? b.edition : undefined
  try {
    if (b.action === 'test') {
      const r = await sendNewsletter(user.id, { mode: 'test', to: g.me!.email, city, edition })
      if (!r.ok) return NextResponse.json({ error: r.error ?? 'Send failed', qa: (r as any).qa }, { status: 422 })
      return NextResponse.json({ ok: true, to: g.me!.email, subject: (r as any).subject, disabled: !!(r as any).disabled })
    }
    const built = await buildNewsletter(user.id, { mode: 'preview', city, edition })
    if ('skip' in built) return NextResponse.json({ error: built.skip }, { status: 422 })
    return NextResponse.json(built)
  } catch (e: any) {
    console.error('[admin/newsletter]', e)
    return NextResponse.json({ error: `Newsletter build failed: ${e?.message ?? 'unknown error'}` }, { status: 500 })
  }
}
