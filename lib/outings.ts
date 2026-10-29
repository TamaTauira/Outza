/**
 * Day and night plans assembled from real VibePeep listings.
 * Dining and transport are text plus a link. VibePeep does not book restaurants or tickets.
 */
import { cityDef } from '@/lib/cities'
import { isPaidListing } from '@/lib/quality'
import { togetherLeg } from '@/lib/together'

export type OutingEvent = {
  id: string
  title: string
  date: string
  time: string | null
  endTime?: string | null
  venueName: string
  suburb?: string | null
  city: string
  category: string
  isFree: boolean
  price?: string | null
  priceMin?: number | null
  ticketUrl?: string | null
  latitude?: number | null
  longitude?: number | null
}

export type OutingStop =
  | { kind: 'event'; event: OutingEvent }
  | { kind: 'tip'; tip: 'dining' | 'transport'; text: string; href: string }

export type OutingTemplate = {
  slug: string
  title: string
  blurb: string
  /** 0 Sunday … 6 Saturday. Null means the soonest day with matches. */
  weekday: number | null
  categories: string[]
  freeOnly?: boolean
  maxPrice?: number
  fromMin?: number
  toMin?: number
  /** Untimed listings are kept. Timed ones outside the window are dropped. */
  allowUntimed?: boolean
  stops: number
}

export const TRIP_PLANNERS: Record<string, { name: string; url: string }> = {
  Sydney: { name: 'Transport NSW', url: 'https://transportnsw.info/trip' },
  Newcastle: { name: 'Transport NSW', url: 'https://transportnsw.info/trip' },
  Melbourne: { name: 'PTV', url: 'https://www.ptv.vic.gov.au/journey' },
  Brisbane: { name: 'Translink', url: 'https://jp.translink.com.au/plan-your-journey/journey-planner' },
  'Gold Coast': { name: 'Translink', url: 'https://jp.translink.com.au/plan-your-journey/journey-planner' },
  Perth: { name: 'Transperth', url: 'https://www.transperth.wa.gov.au/Journey-Planner' },
  Adelaide: { name: 'Adelaide Metro', url: 'https://www.adelaidemetro.com.au/planner' },
  Canberra: { name: 'Transport Canberra', url: 'https://www.transport.act.gov.au/' },
  Hobart: { name: 'Metro Tasmania', url: 'https://www.metrotas.com.au/' },
  Darwin: { name: 'Darwinbus', url: 'https://nt.gov.au/driving/public-transport-cycling/public-buses' },
}

export const OUTING_TEMPLATES: OutingTemplate[] = [
  {
    slug: 'saturday-date-night',
    title: 'Saturday date night',
    blurb: 'Two evening listings on a Saturday, with a dinner idea and a way to get between them. Dinner is a map search, not a booking.',
    weekday: 6,
    categories: ['Music', 'Arts & Culture', 'Food & Drink', 'Nightlife'],
    fromMin: 17 * 60,
    stops: 2,
  },
  {
    slug: 'family-sunday',
    title: 'Family Sunday under $50',
    blurb: 'Sunday listings marked free or priced at $50 or under on the source. Prices can change. Confirm with the organiser.',
    weekday: 0,
    categories: ['Family', 'Community', 'Arts & Culture'],
    maxPrice: 50,
    fromMin: 9 * 60,
    toMin: 17 * 60,
    allowUntimed: true,
    stops: 2,
  },
  {
    slug: 'free-afternoon',
    title: 'A free afternoon',
    blurb: 'Listings marked free, in the afternoon. Always confirm with the organiser before you head out.',
    weekday: null,
    categories: [],
    freeOnly: true,
    fromMin: 12 * 60,
    toMin: 18 * 60,
    allowUntimed: true,
    stops: 3,
  },
]

export function outingTemplate(slug: string): OutingTemplate | undefined {
  return OUTING_TEMPLATES.find((t) => t.slug === slug)
}

const toMin = (time?: string | null) => {
  const match = time?.match(/^(\d{1,2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function underCap(ev: OutingEvent, max: number): boolean {
  if (ev.isFree && !isPaidListing(ev)) return true
  if (typeof ev.priceMin === 'number') return ev.priceMin <= max
  return false
}

function mapsSearch(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export type BuiltOuting = {
  slug: string
  title: string
  blurb: string
  city: string
  date: string | null
  stops: OutingStop[]
  eventIds: string[]
}

export type PlanLeg = { fromId: string; toId: string; kind: string; text: string; href: string }

/** Straight-line hop between consecutive event stops. Always one line per hop, even when the pins are missing. */
export function legsBetween(events: OutingEvent[]): PlanLeg[] {
  const legs: PlanLeg[] = []
  for (let i = 1; i < events.length; i++) {
    const from = events[i - 1]
    const to = events[i]
    const leg = togetherLeg(
      { title: from.title, venueName: from.venueName, suburb: from.suburb, city: from.city, lat: from.latitude ?? null, lng: from.longitude ?? null },
      { title: to.title, venueName: to.venueName, suburb: to.suburb, city: to.city, lat: to.latitude ?? null, lng: to.longitude ?? null },
    )
    legs.push({ fromId: from.id, toId: to.id, kind: leg.kind, text: leg.text, href: leg.href })
  }
  return legs
}

/** Picks real events for one template. Returns an empty stop list when nothing fits. Never invents a listing. */
export function buildOuting(template: OutingTemplate, events: OutingEvent[], city: string): BuiltOuting {
  const pool = events.filter((ev) => {
    if (ev.city !== city) return false
    if (template.weekday != null && new Date(`${ev.date}T00:00:00Z`).getUTCDay() !== template.weekday) return false
    if (template.categories.length && !template.categories.includes(ev.category)) return false
    if (template.freeOnly && (ev.isFree !== true || isPaidListing(ev))) return false
    if (template.maxPrice != null && !underCap(ev, template.maxPrice)) return false
    const start = toMin(ev.time)
    if (start == null) return !!template.allowUntimed
    if (template.fromMin != null && start < template.fromMin) return false
    if (template.toMin != null && start >= template.toMin) return false
    return true
  })
  const byDay = new Map<string, OutingEvent[]>()
  for (const ev of pool) byDay.set(ev.date, [...(byDay.get(ev.date) ?? []), ev])
  const days = [...byDay.keys()].sort()
  let picked: OutingEvent[] = []
  let date: string | null = null
  for (const day of days) {
    const sorted = [...(byDay.get(day) ?? [])].sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
    const chosen: OutingEvent[] = []
    const venues = new Set<string>()
    for (const ev of sorted) {
      const venue = ev.venueName.trim().toLowerCase()
      if (venues.has(venue)) continue
      const prev = chosen[chosen.length - 1]
      const prevMin = prev ? toMin(prev.time) : null
      const thisMin = toMin(ev.time)
      if (prevMin != null && thisMin != null && thisMin - prevMin < 60) continue
      venues.add(venue)
      chosen.push(ev)
      if (chosen.length >= template.stops) break
    }
    if (chosen.length) {
      picked = chosen
      date = day
      break
    }
  }
  const stops = withTips(template, picked, city)
  return { slug: template.slug, title: template.title, blurb: template.blurb, city, date, stops, eventIds: picked.map((e) => e.id) }
}

function withTips(template: OutingTemplate, events: OutingEvent[], city: string): OutingStop[] {
  if (!events.length) return []
  const first = events[0]
  const planner = TRIP_PLANNERS[city] ?? { name: `${city} public transport`, url: TRIP_PLANNERS[cityDef(city).name]?.url ?? 'https://www.google.com/maps' }
  const dining: OutingStop = {
    kind: 'tip',
    tip: 'dining',
    text: template.slug === 'family-sunday'
      ? `Pack a snack, or search for a casual bite near ${first.venueName}. VibePeep does not take restaurant bookings.`
      : `Leave time for a meal near ${first.venueName}. This opens a map search. VibePeep does not book tables.`,
    href: mapsSearch(`restaurants near ${first.venueName} ${city}`),
  }
  const between = events.length > 1 ? `${events[0].venueName} and ${events[1].venueName}` : first.venueName
  const transport: OutingStop = {
    kind: 'tip',
    tip: 'transport',
    text: events.length > 1
      ? `Getting between ${between}: open ${planner.name} for a live route. The time between stops is a straight-line estimate, not a timetable.`
      : `Getting to ${first.venueName}: open ${planner.name}.`,
    href: planner.url,
  }
  const eventStops: OutingStop[] = events.map((event) => ({ kind: 'event', event }))
  if (template.slug === 'family-sunday') return [...eventStops, transport, dining]
  if (events.length === 1) return [eventStops[0], dining, transport]
  return [eventStops[0], dining, ...eventStops.slice(1), transport]
}
