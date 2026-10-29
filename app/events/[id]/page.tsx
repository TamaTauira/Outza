import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPublicEvent, personalizeEvent } from '@/lib/event-detail'
import { eventPath, isPastEvent as isPast } from '@/lib/seo'
import { eventImageUrl, eventJsonLd, jsonLdString } from '@/lib/seo-server'
import { BRAND_OG_IMAGE } from '@/lib/brand'
import { siteUrl } from '@/lib/site-url'
import { EventDetailClient } from './_components/event-detail-client'
import { classifyReferral } from '@/lib/referrals'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: param } = await params
  const data = await getPublicEvent(param)
  const ev = data?.event
  if (!ev || isPast(ev)) return { title: 'Event not found | VibePeep', robots: { index: false } }
  const canonicalTarget = data.duplicateTarget
  const dateLabel = new Date(ev.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const where = [ev.venueName, ev.suburb && ev.suburb !== ev.city ? ev.suburb : null, ev.city].filter(Boolean).join(', ')
  const status = ev.status === 'CANCELLED' ? 'Cancelled: ' : ev.status === 'POSTPONED' ? 'Postponed: ' : ''
  const desc = `${status}${ev.title} on ${dateLabel}${ev.time ? ` at ${ev.time}` : ''}, ${where}.${ev.description ? ` ${ev.description.replace(/\s+/g, ' ').slice(0, 110)}…` : ''}`
  const origin = siteUrl()
  const image = eventImageUrl(ev, origin)
  return {
    title: `${status}${ev.title} | ${dateLabel} | ${ev.city} | VibePeep`,
    description: desc.slice(0, 300),
    alternates: { canonical: eventPath(canonicalTarget ?? ev) },
    robots: ev.duplicateOfId ? { index: false, follow: true } : undefined,
    openGraph: { title: ev.title, description: desc.slice(0, 200), type: 'website', url: eventPath(ev), ...(image ? { images: [image] } : {}) },
    twitter: {
      card: 'summary_large_image',
      title: ev.title,
      description: desc.slice(0, 200),
      images: image ? [image] : [BRAND_OG_IMAGE],
    },
  }
}

export default async function EventPage({ params, searchParams }: Props) {
  const { id: param } = await params
  const core = await getPublicEvent(param)
  if (!core) notFound()

  const h = await headers()
  const ua = h.get('user-agent') ?? ''
  const isHuman = !/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly/i.test(ua)
  const prefetch = /prefetch/i.test(h.get('purpose') ?? '') || /prefetch/i.test(h.get('sec-purpose') ?? '') || h.get('next-router-prefetch') === '1'
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const sp = await searchParams

  // Legacy ids redirect before the signed-in lookups. Checkout returns on ?ad=paid stay on the query string.
  const canonical = eventPath(core.event)
  if (`/events/${decodeURIComponent(param)}` !== canonical) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) for (const x of [v].flat()) if (x != null) qs.append(k, x)
    permanentRedirect(qs.size ? `${canonical}?${qs}` : canonical)
  }

  const referral = isHuman
    ? classifyReferral(h.get('referer'), h.get('x-forwarded-host') ?? h.get('host'), { source: one(sp.utm_source), medium: one(sp.utm_medium) })
    : null
  const data = await personalizeEvent(core, { countView: isHuman, prefetch, referral })

  const origin = siteUrl()
  const ev = data.event
  const ld = !ev.duplicateOfId ? eventJsonLd(ev, origin) : null
  const initial = JSON.parse(JSON.stringify(data))

  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />}
      <EventDetailClient key={ev.id} eventId={ev.id} initial={initial} />
    </>
  )
}
