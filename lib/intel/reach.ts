// Event-specific reach notes for VibePeep Intelligence.
// Every number comes from the caller (official imports or a count of VibePeep listings). Nothing is estimated.
import { citySlug } from '@/lib/seo'
import { normalizeVenue } from '@/lib/quality'
import type { DataKind, InsightSource } from './sources'
import type { Voice } from './voice'
import { confidenceFor, ptsDiff } from './util'
import { visitorCopy, weekendCopy, type VisitorSignal, type WeekendSignal } from './crowd-shape'
import { footfallMissingDetail, footfallSeriesReady } from './markets'

export type Confidence = 'high' | 'medium' | 'low' | 'insufficient'
export type InsightLink = { name: string; url: string; note: string }
export type Insight = {
  title: string
  detail: string
  kind: DataKind
  confidence: Confidence
  sources: InsightSource[]
  links?: InsightLink[]
  /** Queer-promo card: full width, labelled, not a stat. */
  highlight?: boolean
}
export type Gap = { title: string; detail: string }
export type ReachGoal = 'tickets' | 'visits' | 'both' | 'reach'
export type PriceBandId = 'free' | 'under30' | '30-79' | '80-149' | '150+'

export const CATALOGUE_RADIUS_DAYS = 45
export const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09" → "Sep 2026", "YE-2026-06" → "year ending Jun 2026", "2025-Q4" → "Dec quarter 2025". */
export const fmtPeriod = (p?: string | null) => {
  if (!p) return ''
  const q = p.match(/^(\d{4})-Q([1-4])$/)
  if (q) return `${['Mar', 'Jun', 'Sep', 'Dec'][Number(q[2]) - 1]} quarter ${q[1]}`
  const m = p.match(/^(YE-)?(\d{4})-(\d{2})$/)
  return m ? `${m[1] ? 'year ending ' : ''}${MON[Number(m[3]) - 1]} ${m[2]}` : p
}

const yearsOld = (period: string | null) => (period ? new Date().getUTCFullYear() - Number(period.slice(0, 4)) : 99)
const aud = (n: number) => `$${Number.isInteger(n) ? n.toLocaleString('en-AU') : n.toFixed(2)}`
const nfmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const things = (n: number, one: string, many: string) => (n === 0 ? `No ${many}` : `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`)

/** Sum of shares. A missing band returns null so we never treat a hole as zero. */
export function shareSum(values: (number | null | undefined)[]): number | null {
  if (values.some((v) => v == null)) return null
  return values.reduce<number>((t, v) => t + (v ?? 0), 0)
}

export function reachGoal(category: string, paid: boolean): ReachGoal {
  const visits = category === 'Food & Drink' || category === 'Nightlife'
  if (visits && paid) return 'both'
  if (visits) return 'visits'
  return paid ? 'tickets' : 'reach'
}

/** Free listings, including a published $0. No price at all returns null — we do not guess a band. */
export function priceBand(isFree: boolean, priceMin: number | null): { id: PriceBandId; label: string } | null {
  if (isFree || priceMin === 0) return { id: 'free', label: 'free' }
  if (priceMin == null || priceMin < 0) return null
  if (priceMin < 30) return { id: 'under30', label: 'under $30' }
  if (priceMin < 80) return { id: '30-79', label: '$30–$79' }
  if (priceMin < 150) return { id: '80-149', label: '$80–$149' }
  return { id: '150+', label: '$150 and over' }
}

export function listedPrice(isFree: boolean, min: number | null, max: number | null, text: string | null): string | null {
  if (isFree) return 'Free'
  if (min != null && min > 0) return max != null && max > min ? `${aud(min)}–${aud(max)}` : aud(min)
  return text?.trim() || null
}

export type NightTitle = { title: string; venueName: string; category: string }

export type CatalogueSnapshot = {
  sameNightTotal: number
  sameNightCategory: number
  sameNightSuburb: number | null
  sameVenueTitles: string[]
  otherNightTitles: string[]
  sameNightMore: number
  categoryTotal: number
  weekdayMedian: number
  otherDayMedian: number
  weekdayEnough: boolean
  goingOutSuburb: number | null
  goingOutCity: number
  bandLabel: string | null
  /** Null when this listing has no price band. */
  comps: number | null
  compsMin: number | null
  compsMax: number | null
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10)
export const addUtcDays = (d: Date, n: number) => {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + n)
  return x
}
export const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

function eachDay(start: string, end: string): string[] {
  const out: string[] = []
  let d = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (d <= last && out.length < 120) {
    out.push(dayKey(d))
    d = addUtcDays(d, 1)
  }
  return out
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Folds per-day category counts, including days with none, into weekday vs other-day medians. */
export function weekdayMedians(eventDate: string, windowStart: string, windowEnd: string, counts: { day: string; n: number }[]) {
  const by: Record<string, number> = {}
  for (const c of counts) by[c.day.slice(0, 10)] = (by[c.day.slice(0, 10)] ?? 0) + c.n
  const dow = new Date(`${eventDate}T00:00:00Z`).getUTCDay()
  const same: number[] = []
  const other: number[] = []
  for (const day of eachDay(windowStart, windowEnd)) {
    const n = by[day] ?? 0
    if (new Date(`${day}T00:00:00Z`).getUTCDay() === dow) same.push(n)
    else other.push(n)
  }
  const total = Object.values(by).reduce((t, n) => t + n, 0)
  return { total, sameMedian: median(same), otherMedian: median(other), enough: total >= 8 }
}

export function buildCatalogueSnapshot(input: {
  eventDate: string
  windowStart: string
  windowEnd: string
  category: string
  suburb: string | null
  venueName: string
  bandLabel: string | null
  countsByDay: { day: string; n: number }[]
  nightTitles: NightTitle[]
  sameNightTotal: number
  sameNightCategory: number
  sameNightSuburb: number | null
  goingOutSuburb: number | null
  goingOutCity: number
  comps: number | null
  compsMin: number | null
  compsMax: number | null
}): CatalogueSnapshot {
  const mine = normalizeVenue(input.venueName)
  const generic = !mine || mine.length < 4 || /^(tba|tbc|venue)$/.test(mine)
  const sameVenue: NightTitle[] = []
  const elsewhere: NightTitle[] = []
  for (const row of input.nightTitles) {
    if (!generic && normalizeVenue(row.venueName) === mine) sameVenue.push(row)
    else elsewhere.push(row)
  }
  elsewhere.sort((a, b) => Number(a.category !== input.category) - Number(b.category !== input.category) || a.title.localeCompare(b.title))
  const sameVenueTitles = sameVenue.slice(0, 3).map((r) => r.title)
  const otherNightTitles = elsewhere.slice(0, 3).map((r) => `${r.title} at ${r.venueName}`)
  const shown = sameVenueTitles.length + otherNightTitles.length
  const days = weekdayMedians(input.eventDate, input.windowStart, input.windowEnd, input.countsByDay)
  return {
    sameNightTotal: input.sameNightTotal,
    sameNightCategory: input.sameNightCategory,
    sameNightSuburb: input.suburb?.trim() ? input.sameNightSuburb : null,
    sameVenueTitles,
    otherNightTitles,
    sameNightMore: Math.max(0, input.sameNightTotal - shown),
    categoryTotal: days.total,
    weekdayMedian: days.sameMedian,
    otherDayMedian: days.otherMedian,
    weekdayEnough: days.enough,
    goingOutSuburb: input.suburb?.trim() ? input.goingOutSuburb : null,
    goingOutCity: input.goingOutCity,
    bandLabel: input.bandLabel,
    comps: input.comps,
    compsMin: input.compsMin,
    compsMax: input.compsMax,
  }
}

export type EventFacts = {
  venueName: string
  suburb: string | null
  city: string
  category: string
  subTags: string[]
  dateLabel: string
  dowName: string
  dow: number
  goal: ReachGoal
  queer: boolean
  priceLabel: string | null
  bandLabel: string | null
  stateCode: string | null
  stateName: string
}

export type AreaSignals = {
  status: 'ok' | 'no_location' | 'outside_au' | 'no_data'
  areaName: string
  benchLabel: string
  stateName: string
  spendLabel: string
  transportCovered: boolean
  ages: { band: string; venue: number; bench: number | null }[]
  agePeriod: string | null
  under15: { local: number; bench: number | null } | null
  bornOverseas: { local: number; bench: number | null; period: string | null } | null
  food: { businesses: number; benchBusinesses: number; pop: number; benchPop: number; period: string | null } | null
  station: { name: string; distanceKm: number; entries: number; month: string | null; yoyPct: number | null } | null
  /** Stations exist, but none has a tap-on total — don't also claim there is no station. */
  stationsWithoutTaps: boolean
  recreationYoy: number | null
  hospitalityYoy: number | null
  alcoholYoy: number | null
  spendMonth: string | null
  tourism: { title: string; period: string | null; intlVisitors: number; yoyPct: number | null } | null
  visitor: VisitorSignal | null
  weekend: WeekendSignal | null
  /** Resolved market (Sydney, Cairns, Launceston, …), which can be finer than the catalogue city. */
  marketId: string
  seifa: { area: string; decile: number; advantageDecile?: number | null } | null
  areaLoaded: boolean
}

const cat = (sources: InsightSource[], kind: DataKind, confidence: Confidence, title: string, detail: string, extra?: Pick<Insight, 'links' | 'highlight'>): Insight =>
  ({ title, detail, kind, confidence, sources, ...extra })

function lead(voice: Voice, f: EventFacts): Insight {
  const named = voice.owned && f.venueName.trim() ? `your venue (${f.venueName.trim()})` : voice.venueNamed
  const where = f.suburb?.trim() ? `${f.suburb.trim()}, ${f.city}` : f.city
  const room = voice.owned ? 'your venue' : 'the venue'
  const job = {
    tickets: 'The result to chase is ticket sales.',
    visits: `The result to chase is people at ${room} — a full room, not a ticket chart.`,
    both: `The result to chase is ticket sales and people actually at ${room}.`,
    reach: `No ticket price is published, so the result to chase is people at ${room}.`,
  }[f.goal]
  const priceBit = f.priceLabel ? ` Listed price: ${f.priceLabel}.` : ''
  return cat(
    ['outza_catalogue'], 'observed', 'high',
    `Reach for this ${f.dowName} ${f.category}`,
    `${f.dateLabel}: ${f.category} at ${named} in ${where}.${priceBit} ${job} Use the cards for who lives nearby, where an ad should point, and whether this night is crowded on VibePeep. None of this is a sales forecast.`,
  )
}

function sameNight(voice: Voice, f: EventFacts, c: CatalogueSnapshot): Insight {
  let detail: string
  if (c.sameNightTotal === 0) {
    detail = `No other listing in ${f.city} falls on ${f.dateLabel} in the VibePeep catalogue. That is this catalogue, not every event in town.`
  } else {
    const ofThem = c.sameNightCategory === 0 ? `none of them ${f.category}` : `${c.sameNightCategory} of them ${f.category}`
    detail = `${things(c.sameNightTotal, 'other listing', 'other listings')} in ${f.city} on ${f.dateLabel}, ${ofThem}.`
    if (c.sameNightSuburb != null && f.suburb?.trim()) detail += ` ${c.sameNightSuburb} in ${f.suburb.trim()}.`
    if (c.otherNightTitles.length) detail += ` On VibePeep that day: ${c.otherNightTitles.join('; ')}.`
    if (c.sameNightMore > 0) detail += ` And ${c.sameNightMore} more.`
    if (c.sameVenueTitles.length) detail += ` Also at ${voice.venue} that day: ${c.sameVenueTitles.join('; ')}.`
    detail += ' Name what is different (time, price, room) so the ad is not another identical tile. Counts are listings, not ticket demand.'
  }
  return cat(['outza_catalogue'], 'observed', c.sameNightTotal ? 'medium' : 'low', `What else is listed in ${f.city} that day`, detail)
}

function weekdayDemand(f: EventFacts, c: CatalogueSnapshot): Insight {
  const title = `${f.category} on ${f.dowName}s in ${f.city}`
  if (!c.weekdayEnough) {
    return cat(['outza_catalogue'], 'derived', 'insufficient', title,
      `VibePeep has ${things(c.categoryTotal, `other ${f.category} listing`, `other ${f.category} listings`)} in ${f.city} in the 45 days either side of this date. Too few to call a ${f.dowName} hot or quiet. The count is the catalogue, not demand.`)
  }
  const same = nfmt(c.weekdayMedian)
  const other = nfmt(c.otherDayMedian)
  if (c.weekdayMedian >= 2 && c.weekdayMedian >= c.otherDayMedian * 1.4) {
    return cat(['outza_catalogue'], 'derived', 'medium', title,
      `Other ${f.category} listings in ${f.city} bunch up on ${f.dowName}s: a typical ${f.dowName} in this window has ${same}, versus ${other} on other days. The catalogue is crowded — say what is different, and run the ad earlier in the week. Listings, not ticket demand.`)
  }
  if (c.otherDayMedian >= 2 && c.weekdayMedian <= c.otherDayMedian * 0.6) {
    return cat(['outza_catalogue'], 'derived', 'medium', title,
      `${f.dowName}s are quieter in the ${f.city} ${f.category} catalogue: a typical ${f.dowName} has ${same} other listings, versus ${other} on other days. Less competition for the same ad, if the people you want are actually free. Listings, not ticket demand.`)
  }
  return cat(['outza_catalogue'], 'derived', 'medium', title,
    `${f.category} listings in ${f.city} are not piled onto ${f.dowName}s. A typical ${f.dowName} in this window has ${same} other listings, versus ${other} on other days (${c.categoryTotal} in the 45 days either side). Listings, not ticket demand.`)
}

function goingOut(f: EventFacts, c: CatalogueSnapshot): Insight {
  const [one, many] = f.category === 'Food & Drink' || f.category === 'Nightlife'
    ? ['other Food & Drink or Nightlife listing', 'other Food & Drink or Nightlife listings']
    : ['Food & Drink or Nightlife listing', 'Food & Drink or Nightlife listings']
  const place = f.suburb?.trim()
  const detail = place && c.goingOutSuburb != null
    ? `In the 45 days either side, VibePeep lists ${things(c.goingOutSuburb, one, many)} in ${place}, and ${things(c.goingOutCity, 'listing', 'listings')} across ${f.city}. Listing density, not how many people are out.`
    : `No suburb on the listing, so this stays city-wide: ${things(c.goingOutCity, 'Food & Drink or Nightlife listing', 'Food & Drink or Nightlife listings')} in ${f.city} in the 45 days either side. Listing density, not foot traffic.`
  return cat(['outza_catalogue'], 'observed', place ? 'medium' : 'low', `Food and nightlife listings around ${place || f.city}`, detail)
}

function priceComps(voice: Voice, f: EventFacts, c: CatalogueSnapshot): Insight {
  const title = `Similar ${f.category} prices on VibePeep`
  if (!c.bandLabel || c.comps == null) {
    return cat(['outza_catalogue'], 'observed', 'insufficient', 'No price band to compare',
      `No price is published on ${voice.listing}, so it cannot be lined up with other ${f.category} listings. Nothing here is guessed.`)
  }
  const mine = f.priceLabel ? ` This one is listed at ${f.priceLabel}.` : ''
  if (c.bandLabel === 'free') {
    return cat(['outza_catalogue'], 'observed', c.comps >= 3 ? 'medium' : 'low', title,
      `${things(c.comps, `other free ${f.category} listing`, `other free ${f.category} listings`)} in ${f.city} in the 45 days either side.${mine} That is the free set on VibePeep, not what people paid.`)
  }
  if (c.comps === 0) {
    return cat(['outza_catalogue'], 'observed', 'low', title,
      `No other ${f.category} listing in ${f.city} in this window sits in the ${c.bandLabel} band.${mine}`)
  }
  const range = c.compsMin != null && c.compsMax != null
    ? (c.compsMin === c.compsMax ? ` Listed at ${aud(c.compsMin)}.` : ` Published prices run from ${aud(c.compsMin)} to ${aud(c.compsMax)}.`)
    : ''
  return cat(['outza_catalogue'], 'derived', c.comps >= 5 ? 'medium' : 'low', title,
    `${things(c.comps, `other ${f.category} listing`, `other ${f.category} listings`)} in ${f.city} ${c.comps === 1 ? 'is' : 'are'} in the ${c.bandLabel} band.${range}${mine} Published prices, not what sold.`)
}

function ageInsight(f: EventFacts, a: AreaSignals): Insight | null {
  if (!a.ages.length) return null
  const diffs = a.ages.filter((x) => x.bench != null).map((x) => ({ ...x, d: ptsDiff(x.venue, x.bench) ?? 0 })).sort((x, y) => y.d - x.d)
  const top = diffs[0]
  if (!top || top.d < 2 || top.bench == null) return null
  return cat(['abs_region'], 'derived', confidenceFor({ hasData: true, geoPrecise: true, ageYears: yearsOld(a.agePeriod) }),
    `Residents aged ${top.band} are over-represented locally`,
    `${top.venue.toFixed(1)}% of residents in ${a.areaName} are aged ${top.band}, versus ${top.bench.toFixed(1)}% across ${a.benchLabel} (${a.agePeriod}). This ${f.dowName} ${f.category} listing sits in that patch — test the first line of the ad on that age group. Residents are not ticket buyers and not foot traffic.`)
}

function overseasInsight(f: EventFacts, a: AreaSignals): Insight | null {
  const b = a.bornOverseas
  if (!b || b.bench == null || (ptsDiff(b.local, b.bench) ?? 0) < 8) return null
  return cat(['abs_region'], 'derived', confidenceFor({ hasData: true, geoPrecise: true, ageYears: yearsOld(b.period), proxy: true }),
    `More residents born overseas than across ${a.benchLabel}`,
    `${b.local.toFixed(1)}% of residents in ${a.areaName} were born overseas, versus ${b.bench.toFixed(1)}% across ${a.benchLabel}${b.period ? ` (${b.period})` : ''}. If this ${f.category} night is not only in English, say so in the first line. Census figure for people who live here, not the crowd on the night.`)
}

function familyInsight(f: EventFacts, a: AreaSignals): Insight | null {
  if (f.category !== 'Family' || !a.under15) return null
  const u = a.under15
  const versus = u.bench != null ? `, versus ${u.bench.toFixed(1)}% across ${a.benchLabel}` : ''
  return cat(['abs_region'], 'derived', confidenceFor({ hasData: true, geoPrecise: true, ageYears: yearsOld(a.agePeriod) }),
    'Children living near the venue',
    `${u.local.toFixed(1)}% of residents in ${a.areaName} are under 15${versus} (ABS${a.agePeriod ? `, ${a.agePeriod}` : ''}). Say who this Family listing is for in the title. That share is people who live here, not who will come.`)
}

function foodRegs(voice: Voice, f: EventFacts, a: AreaSignals): Insight | null {
  const food = a.food
  if (!food || food.pop <= 0 || food.benchPop <= 0) return null
  const local = (food.businesses / food.pop) * 1000
  const bench = (food.benchBusinesses / food.benchPop) * 1000
  if (!(local > bench * 1.5)) return null
  const visit = f.goal === 'visits' || f.goal === 'both'
  const use = visit
    ? `A crowded food patch: the ad for ${voice.venue} has to say why this room, not just that it serves food.`
    : 'Worth a pre- or post-event feed partner if the night needs one.'
  return cat(['abs_region'], 'derived', confidenceFor({ hasData: true, geoPrecise: true, ageYears: yearsOld(food.period), proxy: true }),
    'Lots of places to eat and drink nearby',
    `${a.areaName} has about ${local.toFixed(1)} registered accommodation and food businesses per 1,000 residents, versus ${bench.toFixed(1)} across ${a.benchLabel}. ${use} Registrations are not foot traffic.`)
}

function transport(voice: Voice, a: AreaSignals): Insight | null {
  const st = a.station
  if (st) {
    const dist = st.distanceKm < 1 ? `${Math.round(st.distanceKm * 1000)} m` : `${st.distanceKm.toFixed(1)} km`
    const yoy = st.yoyPct != null ? ` (${st.yoyPct >= 0 ? '+' : ''}${st.yoyPct.toFixed(1)}% on the same month last year)` : ''
    return cat(['tfnsw'], 'observed', confidenceFor({ hasData: true, geoPrecise: true, ageYears: 0 }),
      `${st.name} is ${dist} from ${voice.venue}`,
      `${st.entries.toLocaleString('en-AU')} Opal tap-ons in ${fmtPeriod(st.month)}${yoy}. Put ${st.name} in the ad and at the top of ${voice.listing}. Straight-line distance, not a travel time. Monthly taps are not attendance and not a weekend crowd.`)
  }
  if (a.transportCovered && a.status === 'ok' && !a.stationsWithoutTaps) {
    return cat(['tfnsw'], 'observed', 'medium',
      `No train, metro or light rail within 2 km of ${voice.venue}`,
      `Bus stops are not in this dataset, so do not tell people it is hard to reach until the bus has been checked. Put parking or a rideshare point in ${voice.listing} if that is actually how people arrive.`)
  }
  return null
}

function spending(voice: Voice, f: EventFacts, a: AreaSignals): Insight | null {
  const bits: string[] = []
  const add = (label: string, yoy: number | null) => {
    if (yoy == null) return
    bits.push(`${label} ${yoy >= 0 ? 'up' : 'down'} ${Math.abs(yoy).toFixed(1)}%`)
  }
  const visit = f.goal === 'visits' || f.goal === 'both'
  if (visit) {
    add('hotels, cafes and restaurants', a.hospitalityYoy)
    add('alcoholic beverages and tobacco', a.alcoholYoy)
    add('recreation and culture', a.recreationYoy)
  } else {
    add('recreation and culture', a.recreationYoy)
    add('hotels, cafes and restaurants', a.hospitalityYoy)
  }
  if (!bits.length || !a.spendMonth) return null
  const action = visit
    ? `Read it as the statewide backdrop for filling ${voice.venue}, not as covers on the night.`
    : `Read it as the statewide backdrop for ticket ads, not as sales at ${voice.venue}.`
  return cat(['abs_hsi'], 'observed', confidenceFor({ hasData: true, geoPrecise: false, ageYears: 0 }),
    `${a.spendLabel} spending, for this ${f.category} listing`,
    `In ${fmtPeriod(a.spendMonth)}, ${a.spendLabel} household spending was ${bits.join(', ')} on a year earlier (current prices, not adjusted for inflation). ${action}`)
}

function visitorInsight(voice: Voice, f: EventFacts, a: AreaSignals): Insight | null {
  if (!a.visitor) return null
  const copy = visitorCopy(a.visitor, f.dowName, voice.venue)
  return cat(['tra'], 'observed', confidenceFor({ hasData: true, geoPrecise: false, ageYears: 1 }), copy.title, copy.detail)
}

function weekendInsight(voice: Voice, f: EventFacts, a: AreaSignals): Insight | null {
  if (!a.weekend) return null
  const copy = weekendCopy(a.weekend, f.dowName, f.dow, voice.venue)
  return cat(['footfall'], 'derived', confidenceFor({ hasData: true, geoPrecise: false, ageYears: 1 }), copy.title, copy.detail)
}

function tourismInsight(voice: Voice, f: EventFacts, a: AreaSignals): Insight | null {
  if (a.visitor) return null
  const t = a.tourism
  if (!t) return null
  if (t.yoyPct == null) {
    return cat(['dnsw'], 'observed', confidenceFor({ hasData: true, geoPrecise: false, ageYears: 1 }),
      'International visitors, no earlier year stored',
      `${(t.intlVisitors / 1e6).toFixed(2)} million international visitors in the ${fmtPeriod(t.period)} (${t.title}). No earlier year is stored, so this is not a rise or a fall. For this ${f.dowName} ${f.category} in ${f.city}, a map-ready listing is the practical move if visitors are part of the plan. Region-wide survey estimate, not ${voice.venue}.`)
  }
  const dir = t.yoyPct >= 0 ? 'up' : 'down'
  return cat(['dnsw'], 'observed', confidenceFor({ hasData: true, geoPrecise: false, ageYears: 1 }),
    `International visitors ${dir} ${Math.abs(t.yoyPct).toFixed(1)}%`,
    `${(t.intlVisitors / 1e6).toFixed(2)} million international visitors in the ${fmtPeriod(t.period)} (${t.title}). For this ${f.dowName} ${f.category} in ${f.city}, a map-ready listing is the practical move if visitors are part of the plan. Region-wide survey estimate, not ${voice.venue}.`)
}

function seifaInsight(f: EventFacts, a: AreaSignals): Insight | null {
  if (!a.seifa) return null
  const band = f.bandLabel ? ` This listing sits in the ${f.bandLabel} band.` : ''
  const other = a.seifa.advantageDecile != null && a.seifa.advantageDecile !== a.seifa.decile
    ? ` Advantage and disadvantage (IRSAD) is state decile ${a.seifa.advantageDecile} for the same area. The indexes measure different things, so those two numbers are not a disagreement.`
    : ''
  return cat(['abs_seifa'], 'hypothesis', confidenceFor({ hasData: true, geoPrecise: true, ageYears: 5, proxy: true }),
    `Economic resources (IER): state decile ${a.seifa.decile} of 10`,
    `${a.seifa.area} is state decile ${a.seifa.decile} of 10 on economic resources (IER, SEIFA 2021). 10 means the most resources. That is not a rank of the people who will turn up.${other}${band}`)
}

type Ch = InsightLink

const STAR: Ch = {
  name: 'Star Observer',
  url: 'https://www.starobserver.com.au/',
  note: 'LGBTIQA+ masthead based in Sydney, read nationally. A publisher to pitch the date to, not a ticket outlet, and not a measured audience.',
}
const DNA: Ch = {
  name: 'DNA Magazine',
  url: 'https://www.dnamagazine.com.au/',
  note: 'National gay men’s title, in print and online. A fit when the room actually skews that way.',
}
const FROOTY: Ch = {
  name: 'FROOTY',
  url: 'https://frooty.com.au/',
  note: 'LGBTQ+ pages distributed with Scenestr street press, so they sit next to gig guides. Useful for music, nightlife and arts.',
}
const MARDI: Ch = {
  name: 'Sydney Gay and Lesbian Mardi Gras',
  url: 'https://www.mardigras.org.au/',
  note: 'Summer into early autumn is when Sydney looks for queer events. The festival program and community channels, separate from the parade itself.',
}
const OXFORD: Ch = {
  name: 'Oxford Street and Stonewall Hotel',
  url: 'https://www.stonewallhotel.com/',
  note: 'Oxford Street, Darlinghurst, is still where a lot of Sydney’s queer nights sit. Stonewall Hotel is one long-running room on it — ask what they are programming, and name the street in the ad.',
}

function cityChannels(city: string): Ch[] {
  switch (city) {
    case 'Sydney':
      return [STAR, MARDI, OXFORD]
    case 'Newcastle':
      return [STAR, { ...MARDI, note: 'Newcastle has no separate queer masthead in this list. Mardi Gras season and Star Observer are the NSW channels that already cover this audience.' }]
    case 'Melbourne':
      return [
        { name: 'JOY 94.9', url: 'https://joy.org.au/', note: 'Melbourne’s LGBTIQA+ community radio station. Spots and community announcements, not a national network buy.' },
        { name: 'Midsumma Festival', url: 'https://www.midsumma.org.au/', note: 'Melbourne’s queer festival, January and February. They sell the printed festival guide — a real booking, not a vibe.' },
        STAR,
      ]
    case 'Brisbane':
    case 'Gold Coast':
      return [
        { name: 'QNews', url: 'https://qnews.com.au/', note: city === 'Gold Coast' ? 'Queensland’s LGBTIQA+ masthead. The Gold Coast does not have a separate outlet in this list.' : 'Brisbane’s long-running LGBTIQA+ masthead, read across Queensland.' },
        { name: 'Brisbane Pride Festival', url: 'https://www.brisbanepride.org.au/', note: 'Fair Day, the march and the Queens Ball. The Queensland festival to be in, or next to, when the season is on.' },
        STAR,
      ]
    case 'Perth':
      return [
        { name: 'OUTinPerth', url: 'https://www.outinperth.com/', note: 'Western Australia’s LGBTIQA+ publication. The local masthead before a national one.' },
        { name: 'Pride WA', url: 'https://pridewa.com.au/', note: 'Perth’s Pride festival organisation. Program and community channels around PrideFEST.' },
        STAR,
      ]
    case 'Adelaide':
      return [
        { name: 'Feast Festival', url: 'https://feast.org.au/', note: 'Adelaide’s LGBTQIA+ arts festival, held in November. The local program to be listed in, or advertised beside.' },
        DNA,
        STAR,
      ]
    case 'Canberra':
      return [
        { name: 'FUSE Magazine', url: 'https://fusemagazine.com.au/', note: 'Canberra and inner-Sydney LGBTIQA+ magazine, and SpringOUT’s media partner. Print and their site.' },
        { name: 'SpringOUT', url: 'https://springout.com.au/', note: 'Canberra’s Pride festival, running through late spring. The program guide is the local listing that matters.' },
        STAR,
      ]
    case 'Hobart':
      return [
        { name: 'TasPride', url: 'https://www.taspride.com/', note: 'Tasmania’s Pride festival. The program and parade are the island-wide channels; there is no separate Hobart masthead in this list.' },
        STAR,
        DNA,
      ]
    case 'Darwin':
      return [
        { name: 'Top End Pride', url: 'https://topendpride.com.au/', note: 'Runs Darwin Pride Festival. The Territory program to be part of, or to advertise beside, in the festival window.' },
        STAR,
        DNA,
      ]
    default:
      return [STAR, DNA]
  }
}

/** Real publishers, radio and festivals. No rate cards and no audience sizes — we have not imported those. */
export function queerPromoLinks(city: string, category: string): InsightLink[] {
  const outza: Ch = {
    name: `VibePeep LGBTIQ+ events in ${city}`,
    url: `/${citySlug(city)}/lgbtiq`,
    note: 'The filter people use when they already want a queer night in this city. The listing is the ad. Everything else is another room for the same date.',
  }
  const extra = ['Music', 'Nightlife', 'Arts & Culture'].includes(category) ? [FROOTY] : []
  const seen = new Set<string>()
  const links: Ch[] = []
  for (const link of [outza, ...cityChannels(city), ...extra]) {
    if (seen.has(link.url)) continue
    seen.add(link.url)
    links.push(link)
  }
  return links.slice(0, 5)
}

function queerInsight(f: EventFacts): Insight | null {
  if (!f.queer) return null
  return cat(
    ['outza_catalogue'], 'hypothesis', 'medium',
    'Put it where the queer crowd is already looking',
    'VibePeep is the best place to advertise this. Not as a slogan: the LGBTIQ+ filter is where people go when they already want a queer night. Start there, then take the same date to the mastheads, radio and festivals below. No audience size is shown, because we have not measured one.',
    { highlight: true, links: queerPromoLinks(f.city, f.category) },
  )
}

const outdoor = (f: EventFacts) =>
  f.category === 'Sports' || f.category === 'Family' || f.subTags.some((t) => /market|festival|parade|fair|outdoor/i.test(t))

function gapsFor(_voice: Voice, f: EventFacts, a: AreaSignals): Gap[] {
  const gaps: Gap[] = []
  const pinned = a.status === 'ok' || a.status === 'no_data'
  if (pinned && !a.areaLoaded) {
    gaps.push({
      title: 'Resident profile needs an import',
      detail: 'ABS Data by Region figures for this venue area are not in the database, so there is no age mix, income or business count yet. No estimate is filled in.',
    })
  }
  if ((f.dow === 0 || f.dow === 5 || f.dow === 6) && !a.weekend) {
    gaps.push({
      title: footfallSeriesReady(a.marketId) ? 'Weekend footfall needs an import' : 'No day-of-week footfall for this city',
      detail: footfallMissingDetail(a.marketId),
    })
  }
  if (outdoor(f)) {
    gaps.push({
      title: 'Weather seasonality needs an import',
      detail: `Bureau of Meteorology climate averages are not imported, so this report does not say whether ${f.dowName}s around this date are usually wet or hot. Check the Bureau before an outdoor ${f.category} plan. No temperature is estimated here.`,
    })
  }
  if (!a.visitor && f.stateCode === '1' && !a.tourism) {
    gaps.push({
      title: 'Tourism figures need an import',
      detail: `Destination NSW visitor totals are not in the database yet, so this report does not show a tourism peak for ${f.city}.`,
    })
  } else if (!a.visitor && f.stateCode && f.stateCode !== '1') {
    gaps.push({
      title: 'Tourism peaks for this state need an import',
      detail: `Destination NSW is the only visitor survey imported, and it covers Sydney and New South Wales. Nothing from Tourism Research Australia is loaded for ${f.stateName}, so there is no tourism peak for ${f.city} here.`,
    })
  }
  return gaps
}

export function composeInsights(voice: Voice, facts: EventFacts, area: AreaSignals, catalogue: CatalogueSnapshot): { insights: Insight[]; gaps: Gap[] } {
  const insights = [
    lead(voice, facts),
    queerInsight(facts),
    sameNight(voice, facts, catalogue),
    weekdayDemand(facts, catalogue),
    priceComps(voice, facts, catalogue),
    goingOut(facts, catalogue),
    ageInsight(facts, area),
    overseasInsight(facts, area),
    familyInsight(facts, area),
    foodRegs(voice, facts, area),
    transport(voice, area),
    spending(voice, facts, area),
    visitorInsight(voice, facts, area),
    weekendInsight(voice, facts, area),
    tourismInsight(voice, facts, area),
    seifaInsight(facts, area),
  ].filter((x): x is Insight => !!x)
  return { insights, gaps: gapsFor(voice, facts, area) }
}

/** Joined copy, for tests that ingested listings never say "your venue". */
export function insightText(insights: Insight[], gaps: Gap[]): string {
  return [
    ...insights.flatMap((i) => [i.title, i.detail, ...(i.links ?? []).flatMap((l) => [l.name, l.note])]),
    ...gaps.flatMap((g) => [g.title, g.detail]),
  ].join('\n')
}
