import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { GuideLanding } from '@/components/guide-landing'
import { CITIES } from '@/lib/cities'
import {
  comboFacts, formatGuideDay, guideCopy, guidePath, parseCombo, relatedGuides, specFromParsed, whenMenuLabel,
} from '@/lib/local-seo'
import { MIN_INDEX, TOPICS, cityFromSlug, cityPath, slugify, suburbPath, type TopicDef, type WhenKey } from '@/lib/seo'
import { cityEventCounts, cityGuideModel, citySuburbs, landingData, lastRefreshAt, type LandingEvent } from '@/lib/seo-server'
import { siteUrl } from '@/lib/site-url'

function venuesOf(events: LandingEvent[]) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of events) {
    const name = e.venueName?.trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name)
    if (out.length >= 3) break
  }
  return out
}

const loadCombo = cache(async function loadCombo(citySlug: string, a: string, b: string, c?: string) {
  const segments = c ? [a, b, c] : [a, b]
  if (citySlug.includes('.') || segments.some((s) => s.includes('.'))) return null
  const city = cityFromSlug(citySlug)
  if (!city) return null
  const model = await cityGuideModel(city)
  const known = model.ok ? model.suburbs : await citySuburbs(city, 1)
  const parsed = parseCombo(city, segments, known)
  if (!parsed) return null
  const spec = specFromParsed(parsed)
  const path = guidePath(city, spec)
  if (!path) return null
  const activity: TopicDef | null = 'activity' in parsed ? parsed.activity : null
  const when: WhenKey | null = 'when' in parsed ? parsed.when : null
  const suburb = 'suburb' in parsed ? parsed.suburb : null
  const data = await landingData(city, activity, suburb ?? undefined, 60, when ?? undefined)
  if (data.total === 0) return null
  const self = model.decisions.find((d) => d.path === path)
  if (model.ok && self?.reason === 'near-duplicate' && self.canonicalPath !== path) redirect(self.canonicalPath)
  const copy = guideCopy({
    city: city.name,
    activity,
    when,
    suburb,
    total: data.total,
    from: when ? data.from : null,
    to: when ? data.to : null,
    venues: venuesOf(data.events),
  })
  return { city, model, path, activity, when, suburb, data, copy, index: !!(model.ok && self?.index) }
})

export async function comboMetadata(citySlug: string, segments: string[]): Promise<Metadata> {
  const loaded = await loadCombo(citySlug, segments[0] ?? '', segments[1] ?? '', segments[2])
  if (!loaded) return { title: 'Page not found | VibePeep', robots: { index: false } }
  const { path, copy, index } = loaded
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: copy.title, description: copy.description, url: path, images: ['/og-image.png'] },
    twitter: { card: 'summary_large_image', title: copy.title, description: copy.description, images: ['/og-image.png'] },
  }
}

export async function ComboPage({ citySlug, segments }: { citySlug: string; segments: string[] }) {
  const loaded = await loadCombo(citySlug, segments[0] ?? '', segments[1] ?? '', segments[2])
  if (!loaded) notFound()
  const { city, model, path, activity, when, suburb, data, copy } = loaded
  const [refreshed, counts] = await Promise.all([lastRefreshAt(), cityEventCounts()])
  const origin = siteUrl()
  const otherTopic = activity?.key ?? (when === 'tonight' || when === 'this-weekend' ? when : 'events')
  const crumbs = [
    { name: 'VibePeep', url: `${origin}/` },
    { name: city.name, url: `${origin}${cityPath(city)}` },
  ]
  if (suburb) {
    const href = suburbPath(city, suburb)
    if (model.decisions.some((d) => d.path === href && d.total > 0)) crumbs.push({ name: suburb, url: `${origin}${href}` })
  }
  if (activity && when) {
    const mid = suburb
      ? guidePath(city, { activity: activity.key, when: null, suburb, suburbSlug: slugify(suburb) })
      : cityPath(city, activity.key)
    const midOk = !!mid && (!suburb || model.decisions.some((d) => d.path === mid && d.total > 0))
    crumbs.push({ name: activity.label, url: `${origin}${midOk && mid ? mid : cityPath(city, activity.key)}` })
    crumbs.push({ name: whenMenuLabel(when), url: `${origin}${path}` })
  } else if (activity) crumbs.push({ name: activity.label, url: `${origin}${path}` })
  else if (when) crumbs.push({ name: whenMenuLabel(when), url: `${origin}${path}` })

  const guideList = model.ok
    ? TOPICS.filter((t) => t.key === 'events' || model.decisions.some((d) => d.path === cityPath(city, t.key) && d.index))
    : TOPICS

  return (
    <GuideLanding
      city={city}
      topic={activity}
      suburb={suburb}
      when={when}
      heading={copy.h1}
      blurb={copy.description}
      path={path}
      origin={origin}
      events={data.events}
      local={data.local}
      total={data.total}
      from={data.from}
      to={data.to}
      suburbs={model.ok ? model.decisions.filter((d) => d.kind === 'suburb' && d.index).map((d) => ({ name: d.spec.suburb!, slug: d.spec.suburbSlug!, count: d.total })) : []}
      guides={guideList}
      activeGuide={null}
      otherCities={CITIES.filter((c) => c.name !== city.name && (counts[c.name] ?? 0) >= MIN_INDEX).map((c) => ({
        href: cityPath(c, otherTopic),
        label: activity ? `${activity.label} in ${c.name}` : when ? `${whenMenuLabel(when)} in ${c.name}` : `Events in ${c.name}`,
      }))}
      facts={comboFacts({
        city: city.name,
        suburb,
        activity,
        when,
        total: data.total,
        from: when ? data.from : null,
        to: when ? data.to : null,
        next: data.events[0] ? { title: data.events[0].title, venue: data.events[0].venueName, when: formatGuideDay(data.events[0].date.toISOString().slice(0, 10)) } : null,
      })}
      refreshed={refreshed}
      related={model.ok ? relatedGuides(model.decisions, path, city.name) : []}
      crumbs={crumbs}
    />
  )
}
