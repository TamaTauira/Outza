import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { EventPeek } from '@/components/event-peek'
import { getPublicEvent, personalizeEvent } from '@/lib/event-detail'
import { classifyReferral } from '@/lib/referrals'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

/** Soft navigation from a list. A refresh of this URL still renders the full event page. */
export default async function EventPeekPage({ params, searchParams }: Props) {
  const { id: param } = await params
  const core = await getPublicEvent(param)
  if (!core?.event) notFound()
  const h = await headers()
  const ua = h.get('user-agent') ?? ''
  const isHuman = !/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly/i.test(ua)
  const prefetch = /prefetch/i.test(h.get('purpose') ?? '') || /prefetch/i.test(h.get('sec-purpose') ?? '') || h.get('next-router-prefetch') === '1'
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const sp = await searchParams
  const referral = isHuman
    ? classifyReferral(h.get('referer'), h.get('x-forwarded-host') ?? h.get('host'), { source: one(sp.utm_source), medium: one(sp.utm_medium) })
    : null
  const data = await personalizeEvent(core, {
    countView: isHuman && !prefetch,
    prefetch,
    referral,
    viewerCity: h.get('x-vercel-ip-city'),
    viewerCountry: h.get('x-vercel-ip-country'),
  })
  return <EventPeek event={JSON.parse(JSON.stringify(data.event))} />
}
