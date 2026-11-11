'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { VibePeepMascot } from '@/components/vibepeep-mascot'
import { EventImage } from '@/components/event-image'
import { communityCityPath, communitySectionPath } from '@/lib/community-shared'
import { displaySuburb } from '@/lib/cities'
import { addDays, formatPrice } from '@/lib/board'
import { LOCAL_TILES } from '@/lib/local-tiles'
import { eventPath } from '@/lib/seo'
import type { ClientImage } from '@/lib/images/spec'

type NearbyEvent = {
  id: string
  title: string
  date: string
  venueName: string
  venueAddress?: string | null
  suburb?: string | null
  city?: string | null
  category: string
  isFree: boolean
  price: string | null
  priceMin?: number | null
  priceMax?: number | null
  imageUrl?: string | null
  imageAsset?: ClientImage | null
}

export type MoodAction =
  | { kind: 'filters'; categories?: string[]; subTag?: string; isFree?: boolean }
  | { kind: 'ask'; query: string }

const MOODS: { title: string; image: string; alt: string; action: MoodAction }[] = [
  { title: 'Feel like dancing?', image: '/placeholders/nightlife/card.webp', alt: 'Nightlife placeholder artwork', action: { kind: 'filters', categories: ['Nightlife'] } },
  { title: 'Something a little fancy?', image: '/placeholders/food-drink/card.webp', alt: 'Food and drink placeholder artwork', action: { kind: 'ask', query: 'Something a little fancy' } },
  { title: 'Culture fix.', image: '/placeholders/arts-culture/card.webp', alt: 'Arts and culture placeholder artwork', action: { kind: 'filters', categories: ['Arts & Culture'] } },
  { title: 'Good food, good company.', image: '/placeholders/food-drink/hero.webp', alt: 'Dining placeholder artwork', action: { kind: 'filters', categories: ['Food & Drink'] } },
  { title: 'Free and fabulous.', image: '/placeholders/community/card.webp', alt: 'Community placeholder artwork', action: { kind: 'filters', isFree: true } },
  { title: 'Something unexpected.', image: '/placeholders/arts-culture/hero.webp', alt: 'Arts placeholder artwork', action: { kind: 'ask', query: 'Something unexpected' } },
]

const COMMUNITY_KEYS = ['garage-sales', 'neighbourhood-popups', 'school-fundraisers', 'community-sport', 'farmers-markets'] as const

const ASKS = [
  'Find something fun this Saturday under $50.',
  'Where can I hear live jazz tonight?',
  'Plan a date night around Surry Hills.',
  'What’s happening that’s a little different?',
]

export function HomeDiscover({
  city,
  today,
  onMood,
  onSuburb,
  onAsk,
  onWorkshops,
}: {
  city: string
  today: string | null
  onMood: (action: MoodAction) => void
  onSuburb: (suburb: string) => void
  onAsk: (query: string) => void
  onWorkshops: () => void
}) {
  const [nearby, setNearby] = useState<{ suburb: string; count: number; sample: NearbyEvent }[]>([])

  useEffect(() => {
    if (!today) return
    const params = new URLSearchParams({ limit: '200', dateFrom: today, dateTo: addDays(today, 14) })
    if (city) params.set('city', city)
    let live = true
    fetch(`/api/events?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!live) return
        const groups = new Map<string, { count: number; sample: NearbyEvent }>()
        for (const ev of (data?.events ?? []) as NearbyEvent[]) {
          const suburb = displaySuburb(ev.suburb, ev.venueAddress, ev.city)
          if (!suburb) continue
          const current = groups.get(suburb)
          if (current) current.count += 1
          else groups.set(suburb, { count: 1, sample: ev })
        }
        setNearby([...groups.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).slice(0, 6).map(([suburb, row]) => ({ suburb, ...row })))
      })
      .catch(() => { if (live) setNearby([]) })
    return () => { live = false }
  }, [city, today])

  const community = COMMUNITY_KEYS.map((key) => LOCAL_TILES.find((tile) => tile.key === key)).filter((tile): tile is NonNullable<typeof tile> => !!tile)

  return (
    <div className="mb-8 space-y-10">
      <section aria-label="Explore by mood">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Explore by mood.</h2>
        <p className="mt-1 text-muted-foreground">Pick a mood. We’ll open the real filters, or ask VibePeep.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {MOODS.map((mood) => (
            <button key={mood.title} type="button" onClick={() => onMood(mood.action)} className="group relative aspect-[4/3] overflow-hidden rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <img src={mood.image} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/10" />
              <span className="absolute inset-x-0 bottom-0 p-3 font-display text-base font-bold leading-tight text-white sm:text-lg">{mood.title}</span>
              <span className="sr-only">{mood.alt}</span>
            </button>
          ))}
        </div>
      </section>

      {nearby.length > 0 && (
        <section aria-label="Good things are happening nearby">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Good things are happening nearby.</h2>
          <p className="mt-1 text-muted-foreground">{city ? `Suburbs in ${city} with listings over the next fortnight.` : 'Suburbs with listings over the next fortnight.'}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {nearby.map((row) => {
              const price = formatPrice(row.sample.isFree, row.sample.price, row.sample.priceMin, row.sample.priceMax)
              return (
                <article key={row.suburb} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <button type="button" onClick={() => onSuburb(row.suburb)} className="block w-full text-left">
                    <div className="relative aspect-[16/8]">
                      <EventImage image={row.sample.imageAsset} src={row.sample.imageUrl} kind="card" alt="" sizes="(min-width: 1280px) 30vw, 100vw" crop category={row.sample.category} slot="card" />
                    </div>
                    <div className="flex items-end justify-between gap-3 p-4">
                      <div>
                        <h3 className="font-display text-xl font-bold">{row.suburb}</h3>
                        <p className="text-sm text-muted-foreground">{row.count} {row.count === 1 ? 'listing' : 'listings'}</p>
                      </div>
                      <span className="text-sm font-semibold text-primary">See them</span>
                    </div>
                  </button>
                  <p className="border-t border-border px-4 py-3 text-sm">
                    <Link href={eventPath(row.sample)} className="font-semibold hover:text-primary">{row.sample.title}</Link>
                    <span className="mt-0.5 block text-muted-foreground">{row.sample.venueName} · {price.value}</span>
                  </p>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section aria-label="Community discoveries" className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">The little things happening around the corner.</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">Garage sales, markets, fundraisers and the rest of the neighbourhood. Each one opens the live community page.</p>
        </div>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {community.map((tile) => (
            <li key={tile.key}>
              <Link href={city ? communityCityPath(tile.key, city) : communitySectionPath(tile.key)} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold hover:bg-muted">
                {tile.srcSmall && <img src={tile.srcSmall} alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />}
                <span>{tile.label}</span>
              </Link>
            </li>
          ))}
          <li>
            <button type="button" onClick={onWorkshops} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold hover:bg-muted">
              <img src="/placeholders/education/square.webp" alt="" className="h-10 w-10 rounded-lg object-cover" loading="lazy" />
              <span>Workshops</span>
            </button>
          </li>
        </ul>
      </section>

      <section aria-label="Ask VibePeep" className="overflow-hidden rounded-3xl bg-[#0c0f0e] text-white">
        <form className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6" onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get('q'); if (typeof q === 'string' && q.trim()) onAsk(q.trim()); }}>
          <VibePeepMascot onDark className="w-16 shrink-0 sm:w-20" sizes="80px" alt="VibePeep" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Not sure what you’re in the mood for?</h2>
            <p className="mt-1 text-white/75">Ask VibePeep. This uses the same search as the bar above.</p>
            <div className="mt-4 flex gap-2">
              <label className="sr-only" htmlFor="ask-vibepeep">Ask VibePeep</label>
              <input id="ask-vibepeep" name="q" placeholder="Ask VibePeep anything…" className="h-12 min-w-0 flex-1 rounded-full bg-white px-4 text-sm text-neutral-900 placeholder:text-neutral-500" />
              <button type="submit" className="h-12 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Ask</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ASKS.map((query) => (
                <button key={query} type="button" onClick={() => onAsk(query)} className="rounded-full bg-white/10 px-3 py-2 text-left text-sm text-white hover:bg-white/20">
                  {query}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
