import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CITIES, type CityDef } from '@/lib/cities'
import { GuideLanding } from '@/components/guide-landing'
import { formatGuideDay, formatGuideSpan, relatedGuides } from '@/lib/local-seo'
import { cityEditorial } from '@/lib/editorial'
import { seasonDef } from '@/lib/seasons'
import { SeasonPage, seasonMetadata } from '@/lib/season-page'
import { TOPICS, MIN_INDEX, guideFacts, topicDef, cityFromSlug, cityPath, suburbPath, type TopicDef } from '@/lib/seo'
import { cityEventCounts, cityGuideModel, citySuburbs, landingData, lastRefreshAt } from '@/lib/seo-server'
import { BRAND_OG_IMAGE } from '@/lib/brand'
import { siteUrl } from '@/lib/site-url'

export const revalidate = 300

type Props = { params: Promise<{ city: string; topic: string }> }

type Resolved = { city: CityDef; topic: TopicDef | null; suburb: string | null; suburbs: Awaited<ReturnType<typeof citySuburbs>> }

async function resolve(citySlug: string, topicSlug: string): Promise<Resolved | null> {
  if (citySlug.includes('.') || topicSlug.includes('.')) return null
  const city = cityFromSlug(citySlug)
  if (!city) return null
  const topic = topicDef(topicSlug) ?? null
  const [eventSuburbs, model] = await Promise.all([citySuburbs(city, 1), cityGuideModel(city)])
  const extra = model.ok
    ? model.decisions
      .filter((d) => d.kind === 'suburb' && d.total > 0 && !eventSuburbs.some((s) => s.slug === d.spec.suburbSlug))
      .map((d) => ({ name: d.spec.suburb!, slug: d.spec.suburbSlug!, count: d.total }))
    : []
  const suburbs = [...eventSuburbs, ...extra]
  if (topic) return { city, topic, suburb: null, suburbs }
  const sub = suburbs.find((s) => s.slug === topicSlug.toLowerCase())
  return sub ? { city, topic: null, suburb: sub.name, suburbs } : null
}

function headingFor(r: Resolved) {
  return r.topic ? r.topic.heading(r.city.name) : `Events in ${r.suburb}, ${r.city.name}`
}

function blurbFor(r: Resolved) {
  return r.topic
    ? r.topic.blurb(r.city.name)
    : `Upcoming gigs, shows, markets and things to do in ${r.suburb}, ${r.city.name}, with times, venues, prices and links to the organiser.`
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city, topic } = await params
  if (seasonDef(topic)) return seasonMetadata(city, topic)
  const r = await resolve(city, topic)
  if (!r) return { title: 'Page not found | VibePeep', robots: { index: false } }
  const [data, model] = await Promise.all([landingData(r.city, r.topic, r.suburb ?? undefined, 1), cityGuideModel(r.city)])
  const range = r.topic?.key === 'this-weekend' && data.to ? ` (${formatGuideSpan(data.from, data.to)})` : ''
  const path = r.topic ? cityPath(r.city, r.topic.key) : suburbPath(r.city, r.suburb!)
  const self = model.decisions.find((d) => d.path === path)
  const index = model.ok ? !!self?.index : data.total >= MIN_INDEX
  const title = `${r.topic?.title?.(r.city.name) ?? headingFor(r)}${range} | VibePeep`
  const description = `${blurbFor(r)} ${data.total ? `${data.total} upcoming listing${data.total === 1 ? '' : 's'}.` : ''}`.trim()
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url: path, images: [BRAND_OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [BRAND_OG_IMAGE] },
  }
}

export default async function LandingPage({ params }: Props) {
  const { city: citySlug, topic: topicSlug } = await params
  if (seasonDef(topicSlug)) return SeasonPage({ citySlug, seasonSlug: topicSlug })
  const r = await resolve(citySlug, topicSlug)
  if (!r) notFound()
  const { city, topic, suburb, suburbs } = r
  const [data, model, refreshed, counts] = await Promise.all([
    landingData(city, topic, suburb ?? undefined),
    cityGuideModel(city),
    lastRefreshAt(),
    cityEventCounts(),
  ])
  const { events, local, total, from, to } = data
  const path = topic ? cityPath(city, topic.key) : suburbPath(city, suburb!)
  const guides = !model.ok
    ? TOPICS
    : TOPICS.filter((t) => t.key === topic?.key || t.key === 'events' || model.decisions.some((d) => d.path === cityPath(city, t.key) && d.index))
  const linkSuburbs = (model.ok
    ? model.decisions.filter((d) => d.kind === 'suburb' && d.index).map((d) => ({ name: d.spec.suburb!, slug: d.spec.suburbSlug!, count: d.total }))
    : suburbs.filter((s) => s.count >= MIN_INDEX))
  const origin = siteUrl()
  const heading = headingFor(r)
  const otherCities = CITIES.filter((c) => c.name !== city.name && (counts[c.name] ?? 0) >= MIN_INDEX).map((c) => ({
    href: cityPath(c, topic?.key ?? 'events'),
    label: topic ? topic.heading(c.name) : `Events in ${c.name}`,
  }))
  const editorial = topic ? cityEditorial(topic.key, city) : null
  const seasonLinks = model.seasons.filter((s) => s.index).map((s) => ({ href: s.path, title: seasonDef(s.key)?.h1(city.name) ?? s.key }))
  const facts = [
    ...guideFacts({
    city: city.name,
    topicKey: topic?.key ?? null,
    suburb,
    total,
    freeShown: events.filter((e) => e.isFree && !/\$\s*[1-9]/.test(e.price ?? '')).length,
    weekendLabel: topic?.key === 'this-weekend' && to ? `${formatGuideDay(from)} – ${formatGuideDay(to)}` : null,
    next: events[0] ? {
      title: events[0].title,
      venue: events[0].venueName,
      when: formatGuideDay(events[0].date.toISOString().slice(0, 10)),
    } : null,
  }),
    ...(editorial?.facts ?? []),
  ]
  const crumbs = [
    { name: 'VibePeep', url: `${origin}/` },
    { name: city.name, url: `${origin}${cityPath(city)}` },
    ...(topic?.key === 'events' ? [] : [{ name: topic ? topic.label : suburb!, url: `${origin}${path}` }]),
  ]
  return (
    <GuideLanding
      city={city}
      topic={topic}
      suburb={suburb}
      when={null}
      heading={heading}
      blurb={blurbFor(r)}
      path={path}
      origin={origin}
      events={events}
      local={local}
      total={total}
      from={from}
      to={to}
      suburbs={linkSuburbs}
      guides={guides}
      activeGuide={topic?.key ?? null}
      otherCities={otherCities}
      facts={facts}
      refreshed={refreshed}
      related={model.ok ? relatedGuides(model.decisions, path, city.name) : []}
      crumbs={crumbs}
      editorial={editorial ? { paragraphs: editorial.paragraphs, ...(total > 0 ? { more: editorial.more } : {}) } : null}
      seasons={seasonLinks}
    />
  )
}
