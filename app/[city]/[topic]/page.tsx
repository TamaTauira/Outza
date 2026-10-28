import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { CITIES, type CityDef } from '@/lib/cities'
import { TOPICS, MIN_INDEX, guideFacts, topicDef, cityFromSlug, cityPath, suburbPath, eventPath, type TopicDef } from '@/lib/seo'
import { cityEventCounts, citySuburbs, jsonLdString, landingData, lastRefreshAt, topicTotals, type LandingEvent } from '@/lib/seo-server'
import { siteUrl } from '@/lib/site-url'
import { localPath } from '@/lib/local-shared'
import { PageShell } from '@/components/page-shell'
import { EventCard } from '@/components/event-card'
import { LocalListingCards } from '@/components/local-listing-cards'

export const revalidate = 300

type Props = { params: Promise<{ city: string; topic: string }> }

type Resolved = { city: CityDef; topic: TopicDef | null; suburb: string | null; suburbs: Awaited<ReturnType<typeof citySuburbs>> }

async function resolve(citySlug: string, topicSlug: string): Promise<Resolved | null> {
  if (citySlug.includes('.') || topicSlug.includes('.')) return null
  const city = cityFromSlug(citySlug)
  if (!city) return null
  const topic = topicDef(topicSlug) ?? null
  const suburbs = await citySuburbs(city)
  if (topic) return { city, topic, suburb: null, suburbs }
  const sub = suburbs.find((s) => s.slug === topicSlug.toLowerCase())
  return sub ? { city, topic: null, suburb: sub.name, suburbs } : null
}

const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-AU', { ...opts, timeZone: 'UTC' })

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
  const r = await resolve(city, topic)
  if (!r) return { title: 'Page not found | Outza', robots: { index: false } }
  const data = await landingData(r.city, r.topic, r.suburb ?? undefined, 1)
  const range = r.topic?.key === 'this-weekend' && data.to ? ` (${fmtDay(data.from, { day: 'numeric', month: 'short' })}–${fmtDay(data.to, { day: 'numeric', month: 'short' })})` : ''
  const path = r.topic ? cityPath(r.city, r.topic.key) : suburbPath(r.city, r.suburb!)
  const title = `${r.topic?.title?.(r.city.name) ?? headingFor(r)}${range} | Outza`
  const description = `${blurbFor(r)} ${data.total ? `${data.total} upcoming listing${data.total === 1 ? '' : 's'}.` : ''}`.trim()
  // Thin pages stay reachable for people but out of search indexes until they have real substance
  const thin = data.total < (r.topic ? MIN_INDEX : 3)
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: thin ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title, description, url: path, images: ['/og-image.png'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og-image.png'] },
  }
}

function topCounts(events: LandingEvent[], key: 'category' | 'venueName', n = 3) {
  const m = new Map<string, number>()
  for (const e of events) m.set(e[key], (m.get(e[key]) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

export default async function LandingPage({ params }: Props) {
  const { city: citySlug, topic: topicSlug } = await params
  const r = await resolve(citySlug, topicSlug)
  if (!r) notFound()
  const { city, topic, suburb, suburbs } = r
  const [{ events, local, total, from, to }, totals, refreshed, counts] = await Promise.all([
    landingData(city, topic, suburb ?? undefined),
    topicTotals(city),
    lastRefreshAt(),
    cityEventCounts(),
  ])
  const otherCities = CITIES.filter((c) => c.name !== city.name && (counts[c.name] ?? 0) >= MIN_INDEX).map((c) => ({ c, n: counts[c.name] ?? 0 }))
  const origin = siteUrl()
  const guides = TOPICS.filter((t) => t.key === topic?.key || t.key === 'events' || totals[t.key] >= MIN_INDEX)
  const path = topic ? cityPath(city, topic.key) : suburbPath(city, suburb!)
  const heading = headingFor(r)

  const byDay = new Map<string, LandingEvent[]>()
  for (const e of events) {
    const k = e.date.toISOString().slice(0, 10)
    byDay.set(k, [...(byDay.get(k) ?? []), e])
  }
  const cats = topCounts(events, 'category').filter((c) => c !== 'Community' || topic?.key !== 'live-music')
  const venues = topCounts(events, 'venueName').filter((v) => {
    const n = v.trim().toLowerCase()
    return n && n !== city.name.toLowerCase() && n !== 'tba'
  })
  const freeShown = events.filter((e) => e.isFree && !/\$\s*[1-9]/.test(e.price ?? '')).length

  const crumbs = [
    { name: 'Outza', url: `${origin}/` },
    { name: city.name, url: `${origin}${cityPath(city)}` },
    ...(topic?.key === 'events' ? [] : [{ name: topic ? topic.label : suburb!, url: `${origin}${path}` }]),
  ]
  const nextEv = events[0]
  const facts = guideFacts({
    city: city.name,
    topicKey: topic?.key ?? null,
    suburb,
    total,
    freeShown,
    weekendLabel: topic?.key === 'this-weekend' && to ? `${fmtDay(from)} – ${fmtDay(to)}` : null,
    next: nextEv ? {
      title: nextEv.title,
      venue: nextEv.venueName,
      when: fmtDay(nextEv.date.toISOString().slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' }),
    } : null,
  })
  const listed = [
    ...events.slice(0, 30).map((e) => ({ url: `${origin}${eventPath(e)}`, name: e.title })),
    ...local.slice(0, 20).map((l) => ({ url: `${origin}${localPath(l)}`, name: l.title })),
  ]
  const ld = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) },
    {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name: heading, url: `${origin}${path}`, description: blurbFor(r), inLanguage: 'en-AU',
      ...(refreshed ? { dateModified: refreshed.toISOString() } : {}),
      about: { '@type': 'City', name: city.name, containedInPlace: { '@type': 'Country', name: 'Australia' } },
      ...(listed.length ? { mainEntity: { '@type': 'ItemList', name: heading, numberOfItems: total, itemListElement: listed.map((x, i) => ({ '@type': 'ListItem', position: i + 1, ...x })) } } : {}),
    },
    ...(facts.length ? [{
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: facts.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
    }] : []),
  ]

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ld) }} />
      <main className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground mb-5">
          {crumbs.map((c, i) => (
            <span key={c.url} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5" />}
              {i < crumbs.length - 1 ? <Link href={c.url.replace(origin, '') || '/'} className="hover:text-foreground">{c.name}</Link> : <span className="text-foreground">{c.name}</span>}
            </span>
          ))}
        </nav>

        <header className="max-w-3xl">
          <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tight">{heading}</h1>
          {topic?.key === 'this-weekend' && to && (
            <p className="mt-2 text-primary font-semibold">{fmtDay(from)}{from !== to ? ` – ${fmtDay(to)}` : ''}</p>
          )}
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">{blurbFor(r)}</p>
          {total > 0 && (
            <p className="mt-3 text-muted-foreground leading-relaxed">
              {topic?.key === 'tonight' ? (
                <>Tonight covers <strong className="text-foreground">5pm onwards</strong> in {city.name}, plus all-day listings. Early-morning times stay on the <Link href={cityPath(city, 'events')} className="text-primary underline">full events guide</Link>.</>
              ) : (
                <>We currently list <strong className="text-foreground">{total}</strong> upcoming {total === 1 ? 'event' : 'events'}
                {suburb ? ` in ${suburb}` : ` in ${city.name}`}{topic?.key === 'this-weekend' ? ' this weekend' : ''}.</>
              )}
              {cats.length > 0 && topic?.key !== 'live-music' && topic?.key !== 'tonight' && ` The most common categories on this page are ${list(cats).toLowerCase()}.`}
              {venues.length > 0 && ` Venues with the most listings on this page include ${list(venues)}.`}
              {freeShown > 0 && topic?.key !== 'free-events' && ` ${freeShown} of the events shown here ${freeShown === 1 ? 'is' : 'are'} listed as free.`}
              {local.length > 0 && ` ${local.length} ${local.length === 1 ? 'is a community listing' : 'are community listings'} from OUTZA Local.`}
            </p>
          )}
          {refreshed && (
            <p className="mt-2 text-xs text-muted-foreground">
              Listings last refreshed <time dateTime={refreshed.toISOString()}>{refreshed.toLocaleString('en-AU', { timeZone: city.tz, day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</time> ({city.name} time). Past events drop off automatically.
            </p>
          )}
        </header>

        <nav aria-label={`${city.name} guides`} className="mt-6 flex flex-wrap gap-2">
          {guides.map((t) => {
            const active = topic?.key === t.key
            return (
              <Link key={t.key} href={cityPath(city, t.key)} aria-current={active ? 'page' : undefined}
                className={active ? 'px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold' : 'px-3.5 py-1.5 rounded-full bg-card shadow-sm text-sm hover:bg-muted transition-colors'}>
                {t.key === 'events' ? `All ${city.name} events` : t.label}
              </Link>
            )
          })}
        </nav>

        {events.length === 0 && local.length === 0 ? (
          <div className="mt-12 rounded-xl bg-card p-8 text-center">
            <h2 className="font-display text-xl font-semibold">It’s quiet… for now.</h2>
            <p className="mt-2 text-muted-foreground">New listings land daily. In the meantime, browse <Link href={cityPath(city)} className="text-primary underline">all events in {city.name}</Link>.</p>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {[...byDay].map(([key, evs]) => (
              <section key={key} aria-labelledby={`d-${key}`}>
                <h2 id={`d-${key}`} className="font-display text-xl font-bold mb-4">{fmtDay(key)}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {evs.map((e, i) => <EventCard key={e.id} index={i} event={{ ...e, date: e.date.toISOString(), imageAsset: e.imageAsset as any }} />)}
                </div>
              </section>
            ))}
            {local.length > 0 && (
              <section aria-labelledby="local-listings">
                <h2 id="local-listings" className="font-display text-xl font-bold mb-1">From OUTZA Local</h2>
                <p className="text-sm text-muted-foreground mb-4">Public community listings added by organisers. <Link href="/local?tab=submit" className="text-primary underline">List yours free</Link>.</p>
                <LocalListingCards items={local.slice(0, 30)} />
              </section>
            )}
            {total > events.length + local.length && (
              <p className="text-center text-muted-foreground">Showing the next {events.length} of {total}. <Link href="/" className="text-primary underline">Open the full board</Link> to filter by date, category and price.</p>
            )}
          </div>
        )}

        {suburbs.length > 0 && (
          <section className="mt-16" aria-labelledby="suburbs">
            <h2 id="suburbs" className="font-display text-xl font-bold mb-4">Explore {city.name} by suburb</h2>
            <div className="flex flex-wrap gap-2">
              {suburbs.slice(0, 24).map((s) => (
                <Link key={s.slug} href={suburbPath(city, s.name)} aria-current={s.name === suburb ? 'page' : undefined}
                  className="px-3 py-1.5 rounded-lg bg-card shadow-sm text-sm hover:bg-muted transition-colors">
                  {s.name} <span className="text-muted-foreground">({s.count})</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12" aria-labelledby="cities">
          <h2 id="cities" className="font-display text-xl font-bold mb-4">{topic && topic.key !== 'events' ? `${topic.label} in other cities` : 'Events in other cities'}</h2>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {otherCities.filter((x) => x.n >= MIN_INDEX).map(({ c }) => (
              <Link key={c.name} href={cityPath(c, topic?.key ?? 'events')} className="text-muted-foreground hover:text-primary">
                {topic ? topic.heading(c.name) : `Events in ${c.name}`}
              </Link>
            ))}
          </div>
        </section>

        {facts.length > 0 && (
          <section className="mt-12 max-w-3xl" aria-labelledby="guide-facts">
            <h2 id="guide-facts" className="font-display text-xl font-bold mb-3">Good to know</h2>
            <dl className="space-y-3">
              {facts.map((f) => (
                <div key={f.question}>
                  <dt className="font-semibold">{f.question}</dt>
                  <dd className="text-sm text-muted-foreground mt-0.5">{f.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <p className="mt-12 text-xs text-muted-foreground max-w-3xl">
          Listings are gathered from organisers, official guides and ticketing sites and re-checked regularly. Times, prices and availability can change, so always confirm with the organiser before you go. Sponsored placements are always labelled.
        </p>
      </main>
    </PageShell>
  )
}
