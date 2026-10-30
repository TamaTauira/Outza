/**
 * SEO helpers shared by server pages and client links. Pure functions only (client-safe).
 * URL scheme: /<city>/<topic> landing pages, /<city>/<suburb> suburb pages,
 * inventory-gated combinations under /<city>/<suburb>/<activity>, /<city>/<activity>/<when>
 * and /<city>/<suburb>/<activity>/<when>, plus /events/<title-slug>-<id> event pages.
 */
import { CITIES, type CityDef } from '@/lib/cities'
import { toSydneyParts } from '@/lib/event-store-parts'

export function slugify(s: string, max = 70): string {
  const out = s
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return out.slice(0, max).replace(/-+$/, '') || 'event'
}

/** Canonical event URL: readable title slug followed by the (hyphen-free) id. */
export const eventPath = (ev: { id: string; title?: string | null }) =>
  ev.title ? `/events/${slugify(ev.title)}-${ev.id}` : `/events/${ev.id}`

/** Pulls the id back out of "/events/<slug>-<id>" (ids never contain hyphens). */
export const idFromEventParam = (param: string) => decodeURIComponent(param).split('-').pop() ?? param

export const citySlug = (c: string | CityDef) => slugify(typeof c === 'string' ? c : c.name)
export const cityFromSlug = (slug: string): CityDef | undefined => CITIES.find((c) => citySlug(c) === slug.toLowerCase())

export type TopicKey =
  | 'events' | 'tonight' | 'this-weekend' | 'free-events' | 'live-music' | 'markets' | 'festivals' | 'family' | 'lgbtiq'
  | 'garage-sales' | 'warehouse-sales' | 'pop-up-sales' | 'community-events'

/** Re-export of the shared indexability quantity gate. Prefer `assessIndexability` for new pages. */
export { INDEX_MIN_LISTINGS as MIN_INDEX } from '@/lib/indexability'

/** Stable seasonal URLs. Reserved so they cannot be claimed by a suburb slug. */
export type SeasonKey = 'christmas' | 'new-years-eve' | 'easter' | 'summer' | 'school-holidays'
export const SEASON_KEYS: readonly SeasonKey[] = ['christmas', 'new-years-eve', 'easter', 'summer', 'school-holidays']

/** Date facets that can combine with a city, suburb, or activity. Weekday keys are reserved so they cannot be suburb slugs. */
export type WhenKey = 'tonight' | 'this-weekend' | 'friday' | 'saturday' | 'sunday'
export const WHEN_KEYS: readonly WhenKey[] = ['tonight', 'this-weekend', 'friday', 'saturday', 'sunday']

export interface TopicDef {
  key: TopicKey
  label: string
  /** Search-friendly <title> lead (defaults to heading) */
  title?: (city: string) => string
  /** Which VibePeep Local category (if any) also feeds this page */
  local?: 'GARAGE' | 'WAREHOUSE' | 'MARKET' | 'COMMUNITY'
  /** Page heading / title builder */
  heading: (city: string) => string
  /** Short unique meta description lead */
  blurb: (city: string) => string
}

export const TOPICS: TopicDef[] = [
  { key: 'events', label: 'All events', title: (c) => `Things to do in ${c}: events & what’s on`, heading: (c) => `Events in ${c}`, blurb: (c) => `Gigs, shows, markets and festivals: every upcoming thing to do in ${c}, sorted by date.` },
  { key: 'tonight', label: 'Tonight', title: (c) => `Events tonight in ${c}: what’s on from 5pm`, heading: (c) => `What’s on tonight in ${c}`, blurb: (c) => `Evening plans only. Gigs, shows, trivia and late sessions in ${c} starting from 5pm, plus all-day listings still on tonight.` },
  { key: 'this-weekend', label: 'This weekend', title: (c) => `What’s on in ${c} this weekend`, heading: (c) => `Things to do in ${c} this weekend`, blurb: (c) => `Friday to Sunday sorted: live music, markets, theatre, sport and family days out in ${c}.` },
  { key: 'free-events', label: 'Free events', heading: (c) => `Free events in ${c}`, blurb: (c) => `Zero dollars, full fun: free festivals, markets, talks and exhibitions in ${c}.` },
  { key: 'live-music', label: 'Live music', title: (c) => `Live music & gigs in ${c}`, heading: (c) => `Live music in ${c}`, blurb: (c) => `From sticky-floor pub gigs to arena tours, here’s every upcoming show in ${c}.` },
  { key: 'markets', label: 'Markets', local: 'MARKET', heading: (c) => `Markets in ${c}`, blurb: (c) => `Farmers, night, makers and food markets: every upcoming market in ${c}.` },
  { key: 'festivals', label: 'Festivals', heading: (c) => `Festivals in ${c}`, blurb: (c) => `Music, food, culture and street festivals: every upcoming festival in ${c}, all in one spot.` },
  { key: 'family', label: 'Family & kids', title: (c) => `Family activities & things to do with kids in ${c}`, heading: (c) => `Family activities in ${c}`, blurb: (c) => `Little legends welcome: shows, workshops, holiday fun and family days out in ${c}.` },
  { key: 'lgbtiq', label: 'LGBTIQ+', title: (c) => `LGBTIQ+ events in ${c}: queer nights, drag & Pride`, heading: (c) => `LGBTIQ+ events in ${c}`, blurb: (c) => `Drag, dance floors, Pride and queer community events happening in ${c}.` },
  { key: 'garage-sales', label: 'Garage sales', local: 'GARAGE', title: (c) => `Garage sales in ${c} this week`, heading: (c) => `Garage sales in ${c}`, blurb: (c) => `One person’s clutter, your next treasure: public garage, moving and car boot sales around ${c}.` },
  { key: 'warehouse-sales', label: 'Warehouse sales', local: 'WAREHOUSE', heading: (c) => `Warehouse sales in ${c}`, blurb: (c) => `Clearances, sample sales and stock sell-offs from brands and retailers around ${c}.` },
  { key: 'pop-up-sales', label: 'Pop-up sales', local: 'MARKET', heading: (c) => `Pop-up sales & shops in ${c}`, blurb: (c) => `Here today, gone tomorrow: pop-up shops, stalls and limited-time sales around ${c}.` },
  { key: 'community-events', label: 'Community', local: 'COMMUNITY', title: (c) => `Community events in ${c}: fetes, fundraisers & meetups`, heading: (c) => `Community events in ${c}`, blurb: (c) => `School fetes, fundraisers, swaps and neighbourhood get-togethers around ${c}.` },
]
export const topicDef = (key: string) => TOPICS.find((t) => t.key === key)

export interface GuideFact {
  question: string
  answer: string
}

/**
 * Short answers a city guide can actually stand behind: the page's own rules, the live count,
 * and the next listing already on the page. Nothing here is a claim about an event we haven't loaded.
 */
export function guideFacts(input: {
  city: string
  topicKey?: TopicKey | null
  suburb?: string | null
  total: number
  freeShown?: number
  weekendLabel?: string | null
  next?: { title: string; venue?: string | null; when?: string | null } | null
}): GuideFact[] {
  const where = input.suburb ? `${input.suburb}, ${input.city}` : input.city
  const out: GuideFact[] = []
  const count = input.total > 0
    ? `VibePeep currently lists ${input.total} upcoming ${input.total === 1 ? 'listing' : 'listings'} for this page.`
    : 'New listings are added as organisers and ticket sites publish them.'
  switch (input.topicKey) {
    case 'tonight':
      out.push({
        question: `What is on tonight in ${input.city}?`,
        answer: `Tonight means events in ${where} that start at 5pm or later, plus all-day listings still on. Morning times stay on the full events guide. ${count}`,
      })
      break
    case 'this-weekend':
      out.push({
        question: `What’s on in ${input.city} this weekend?`,
        answer: `${input.weekendLabel ? `This page covers ${input.weekendLabel}. ` : 'This page covers Friday to Sunday in the city’s local time. '}${count}`,
      })
      break
    case 'free-events':
      out.push({
        question: `Are there free events in ${input.city}?`,
        answer: `This guide only includes listings marked free. Paid tickets are left on the main ${input.city} events page. ${count}`,
      })
      break
    case 'markets':
      out.push({
        question: `Where are the markets in ${input.city}?`,
        answer: `This page lists upcoming markets in ${where}: farmers, night, makers and food markets, including community market listings. ${count}`,
      })
      break
    case 'live-music':
      out.push({
        question: `Where can I find live music in ${input.city}?`,
        answer: `These are upcoming music listings in ${where}, from pub gigs to larger shows. ${count}`,
      })
      break
    case 'family':
      out.push({
        question: `What are family-friendly things to do in ${input.city}?`,
        answer: `These are upcoming listings filed under family in ${where}. ${count}`,
      })
      break
    case 'lgbtiq':
      out.push({
        question: `What LGBTIQ+ events are on in ${input.city}?`,
        answer: `These are upcoming listings tagged LGBTIQ+ in ${where}. ${count}`,
      })
      break
    case 'community-events':
      out.push({
        question: `What community events are on in ${input.city}?`,
        answer: `These are fetes, fundraisers, swaps and neighbourhood listings in ${where}. ${count}`,
      })
      break
    case 'garage-sales':
      out.push({
        question: `Where can I find garage sales near me in ${input.city}?`,
        answer: `This page lists public garage, moving and car boot sales in ${where}. Choose a suburb with its own garage-sale guide to see sales in that neighbourhood. There is no separate near-me page, because it would repeat these listings. ${count}`,
      })
      break
    case 'events':
      out.push({
        question: `What is there to do in ${where}?`,
        answer: `This is the full upcoming guide for ${where}: gigs, markets, shows and the rest, sorted by date. ${count}`,
      })
      break
    default:
      if (!input.topicKey) {
        out.push({
          question: `What events are on in ${where}?`,
          answer: count,
        })
      }
      break
  }
  if (input.topicKey && input.topicKey !== 'free-events' && (input.freeShown ?? 0) > 0) {
    out.push({
      question: `How many free events are shown for ${where}?`,
      answer: `${input.freeShown} of the events shown on this page ${input.freeShown === 1 ? 'is' : 'are'} listed as free. That count is only the events on this page, not every free event in ${input.city}.`,
    })
  }
  if (input.next?.title) {
    const bits = [input.next.when, input.next.venue].filter(Boolean).join(' at ')
    out.push({
      question: `What’s the next listing in ${where}?`,
      answer: `${input.next.title}${bits ? ` — ${bits}` : ''}. Times and prices can change, so confirm with the organiser before you go.`,
    })
  }
  return out
}

export const cityPath = (city: string | CityDef, topic: TopicKey = 'events') => `/${citySlug(city)}/${topic}`
export const suburbPath = (city: string | CityDef, suburb: string) => `/${citySlug(city)}/${slugify(suburb)}`

const ROAD = /\d|^cnr\b|\b(st|rd|dr|tce|pl|ave|hwy|pde|ln|lane|cres|cct|blvd|street|road|drive|terrace|place|avenue)\.?$/i
/** Suburb strings good enough to deserve their own landing page. */
export function isLandingSuburb(suburb: string | null | undefined, city: CityDef): suburb is string {
  if (!suburb || suburb.trim().length < 3 || ROAD.test(suburb.trim())) return false
  const s = slugify(suburb)
  if (s === citySlug(city) || TOPICS.some((t) => t.key === s) || (WHEN_KEYS as readonly string[]).includes(s) || (SEASON_KEYS as readonly string[]).includes(s)) return false
  return !CITIES.some((c) => citySlug(c) === s)
}

const STATE_RE = /\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Tasmania|Victoria|Queensland|New South Wales|Western Australia|South Australia|Northern Territory)\b/i
const STATE_NAMES: Record<string, string> = {
  tasmania: 'TAS', victoria: 'VIC', queensland: 'QLD', 'new south wales': 'NSW', 'western australia': 'WA', 'south australia': 'SA', 'northern territory': 'NT',
}
/** True when an address clearly names a different state (mis-filed listing). */
export function addressInOtherState(address: string | null | undefined, city: CityDef): boolean {
  const m = address?.match(STATE_RE)
  if (!m) return false
  const st = STATE_NAMES[m[1].toLowerCase()] ?? m[1].toUpperCase()
  const ok = city.state === 'ACT' ? ['ACT', 'NSW'] : [city.state]
  return !ok.includes(st)
}

export const addDaysKey = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Today's date (YYYY-MM-DD) in the city's own timezone. */
export const cityToday = (city: CityDef, now = new Date()) => toSydneyParts(now, city.tz).date

/** True when an event's last day (end date, else start date) is before today in its city. Past events are never shown. */
export const isPastEvent = (ev: { date: Date | string; endDate?: Date | string | null; city?: string | null }) => {
  const last = ev.endDate ?? ev.date
  const key = (typeof last === 'string' ? last : last.toISOString()).slice(0, 10)
  return key < cityToday(CITIES.find((c) => c.name === ev.city) ?? CITIES[0])
}

/** Friday–Sunday of the current weekend in the city's timezone (from today if already the weekend). */
export function weekendRange(city: CityDef, now = new Date()): { from: string; to: string } {
  const today = cityToday(city, now)
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  if (dow === 0) return { from: today, to: today }
  if (dow === 6) return { from: today, to: addDaysKey(today, 1) }
  if (dow === 5) return { from: today, to: addDaysKey(today, 2) }
  const fri = addDaysKey(today, 5 - dow)
  return { from: fri, to: addDaysKey(fri, 2) }
}

/**
 * Tonight is a start of 5pm or later in local time (HH:MM). Untimed all-day listings stay.
 * A 6:00, 9:30 or 10:00 start does not, even when the event keeps running past 5pm.
 */
export function isTonightSlot(time: string | null | undefined, endTime?: string | null): boolean {
  // endTime is accepted so callers can pass a slot, and ignored: only the start decides tonight.
  void endTime
  if (!time) return true
  const [h, m] = time.split(':').map((n) => parseInt(n, 10))
  if (!Number.isFinite(h)) return true
  const start = h * 60 + (Number.isFinite(m) ? m : 0)
  return start >= 17 * 60
}

/** "+11:00" style UTC offset for a timezone on a given local date. */
export function tzOffset(tz: string, dateKey: string): string {
  const probe = new Date(`${dateKey}T12:00:00Z`)
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(probe).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = name.match(/GMT([+-]\d{2}):?(\d{2})?/)
  return m ? `${m[1]}:${m[2] ?? '00'}` : '+00:00'
}
