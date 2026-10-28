import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

const idsFrom = (raw: unknown) =>
  [...new Set((Array.isArray(raw) ? raw : String(raw ?? '').split(',')).map((s) => String(s).trim()).filter(Boolean))].slice(0, 40)

const live = () => ({ status: 'ACTIVE', endsAt: { gt: new Date() } })

/** GET ?ids=eventA,eventB -> live paid local recommendations attached to those itinerary events, grouped by event.
 *  Doesn't count impressions: the itinerary keeps them collapsed until the visitor opens them (see POST). */
export async function GET(req: Request) {
  const ids = idsFrom(new URL(req.url).searchParams.get('ids'))
  if (!ids.length) return NextResponse.json({ picks: {} })
  const ads = await prisma.localAd.findMany({
    where: { eventId: { in: ids }, ...live() }, orderBy: { startsAt: 'asc' },
    select: { id: true, eventId: true, kind: true, businessName: true, blurb: true, address: true, url: true, event: { select: { venueName: true } } },
  })
  const picks: Record<string, unknown[]> = {}
  for (const { url, event, ...a } of ads) {
    let host = ''
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch {}
    ;(picks[a.eventId] ??= []).push({ ...a, host, venue: event?.venueName ?? null })
  }
  return NextResponse.json({ picks })
}

/** POST { ids: adIds } -> counts one impression when a visitor opens the suggestions between their stops. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const ids = idsFrom(body?.ids)
  if (ids.length) await prisma.localAd.updateMany({ where: { id: { in: ids }, ...live() }, data: { views: { increment: 1 } } }).catch((e) => console.error('itinerary local-ad views', e))
  return NextResponse.json({ ok: true })
}
