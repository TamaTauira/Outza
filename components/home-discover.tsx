'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { localCategoryPath } from '@/lib/local-tiles'
import { displaySuburb } from '@/lib/cities'
import { addDays, formatPrice } from '@/lib/board'
import { LOCAL_TILES } from '@/lib/local-tiles'
import { eventPath } from '@/lib/seo'
import { categoryColor } from '@/lib/categories'
import { pickCornerPhoto } from '@/lib/corner-photo'

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
  communityKey?: string | null
  subTags?: string[]
}

export type MoodAction =
  | { kind: 'filters'; categories?: string[]; subTag?: string; isFree?: boolean }
  | { kind: 'ask'; query: string }

const usablePhoto = (url?: string | null) => !!url && /^https?:\/\//i.test(url) && !/picsum\.photos/i.test(url)

const listingText = (ev: NearbyEvent) => `${ev.title} ${ev.venueName ?? ''} ${(ev.subTags ?? []).join(' ')}`

const MOODS: { title: string; category: string; rank: (ev: NearbyEvent) => number; action: MoodAction }[] = [
  {
    title: 'Feel like dancing?',
    category: 'Nightlife',
    action: { kind: 'filters', categories: ['Nightlife'] },
    rank: (ev) => {
      const title = ev.title
      if (/\b(breathing|business|book club|running club|watercolour|watercolor)\b/i.test(title)) return 0
      let score = 0
      if (/\b(djs?|rave|disco|club night)\b/i.test(title)) score += 8
      if (/\b(dance party|dancing|line danc\w*)\b/i.test(title)) score += 6
      if (ev.category === 'Nightlife' && /\b(dj|dance|club)\b/i.test(title)) score += 4
      return score
    },
  },
  {
    title: 'Something a little fancy?',
    category: 'Arts & Culture',
    action: { kind: 'ask', query: 'Something a little fancy' },
    rank: (ev) => {
      const title = ev.title
      if (/\b(coffee|consultation|kids|toddler|yrs|years|class|lecture)\b/i.test(title)) return 0
      let score = 0
      if (/\b(gala|opera|fine dining|cocktails?)\b/i.test(title)) score += 8
      if (/\b(theatre|theater|ballet|high tea|aperitivo)\b/i.test(title)) score += 6
      return score
    },
  },
  {
    title: 'Culture fix.',
    category: 'Arts & Culture',
    action: { kind: 'filters', categories: ['Arts & Culture'] },
    rank: (ev) => {
      if (ev.category !== 'Arts & Culture' || !usablePhoto(ev.imageUrl)) return 0
      if (/\b(class|kids|toddler|yrs|years)\b/i.test(ev.title)) return 0
      return /\b(ballet|theatre|theater|opera|gallery|exhibition)\b/i.test(ev.title) ? 6 : 2
    },
  },
  {
    title: 'Good food, good company.',
    category: 'Food & Drink',
    action: { kind: 'filters', categories: ['Food & Drink'] },
    rank: (ev) => {
      if (ev.category !== 'Food & Drink' || !usablePhoto(ev.imageUrl)) return 0
      if (/\b(coffee consultation|homebrew|lecture)\b/i.test(ev.title)) return 1
      let score = 3
      if (/\b(dinner|foodie|market|cellar|table|tapas|street food|high tea)\b/i.test(ev.title)) score += 4
      return score
    },
  },
  {
    title: 'Free and fabulous.',
    category: 'Community',
    action: { kind: 'filters', isFree: true },
    rank: (ev) => (ev.isFree && usablePhoto(ev.imageUrl) ? 2 : 0),
  },
  {
    title: 'Something unexpected.',
    category: 'Wellness',
    action: { kind: 'ask', query: 'Something unexpected' },
    rank: (ev) => {
      if (!usablePhoto(ev.imageUrl)) return 0
      if (ev.category === 'Wellness') return 4
      if (ev.category === 'Community') return 2
      return 0
    },
  },
]

const COMMUNITY_KEYS = ['garage-sales', 'neighbourhood-popups', 'school-fundraisers', 'community-sport', 'farmers-markets'] as const

function TilePhoto({ src, tint, fit = 'cover' }: { src: string | null; tint: string; fit?: 'cover' | 'contain' }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [readySrc, setReadySrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const show = !!src && readySrc === src && failedSrc !== src

  useLayoutEffect(() => {
    const node = imgRef.current
    if (src && node?.complete && node.naturalWidth > 0) setReadySrc(src)
  }, [src])

  return (
    <>
      <span className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${tint} 0%, #14120f 78%)` }} aria-hidden />
      {src && failedSrc !== src ? (
        <img
          ref={imgRef}
          src={src}
          alt=""
          loading="eager"
          decoding="sync"
          className={`absolute inset-0 h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} transition duration-300 group-hover:scale-105 ${show ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setReadySrc(src)}
          onError={() => setFailedSrc(src)}
        />
      ) : null}
    </>
  )
}

export function HomeDiscover({
  city,
  today,
  onMood,
  onSuburb,
}: {
  city: string
  today: string | null
  onMood: (action: MoodAction) => void
  onSuburb: (suburb: string) => void
}) {
  const [events, setEvents] = useState<NearbyEvent[]>([])

  useEffect(() => {
    if (!today) return
    const params = new URLSearchParams({ limit: '300', dateFrom: today, dateTo: addDays(today, 21) })
    if (city) params.set('city', city)
    let live = true
    fetch(`/api/events?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => { if (live) setEvents((data?.events ?? []) as NearbyEvent[]) })
      .catch(() => { if (live) setEvents([]) })
    return () => { live = false }
  }, [city, today])

  const used = new Set<string>()
  const claim = (ev: NearbyEvent | undefined) => {
    const url = ev && usablePhoto(ev.imageUrl) ? ev.imageUrl! : null
    if (!url || used.has(url)) return null
    used.add(url)
    return url
  }
  const photoRank = (ev: NearbyEvent) => {
    const url = ev.imageUrl ?? ''
    if (!usablePhoto(url) || used.has(url)) return 0
    if (/cityofsydney/.test(url)) return 3
    if (/humanitix/.test(url)) return 2
    return 1
  }
  const best = (rank: (ev: NearbyEvent) => number) => {
    const ranked = events
      .map((ev) => ({ ev, score: rank(ev) }))
      .filter((row) => row.score > 0 && usablePhoto(row.ev.imageUrl) && !used.has(row.ev.imageUrl!))
      .sort((a, b) => b.score - a.score || photoRank(b.ev) - photoRank(a.ev) || listingText(a.ev).localeCompare(listingText(b.ev)))
    return claim(ranked[0]?.ev)
  }
  const moodPhotos = MOODS.map((mood) => best(mood.rank))
  const communityPhoto = pickCornerPhoto(events, { used })

  const nearby = (() => {
    const groups = new Map<string, NearbyEvent[]>()
    for (const ev of events) {
      const suburb = displaySuburb(ev.suburb, ev.venueAddress, ev.city)
      if (!suburb) continue
      groups.set(suburb, [...(groups.get(suburb) ?? []), ev])
    }
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 6)
      .map(([suburb, list]) => {
        const sample = [...list].sort((a, b) => photoRank(b) - photoRank(a)).find((ev) => usablePhoto(ev.imageUrl) && !used.has(ev.imageUrl!))
        const photo = claim(sample)
        return { suburb, count: list.length, sample: sample ?? list[0], photo }
      })
  })()
  const community = COMMUNITY_KEYS.map((key) => LOCAL_TILES.find((tile) => tile.key === key)).filter((tile): tile is NonNullable<typeof tile> => !!tile)

  return (
    <div className="mb-8 space-y-10">
      <section aria-label="What's the mood?">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">What’s the mood?</h2>
        <p className="mt-1 text-muted-foreground">What are you in the mood for?</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {MOODS.map((mood, index) => (
            <button key={mood.title} type="button" data-photo-tile="mood" onClick={() => onMood(mood.action)} className="group relative aspect-[4/3] overflow-hidden rounded-2xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <TilePhoto src={moodPhotos[index]} tint={categoryColor(mood.category)} />
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-3 font-display text-base font-bold leading-snug text-white drop-shadow-sm">{mood.title}</span>
            </button>
          ))}
        </div>
      </section>

      {nearby.length > 0 && (
        <section aria-label="Good things are happening nearby">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Good things are happening nearby.</h2>
          <p className="mt-1 text-muted-foreground">{city ? `A peep around ${city}.` : 'A peep around the country.'}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {nearby.map((row) => {
              const price = formatPrice(row.sample.isFree, row.sample.price, row.sample.priceMin, row.sample.priceMax)
              const photo = row.photo
              return (
                <article key={row.suburb} data-photo-tile="nearby" className="overflow-hidden rounded-2xl border border-border bg-card">
                  <button type="button" onClick={() => onSuburb(row.suburb)} className="group block w-full text-left">
                    <div className="relative aspect-[16/9]">
                      <TilePhoto src={photo} tint={categoryColor(row.sample.category)} />
                    </div>
                    <div className="flex items-end justify-between gap-3 p-4">
                      <div>
                        <h3 className="font-display text-xl font-bold">{row.suburb}</h3>
                        <p className="text-sm text-muted-foreground">{row.count} {row.count === 1 ? 'thing on' : 'things on'}</p>
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

      <section aria-label="Community discoveries" className="grid items-center gap-6 lg:grid-cols-2">
        <div data-photo-tile="community" className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-[#110e16]">
          <TilePhoto src={communityPhoto} tint="#110e16" fit="contain" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">The little things happening around the corner.</h2>
          <p className="mt-2 text-muted-foreground">Garage sales, markets, fetes. The good local stuff.</p>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {community.map((tile) => (
              <li key={tile.key}>
                <Link href={localCategoryPath(tile.key)} className="flex h-12 items-center rounded-xl border border-border bg-card px-3 text-sm font-semibold hover:border-primary">
                  {tile.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href={localCategoryPath('workshops')} className="flex h-12 items-center rounded-xl border border-border bg-card px-3 text-sm font-semibold hover:border-primary">
                Workshops
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
