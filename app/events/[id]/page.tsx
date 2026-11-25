import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPublicEvent, personalizeEvent } from '@/lib/event-detail'
import { boardClockLine } from '@/lib/listing-window'
import { eventPath, isPastEvent as isPast } from '@/lib/seo'
import { eventImageUrl, eventJsonLd, jsonLdString } from '@/lib/seo-server'
import { siteUrl } from '@/lib/site-url'
import { openGraphImage } from '@/lib/share-image'
import { displayTitle } from '@/lib/display-public'
import { LandingDetailBeacon } from '@/components/landing-beacon'
import { EventDetailClient } from './_components/event-detail-client'
import { classifyReferral } from '@/lib/referrals'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id: param } = await params
  const data = await getPublicEvent(param)
  const ev = data?.event
  if (!ev) return { title: 'Event not found', robots: { index: false }, openGraph: { title: 'Event not found · VibePeep' } }
  const ended = isPast(ev)
  const canonicalTarget = data.duplicateTarget
  const dateLabel = new Date(ev.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const where = [ev.venueName, ev.suburb && ev.suburb !== ev.city ? ev.suburb : null, ev.city].filter(Boolean).join(', ')
  const status = ev.status === 'CANCELLED' ? 'Cancelled: ' : ev.status === 'POSTPONED' ? 'Postponed: ' : ''
  const clock = boardClockLine(ev)
  const name = displayTitle(ev.title)
  const desc = `${status}${name} on ${dateLabel}${clock ? ` at ${clock}` : ''}, ${where}.${ev.description ? ` ${ev.description.replace(/\s+/g, ' ').slice(0, 110)}…` : ''}`
  const origin = siteUrl()
  const image = openGraphImage(eventImageUrl(ev, origin), name)
  return {
    title: ended ? `${name} has ended · ${ev.city}` : `${status}${name} · ${dateLabel} · ${ev.city}`,
    description: desc.slice(0, 300),
    alternates: { canonical: eventPath(canonicalTarget ?? ev) },
    robots: ended || ev.duplicateOfId ? { index: false, follow: true } : undefined,
    openGraph: { title: ended ? `${name} has ended · ${ev.city} · VibePeep` : `${status}${name} · ${dateLabel} · ${ev.city} · VibePeep`, description: desc.slice(0, 200), type: 'website', url: eventPath(ev), images: [image] },
    twitter: {
      card: 'summary_large_image',
      title: ended ? `${name} has ended · ${ev.city} · VibePeep` : `${status}${name} · ${dateLabel} · ${ev.city} · VibePeep`,
      description: desc.slice(0, 200),
      images: [image],
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
  const data = await personalizeEvent(core, {
    countView: isHuman,
    prefetch,
    referral,
    viewerCity: h.get('x-vercel-ip-city'),
    viewerCountry: h.get('x-vercel-ip-country'),
  })

  const origin = siteUrl()
  const ev = data.event
  const ended = isPast(ev)
  const ld = !ev.duplicateOfId && !ended ? eventJsonLd(ev, origin) : null
  const initial = JSON.parse(JSON.stringify(data))

  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />}
      <LandingDetailBeacon />
      <EventDetailClient key={ev.id} eventId={ev.id} initial={initial} />
    </>
  )
}
