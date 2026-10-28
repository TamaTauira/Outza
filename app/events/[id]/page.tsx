import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getEventDetail } from '@/lib/event-detail'
import { cityDef } from '@/lib/cities'
import { eventPath, idFromEventParam, isPastEvent as isPast } from '@/lib/seo'
import { eventImageUrl, eventJsonLd, jsonLdString } from '@/lib/seo-server'
import { siteUrl } from '@/lib/site-url'
import { EventDetailClient } from './_components/event-detail-client'
import { classifyReferral, recordReferral } from '@/lib/referrals'
import { getSessionUser } from '@/lib/session'
import { recordSignal } from '@/lib/event-signals'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Accepts both the canonical "/events/<slug>-<id>" and legacy "/events/<id>" forms. */
async function resolveId(param: string): Promise<string | null> {
  const raw = decodeURIComponent(param)
  const direct = await prisma.event.findUnique({ where: { id: raw }, select: { id: true } })
  if (direct) return direct.id
  const tail = idFromEventParam(raw)
  if (tail === raw) return null
  const viaSlug = await prisma.event.findUnique({ where: { id: tail }, select: { id: true } })
  return viaSlug?.id ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: param } = await params
  const id = await resolveId(param)
  if (!id) return { title: 'Event not found | Outza', robots: { index: false } }
  const ev = await prisma.event.findUnique({
    where: { id },
    select: { id: true, title: true, description: true, date: true, endDate: true, time: true, venueName: true, suburb: true, city: true, imageUrl: true, duplicateOfId: true, status: true, imageAsset: { select: { variants: true, status: true } } },
  })
  if (!ev || isPast(ev)) return { title: 'Event not found | Outza', robots: { index: false } }
  // Merged duplicates point search engines at the listing they were merged into
  const canonicalTarget = ev.duplicateOfId
    ? await prisma.event.findUnique({ where: { id: ev.duplicateOfId }, select: { id: true, title: true } })
    : null
  const dateLabel = ev.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const where = [ev.venueName, ev.suburb && ev.suburb !== ev.city ? ev.suburb : null, ev.city].filter(Boolean).join(', ')
  const status = ev.status === 'CANCELLED' ? 'Cancelled: ' : ev.status === 'POSTPONED' ? 'Postponed: ' : ''
  const desc = `${status}${ev.title} on ${dateLabel}${ev.time ? ` at ${ev.time}` : ''}, ${where}.${ev.description ? ` ${ev.description.replace(/\s+/g, ' ').slice(0, 110)}…` : ''}`
  const origin = siteUrl()
  const image = eventImageUrl(ev, origin)
  return {
    title: `${status}${ev.title} | ${dateLabel} | ${ev.city} | Outza`,
    description: desc.slice(0, 300),
    alternates: { canonical: eventPath(canonicalTarget ?? ev) },
    robots: ev.duplicateOfId ? { index: false, follow: true } : undefined,
    openGraph: { title: ev.title, description: desc.slice(0, 200), type: 'website', url: eventPath(ev), ...(image ? { images: [image] } : {}) },
    twitter: {
      card: 'summary_large_image',
      title: ev.title,
      description: desc.slice(0, 200),
      images: image ? [image] : ['/og-image.png'],
    },
  }
}

export default async function EventPage({ params, searchParams }: Props) {
  const { id: param } = await params
  const id = await resolveId(param)
  if (!id) notFound()

  const h = await headers()
  const ua = h.get('user-agent') ?? ''
  const isHuman = !/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly/i.test(ua)
  const data = await getEventDetail(id, { countView: isHuman })
  if (!data) notFound()
  if (isHuman) {
    const sp = await searchParams
    const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
    recordReferral(id, classifyReferral(h.get('referer'), h.get('x-forwarded-host') ?? h.get('host'), { source: one(sp.utm_source), medium: one(sp.utm_medium) }))
    const me = await getSessionUser().catch(() => null)
    if (me) recordSignal(me.id, id, 'VIEW')
  }

  // One canonical, readable URL per event (keeps any query string, e.g. checkout return flags)
  const canonical = eventPath(data.event)
  if (`/events/${decodeURIComponent(param)}` !== canonical) {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(await searchParams)) for (const x of [v].flat()) if (x != null) sp.append(k, x)
    permanentRedirect(sp.size ? `${canonical}?${sp}` : canonical)
  }

  const origin = siteUrl()
  const ev = data.event
  const ld = !ev.duplicateOfId ? eventJsonLd(ev, origin) : null
  const initial = JSON.parse(JSON.stringify(data))

  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />}
      <EventDetailClient key={id} eventId={id} initial={initial} />
    </>
  )
}
