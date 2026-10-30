import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { CityDef } from '@/lib/cities'
import { formatGuideDay, whenPhrase } from '@/lib/local-seo'
import { cityPath, suburbPath, type GuideFact, type TopicDef, type TopicKey, type WhenKey } from '@/lib/seo'
import { guideStructuredData, jsonLdString, type LandingEvent, type LandingLocal } from '@/lib/seo-server'
import { PageShell } from '@/components/page-shell'
import { EventCard, GuideEventRow } from '@/components/event-card'
import { LocalListingCards } from '@/components/local-listing-cards'

function topCounts(events: LandingEvent[], key: 'category' | 'venueName', n = 3) {
  const m = new Map<string, number>()
  for (const e of events) m.set(e[key], (m.get(e[key]) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)

export function GuideLanding(props: {
  city: CityDef
  topic: TopicDef | null
  suburb: string | null
  when: WhenKey | null
  heading: string
  blurb: string
  path: string
  origin: string
  events: LandingEvent[]
  local: LandingLocal[]
  total: number
  from: string
  to: string | null
  suburbs: { name: string; slug: string; count: number }[]
  guides: TopicDef[]
  activeGuide: TopicKey | null
  otherCities: { href: string; label: string }[]
  facts: GuideFact[]
  refreshed: Date | null
  related: { href: string; title: string }[]
  crumbs: { name: string; url: string }[]
}) {
  const { city, topic, suburb, when, heading, blurb, path, origin, events, local, total, from, to, suburbs, guides, activeGuide, otherCities, facts, refreshed, related, crumbs } = props
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
  const showRange = (when != null || topic?.key === 'this-weekend') && !!to
  const ld = guideStructuredData({ origin, path, heading, description: blurb, city, crumbs, events, local, total, refreshed, facts })

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
          {showRange && (
            <p className="mt-2 text-primary font-semibold">{formatGuideDay(from)}{from !== to ? ` – ${formatGuideDay(to!)}` : ''}</p>
          )}
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed line-clamp-3 md:line-clamp-none">{blurb}</p>
          {total > 0 && (
            <p className="mt-3 hidden text-muted-foreground leading-relaxed md:block">
              {topic?.key === 'tonight' || when === 'tonight' ? (
                <>Tonight covers <strong className="text-foreground">5pm onwards</strong> in {city.name}. Listings without a start time are marked possibly available and sit after the timed ones. Morning-only times stay on the <Link href={cityPath(city, 'events')} className="text-primary underline">full events guide</Link>.</>
              ) : (
                <>We currently list <strong className="text-foreground">{total}</strong> upcoming {total === 1 ? 'event' : 'events'}
                {suburb ? ` in ${suburb}` : ` in ${city.name}`}{when ? ` ${whenPhrase(when)}` : topic?.key === 'this-weekend' ? ' this weekend' : ''}.</>
              )}
              {cats.length > 0 && topic?.key !== 'live-music' && topic?.key !== 'tonight' && when !== 'tonight' && ` The most common categories on this page are ${list(cats).toLowerCase()}.`}
              {venues.length > 0 && ` Venues with the most listings on this page include ${list(venues)}.`}
              {freeShown > 0 && topic?.key !== 'free-events' && ` ${freeShown} of the events shown here ${freeShown === 1 ? 'is' : 'are'} listed as free.`}
              {local.length > 0 && ` ${local.length} ${local.length === 1 ? 'is a community listing' : 'are community listings'} from VibePeep Local.`}
            </p>
          )}
          {refreshed && (
            <p className="mt-2 text-xs text-muted-foreground">
              Listings last refreshed <time dateTime={refreshed.toISOString()}>{refreshed.toLocaleString('en-AU', { timeZone: city.tz, day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</time> ({city.name} time). Past events drop off automatically.
            </p>
          )}
        </header>

        <div className="sticky top-14 z-30 -mx-4 mt-6 space-y-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:top-16 sm:-mx-6 sm:px-6">
        <nav aria-label={`${city.name} guides`} className="flex gap-2 overflow-x-auto [scrollbar-width:thin]">
          {guides.map((t) => {
            const active = activeGuide === t.key
            return (
              <Link key={t.key} href={cityPath(city, t.key)} aria-current={active ? 'page' : undefined}
                className={active ? 'shrink-0 px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold' : 'shrink-0 px-3.5 py-1.5 rounded-full bg-card shadow-sm text-sm hover:bg-muted transition-colors'}>
                {t.key === 'events' ? `All ${city.name} events` : t.label}
              </Link>
            )
          })}
        </nav>
        {byDay.size > 1 && (
          <nav aria-label="Jump to a day" className="flex gap-1.5 overflow-x-auto [scrollbar-width:thin]">
            {[...byDay.keys()].map((key) => (
              <a key={key} href={`#d-${key}`} className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-muted">{formatGuideDay(key)}</a>
            ))}
          </nav>
        )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Plan the day in {city.name}:{' '}
          <Link href={`/outings/saturday-date-night?city=${encodeURIComponent(city.name)}`} className="text-primary underline">Saturday date night</Link>
          {', '}
          <Link href={`/outings/family-sunday?city=${encodeURIComponent(city.name)}`} className="text-primary underline">Family Sunday under $50</Link>
          {' or '}
          <Link href={`/outings/free-afternoon?city=${encodeURIComponent(city.name)}`} className="text-primary underline">a free afternoon</Link>.
        </p>

        {events.length === 0 && local.length === 0 ? (
          <div className="mt-12 rounded-xl bg-card p-8 text-center">
            <h2 className="font-display text-xl font-semibold">It’s quiet… for now.</h2>
            <p className="mt-2 text-muted-foreground">New listings land daily. In the meantime, browse <Link href={cityPath(city)} className="text-primary underline">all events in {city.name}</Link>.</p>
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {[...byDay].map(([key, evs]) => (
              <section key={key} aria-labelledby={`d-${key}`} className="scroll-mt-32">
                <h2 id={`d-${key}`} className="font-display text-xl font-bold mb-4">{formatGuideDay(key)}</h2>
                <div className="divide-y overflow-hidden rounded-xl border border-border bg-card md:hidden">
                  {evs.map((e) => <GuideEventRow key={e.id} event={{ ...e, date: e.date.toISOString(), imageAsset: e.imageAsset as any }} />)}
                </div>
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {evs.map((e, i) => <EventCard key={e.id} index={i} event={{ ...e, date: e.date.toISOString(), imageAsset: e.imageAsset as any }} />)}
                </div>
              </section>
            ))}
            {local.length > 0 && (
              <section aria-labelledby="local-listings">
                <h2 id="local-listings" className="font-display text-xl font-bold mb-1">From VibePeep Local</h2>
                <p className="text-sm text-muted-foreground mb-4">Public community listings added by organisers. <Link href="/local?tab=submit" className="text-primary underline">List yours free</Link>.</p>
                <LocalListingCards items={local.slice(0, 30)} />
              </section>
            )}
            {total > 0 && (
              <p className="text-sm leading-relaxed text-muted-foreground md:hidden">
                {topic?.key === 'tonight' || when === 'tonight' ? (
                  <>Tonight covers 5pm onwards in {city.name}. Untimed listings are marked possibly available.</>
                ) : (
                  <>{total} upcoming {total === 1 ? 'event' : 'events'}{suburb ? ` in ${suburb}` : ` in ${city.name}`}{when ? ` ${whenPhrase(when)}` : topic?.key === 'this-weekend' ? ' this weekend' : ''}.</>
                )}
                {cats.length > 0 && topic?.key !== 'live-music' && topic?.key !== 'tonight' && when !== 'tonight' && ` Most common: ${list(cats).toLowerCase()}.`}
                {freeShown > 0 && topic?.key !== 'free-events' && ` ${freeShown} listed as free.`}
              </p>
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
                <Link key={s.slug} href={suburbPath(city, s.name)} aria-current={s.name === suburb && !topic && !when ? 'page' : undefined}
                  className="px-3 py-1.5 rounded-lg bg-card shadow-sm text-sm hover:bg-muted transition-colors">
                  {s.name} <span className="text-muted-foreground">({s.count})</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-12" aria-labelledby="related-guides">
            <h2 id="related-guides" className="font-display text-xl font-bold mb-4">More guides from these listings</h2>
            <ul className="flex flex-wrap gap-2">
              {related.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-block px-3 py-1.5 rounded-lg bg-card shadow-sm text-sm hover:bg-muted transition-colors">{l.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {otherCities.length > 0 && (
          <section className="mt-12" aria-labelledby="cities">
            <h2 id="cities" className="font-display text-xl font-bold mb-4">{topic && topic.key !== 'events' ? `${topic.label} in other cities` : 'Events in other cities'}</h2>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {otherCities.map((c) => (
                <Link key={c.href} href={c.href} className="text-muted-foreground hover:text-primary">{c.label}</Link>
              ))}
            </div>
          </section>
        )}

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
