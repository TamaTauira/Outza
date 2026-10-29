// VibePeep Intelligence: one event's reach report. Official imports plus counts of VibePeep listings. Nothing is estimated or invented.
import { prisma } from '@/lib/prisma'
import { correctPin, pinIsCityDump, placeFromText, resolveListingPlace } from '@/lib/venue-place'
import { resolveVenueGeo } from './geo'
import { readObs } from './store'
import { CITIES } from '@/lib/cities'
import { checkLGBTI } from '@/lib/categories'
import { isPaidListing, parsePriceRange } from '@/lib/quality'
import { AGE_MEASURES, HSI_CATEGORIES, INTEL_SOURCES, REGION_MEASURES, type SourceKey } from './sources'
import { loadSeifaIndexes, seifaCandidates } from './seifa'
import { haversineKm, normStation, pctChange } from './util'
import { intelOwnerVoice, voiceFor, type Voice } from './voice'
import {
  CATALOGUE_RADIUS_DAYS, DOW, addUtcDays, buildCatalogueSnapshot, composeInsights, listedPrice, priceBand, reachGoal, shareSum, utcMidnight,
  type AreaSignals, type CatalogueSnapshot, type EventFacts, type Gap, type Insight, type PriceBandId,
} from './reach'

export type { Gap, Insight, Voice }
export type Confidence = 'high' | 'medium' | 'low' | 'insufficient'
export { fmtPeriod } from './reach'
export type AreaStat = { code: string; label: string; unit: string; decimals: number; meaning: string; limitation?: string; census: boolean; venue: number | null; venuePeriod: string | null; council: number | null; bench: number | null; benchPeriod: string | null }
export type AgeBand = { band: string; venue: number; bench: number | null }
export type Station = { name: string; modes: string; distanceKm: number; month: string | null; entries: number | null; exits: number | null; yoyPct: number | null; accessible: boolean }
export type SpendRow = { category: string; label: string; month: string; valueM: number | null; yoyPct: number | null; momPct: number | null }
export type SourceStatus = { key: SourceKey; name: string; status: string; lastSuccessAt: string | null; latestPeriod: string | null; attribution: string; licence: string; limitations: string; url: string }

export type VenueIntel = {
  event: { id: string; title: string; venueName: string; suburb: string | null; city: string; date: string; category: string; dateLabel: string; queer: boolean }
  voice: Voice
  gaps: Gap[]
  status: 'ok' | 'no_location' | 'outside_au' | 'no_data'
  benchLabel: string
  spendLabel: string
  stateName: string
  transportCovered: boolean
  tourismTitle: string | null
  message?: string
  geo?: { sa2Name: string | null; sa3Name: string | null; lgaName: string | null; salName: string | null; poa: string | null }
  area: AreaStat[]
  ages: AgeBand[]
  agePeriod: string | null
  seifa: { index: string; label: string; meaning: string; nswDecile: number | null; ausDecile: number | null; area: string }[]
  stations: Station[]
  spending: SpendRow[]
  tourism: { period: string | null; visitors: number | null; nights: number | null; spend: number | null; intlVisitors: number | null; intlYoyPct: number | null; intlPrevPeriod: string | null }
  insights: Insight[]
  sources: SourceStatus[]
  generatedAt: string
}

const CORE = ['ERP_P_20', 'ERP_21', 'ERP_23', 'ERP_17', 'EQUIV_2', 'INCOME_2', 'LF_4', 'RENT_4', 'CENSUS_13', 'SCHOOL_5', 'HHTYPE_6', 'CABEE_17', 'CABEE_20']
const GROUPS: [string, number, number][] = [['15–24', 15, 24], ['25–34', 25, 34], ['35–44', 35, 44], ['45–54', 45, 54], ['55–64', 55, 64], ['65+', 65, 200]]
const SPEND_CATS = ['TOT', '3', '50', '60', '15']
const STE_NAME: Record<string, string> = { '1': 'New South Wales', '2': 'Victoria', '3': 'Queensland', '4': 'South Australia', '5': 'Western Australia', '6': 'Tasmania', '7': 'Northern Territory', '8': 'Australian Capital Territory' }
const STE_OF: Record<string, string> = { NSW: '1', VIC: '2', QLD: '3', SA: '4', WA: '5', TAS: '6', NT: '7', ACT: '8' }
const stateCodeForCity = (city: string) => STE_OF[CITIES.find((c) => c.name === city)?.state ?? ''] ?? null
const inAustralia = (lat: number, lng: number) => lat < -9 && lat > -45 && lng > 112 && lng < 155
const latest = <T extends { period: string }>(rows: T[]) => rows.reduce<T | null>((m, r) => (!m || r.period > m.period ? r : m), null)
const GOING_OUT = ['Food & Drink', 'Nightlife']
const scaled = (v: number | null, mult: number) => (v == null ? null : v * 10 ** mult)

async function sourceStatuses(): Promise<SourceStatus[]> {
  const rows = await prisma.intelSource.findMany()
  const by = new Map(rows.map((r) => [r.key, r]))
  return (Object.keys(INTEL_SOURCES) as SourceKey[]).map((k) => {
    const d = INTEL_SOURCES[k], r = by.get(k)
    return { key: k, name: d.name, status: r?.status ?? 'never_run', lastSuccessAt: r?.lastSuccessAt?.toISOString() ?? null, latestPeriod: r?.latestPeriod ?? null, attribution: d.attribution, licence: d.licence, limitations: d.limitations, url: d.url }
  })
}

async function spending(stateCode: string): Promise<SpendRow[]> {
  const geoType = stateCode === 'AUS' ? 'AUS' : 'STE'
  const rows = await readObs('abs_hsi', 'monthly', { geoType, geoCode: stateCode, adjustment: 'ORIG', category: { in: SPEND_CATS } })
  const sa = await readObs('abs_hsi', 'monthly', { geoType, geoCode: stateCode, adjustment: 'SA', category: { in: SPEND_CATS }, measure: '8' })
  return SPEND_CATS.map((c) => {
    const val = latest(rows.filter((r) => r.category === c && r.measure === '7' && r.value != null))
    const yoy = val ? rows.find((r) => r.category === c && r.measure === '9' && r.period === val.period) : undefined
    const mom = val ? sa.find((r) => r.category === c && r.period === val.period) : undefined
    return val ? { category: c, label: HSI_CATEGORIES[c] ?? c, month: val.period, valueM: scaled(val.value, val.unitMult - 6), yoyPct: yoy?.value ?? null, momPct: mom?.value ?? null } : null
  }).filter((x): x is SpendRow => !!x)
}

async function tourism(code: 'SYD' | 'NSW'): Promise<VenueIntel['tourism']> {
  const h = await readObs('dnsw', 'headline', { geoCode: code })
  const s = code === 'SYD' ? await readObs('dnsw', 'syd_intl_series', { measure: 'INTL_VISITORS' }) : []
  const get = (m: string) => latest(h.filter((r) => r.measure === m))?.value ?? null
  const sorted = [...s].sort((a, b) => a.period.localeCompare(b.period))
  const last = sorted.at(-1), prev = sorted.at(-2)
  return {
    period: latest(h)?.period ?? null, visitors: get('VISITORS'), nights: get('NIGHTS'), spend: get('SPEND'), intlVisitors: get('INTL_VISITORS'),
    intlYoyPct: last && prev ? pctChange(last.value, prev.value) : null, intlPrevPeriod: prev?.period ?? null,
  }
}

async function stationsNear(lat: number, lng: number): Promise<Station[]> {
  const box = 0.03
  const stops = await prisma.intelTransportStop.findMany({ where: { lat: { gte: lat - box, lte: lat + box }, lng: { gte: lng - box, lte: lng + box } } })
  const near = stops.map((s) => ({ s, d: haversineKm({ lat, lng }, s) })).filter((x) => x.d <= 2).sort((a, b) => a.d - b.d).slice(0, 4)
  if (!near.length) return []
  const usage = await readObs('tfnsw', 'station_usage', { geoType: 'STATION', geoCode: { in: near.map((x) => normStation(x.s.name)) } })
  return near.map(({ s, d }) => {
    const mine = usage.filter((u) => u.geoCode === normStation(s.name))
    const month = latest(mine)?.period ?? null
    const sum = (m: string, p: string | null) => { const r = mine.filter((u) => u.measure === m && u.period === p && u.value != null); return r.length ? r.reduce((t, u) => t + (u.value ?? 0), 0) : null }
    const lastYear = month ? `${Number(month.slice(0, 4)) - 1}${month.slice(4)}` : null
    const now = sum('ENTRIES', month), then = sum('ENTRIES', lastYear)
    return { name: s.name, modes: s.modes, distanceKm: Math.round(d * 100) / 100, month, entries: now, exits: sum('EXITS', month), yoyPct: pctChange(now, then), accessible: /accessible|lift|ramp/i.test(s.accessibility ?? '') && !/not accessible/i.test(s.accessibility ?? '') }
  })
}

type ListedEvent = {
  id: string; title: string; venueName: string; suburb: string | null; city: string; date: Date
  source: string; category: string; subTags: string[]; isLGBTI: boolean; isFree: boolean
  price: string | null; priceMin: number | null; priceMax: number | null; description: string | null
}

function pricingOf(ev: ListedEvent) {
  const paid = isPaidListing({ price: ev.price, priceMin: ev.priceMin })
  const parsed = ev.priceMin != null ? { min: ev.priceMin, max: ev.priceMax ?? ev.priceMin } : parsePriceRange(ev.isFree, ev.price)
  const isFreeListing = !paid && (ev.isFree || parsed.min === 0)
  const band = priceBand(isFreeListing, isFreeListing ? 0 : (parsed.min ?? null))
  return { paid, parsed, isFreeListing, band, priceLabel: listedPrice(isFreeListing, parsed.min, parsed.max, ev.price) }
}

function paidPriceFilter(id: PriceBandId) {
  switch (id) {
    case 'under30': return { gt: 0, lt: 30 }
    case '30-79': return { gte: 30, lt: 80 }
    case '80-149': return { gte: 80, lt: 150 }
    case '150+': return { gte: 150 }
    default: return null
  }
}

/** Counts of other VibePeep listings. Exact counts, not a sample treated as a total. Titles are a short sample of those counts. */
async function loadCatalogue(ev: ListedEvent, band: ReturnType<typeof priceBand>): Promise<CatalogueSnapshot> {
  const day = utcMidnight(ev.date)
  const start = addUtcDays(day, -CATALOGUE_RADIUS_DAYS)
  const end = addUtcDays(day, CATALOGUE_RADIUS_DAYS + 1)
  const alive = { city: ev.city, duplicateOfId: null, id: { not: ev.id } }
  const inWindow = { ...alive, date: { gte: start, lt: end } }
  const night = { ...alive, date: { gte: day, lt: addUtcDays(day, 1) } }
  const suburb = ev.suburb?.trim() ? { suburb: { equals: ev.suburb.trim(), mode: 'insensitive' as const } } : null
  const paidFilter = band && band.id !== 'free' ? paidPriceFilter(band.id) : null
  const freeWhere = { AND: [{ OR: [{ isFree: true }, { priceMin: { lte: 0 } }] }, { NOT: { priceMin: { gt: 0 } } }] }
  const [grouped, nightTotal, nightCategory, nightSuburb, goingCity, goingSuburb, sameCatTitles, otherTitles, priced, freeCount] = await Promise.all([
    prisma.event.groupBy({ by: ['date'], where: { ...inWindow, category: ev.category }, _count: { _all: true } }),
    prisma.event.count({ where: night }),
    prisma.event.count({ where: { ...night, category: ev.category } }),
    suburb ? prisma.event.count({ where: { ...night, ...suburb } }) : Promise.resolve(null),
    prisma.event.count({ where: { ...inWindow, category: { in: GOING_OUT } } }),
    suburb ? prisma.event.count({ where: { ...inWindow, category: { in: GOING_OUT }, ...suburb } }) : Promise.resolve(null),
    prisma.event.findMany({ where: { ...night, category: ev.category }, select: { title: true, venueName: true, category: true }, orderBy: { title: 'asc' }, take: 12 }),
    prisma.event.findMany({ where: { ...night, NOT: { category: ev.category } }, select: { title: true, venueName: true, category: true }, orderBy: { title: 'asc' }, take: 6 }),
    paidFilter ? prisma.event.aggregate({ where: { ...inWindow, category: ev.category, priceMin: paidFilter }, _min: { priceMin: true }, _max: { priceMin: true }, _count: { _all: true } }) : Promise.resolve(null),
    band?.id === 'free' ? prisma.event.count({ where: { ...inWindow, category: ev.category, ...freeWhere } }) : Promise.resolve(null),
  ])
  const comps = band?.id === 'free' ? freeCount : priced ? priced._count._all : null
  return buildCatalogueSnapshot({
    eventDate: day.toISOString().slice(0, 10),
    windowStart: start.toISOString().slice(0, 10),
    windowEnd: addUtcDays(day, CATALOGUE_RADIUS_DAYS).toISOString().slice(0, 10),
    category: ev.category,
    suburb: ev.suburb,
    venueName: ev.venueName,
    bandLabel: band?.label ?? null,
    countsByDay: grouped.map((g) => ({ day: g.date.toISOString().slice(0, 10), n: g._count._all })),
    nightTitles: [...sameCatTitles, ...otherTitles],
    sameNightTotal: nightTotal,
    sameNightCategory: nightCategory,
    sameNightSuburb: nightSuburb,
    goingOutSuburb: goingSuburb,
    goingOutCity: goingCity,
    comps,
    compsMin: priced?._min.priceMin ?? null,
    compsMax: priced?._max.priceMin ?? null,
  })
}

function advise(base: VenueIntel, ev: ListedEvent, catalogue: CatalogueSnapshot, under15: AreaSignals['under15'], stateCode: string | null, price: ReturnType<typeof pricingOf>): VenueIntel {
  const voice = voiceFor(intelOwnerVoice(ev.source), ev.venueName)
  const queer = ev.isLGBTI || checkLGBTI(ev.title, `${ev.description ?? ''} ${(ev.subTags ?? []).join(' ')}`)
  const day = utcMidnight(ev.date)
  const facts: EventFacts = {
    venueName: ev.venueName, suburb: ev.suburb, city: ev.city, category: ev.category, subTags: ev.subTags ?? [],
    dateLabel: ev.date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
    dowName: DOW[day.getUTCDay()],
    dow: day.getUTCDay(), goal: reachGoal(ev.category, price.paid), queer,
    priceLabel: price.priceLabel, bandLabel: price.band?.label ?? null, stateCode, stateName: base.stateName,
  }
  const born = base.area.find((a) => a.code === 'CENSUS_13')
  const food = base.area.find((a) => a.code === 'CABEE_17')
  const pop = base.area.find((a) => a.code === 'ERP_P_20')
  const st = base.stations.find((s) => s.entries != null) ?? null
  const rec = base.spending.find((s) => s.category === '50')
  const hosp = base.spending.find((s) => s.category === '60')
  const alc = base.spending.find((s) => s.category === '15')
  const ier = base.seifa.find((s) => s.index === 'IER' && s.nswDecile != null)
  const signals: AreaSignals = {
    status: base.status, areaName: base.geo?.sa2Name ?? 'the venue area', benchLabel: base.benchLabel, stateName: base.stateName, spendLabel: base.spendLabel,
    transportCovered: base.transportCovered, ages: base.ages, agePeriod: base.agePeriod, under15,
    bornOverseas: born?.venue != null ? { local: born.venue, bench: born.bench, period: born.venuePeriod ?? born.benchPeriod } : null,
    food: food?.venue != null && food.bench != null && pop?.venue && pop.bench ? { businesses: food.venue, benchBusinesses: food.bench, pop: pop.venue, benchPop: pop.bench, period: food.venuePeriod } : null,
    station: st ? { name: st.name, distanceKm: st.distanceKm, entries: st.entries!, month: st.month, yoyPct: st.yoyPct } : null,
    stationsWithoutTaps: base.stations.length > 0 && !st,
    recreationYoy: rec?.yoyPct ?? null, hospitalityYoy: hosp?.yoyPct ?? null, alcoholYoy: alc?.yoyPct ?? null,
    spendMonth: (rec ?? hosp ?? alc)?.month ?? null,
    tourism: base.tourismTitle && base.tourism.intlYoyPct != null && base.tourism.intlVisitors != null
      ? { title: base.tourismTitle, period: base.tourism.period, intlVisitors: base.tourism.intlVisitors, yoyPct: base.tourism.intlYoyPct } : null,
    seifa: ier?.nswDecile != null ? {
      area: ier.area,
      decile: ier.nswDecile,
      advantageDecile: base.seifa.find((s) => s.index === 'IRSAD' && s.nswDecile != null)?.nswDecile ?? null,
    } : null,
    areaLoaded: base.area.some((a) => a.venue != null) || base.ages.length > 0,
  }
  if (base.status === 'no_location') {
    base.message = voice.owned
      ? 'We could not pin your venue on the map yet. Add a full street address and the local area report will appear.'
      : 'This venue is not pinned on the map yet, so there is no suburb-level area report. The reach notes use the city on the listing.'
  }
  const built = composeInsights(voice, facts, signals, catalogue)
  base.voice = voice
  base.gaps = built.gaps
  base.insights = built.insights
  base.event = { ...base.event, category: ev.category, dateLabel: facts.dateLabel, queer }
  return base
}

export async function getVenueIntel(eventId: string): Promise<VenueIntel> {
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true, title: true, venueName: true, venueAddress: true, suburb: true, city: true, date: true, latitude: true, longitude: true,
      source: true, category: true, subTags: true, isLGBTI: true, isFree: true, price: true, priceMin: true, priceMax: true, description: true,
    },
  })
  if (!ev) throw new Error('Event not found')
  const cityState = stateCodeForCity(ev.city)
  const price = pricingOf(ev)
  const cataloguePromise = loadCatalogue(ev, price.band)
  const voice = voiceFor(intelOwnerVoice(ev.source), ev.venueName)
  const base: VenueIntel = {
    event: { id: ev.id, title: ev.title, venueName: ev.venueName, suburb: ev.suburb, city: ev.city, date: ev.date.toISOString(), category: ev.category, dateLabel: '', queer: ev.isLGBTI },
    voice, gaps: [],
    status: 'ok', area: [], ages: [], agePeriod: null, seifa: [], stations: [], spending: [], insights: [],
    tourism: { period: null, visitors: null, nights: null, spend: null, intlVisitors: null, intlYoyPct: null, intlPrevPeriod: null },
    tourismTitle: null,
    benchLabel: 'the wider region',
    spendLabel: cityState ? STE_NAME[cityState] : 'Australia',
    stateName: cityState ? STE_NAME[cityState] : 'Australia',
    transportCovered: cityState === '1',
    sources: [], generatedAt: new Date().toISOString(),
  }
  const regional = Promise.all([
    sourceStatuses(),
    spending(cityState ?? 'AUS'),
    cityState === '1' ? tourism(ev.city === 'Sydney' ? 'SYD' : 'NSW') : Promise.resolve(null),
  ])
  const hinted = placeFromText({ venueAddress: ev.venueAddress, venueName: ev.venueName, suburb: ev.suburb, city: ev.city })
  let lat = ev.latitude, lng = ev.longitude
  const dump = pinIsCityDump(lat, lng, ev.city, hinted.suburb ?? ev.suburb, hinted.postcode)
  if (lat == null || lng == null || dump) {
    const placed = hinted.lat != null ? hinted : await resolveListingPlace({ venueAddress: ev.venueAddress, venueName: ev.venueName, suburb: ev.suburb, city: ev.city })
    const next = correctPin(dump ? null : lat, dump ? null : lng, placed, ev.city)
    if (next.lat != null && next.lng != null && inAustralia(next.lat, next.lng)) {
      lat = next.lat
      lng = next.lng
      const suburb = placed.suburb && placed.suburb.toLowerCase() !== ev.city.toLowerCase() ? placed.suburb : ev.suburb
      await prisma.event.update({ where: { id: ev.id }, data: { latitude: lat, longitude: lng, ...(suburb && suburb !== ev.suburb ? { suburb } : {}) } }).catch(() => {})
      if (suburb) ev.suburb = suburb
    } else if (dump) {
      lat = null
      lng = null
    }
  }
  const [sources, spendRows, tourRows] = await regional
  base.sources = sources
  base.spending = spendRows
  if (tourRows) {
    base.tourism = tourRows
    base.tourismTitle = ev.city === 'Sydney' ? 'Visitors to Sydney' : 'Visitors to New South Wales'
  }
  let under15: AreaSignals['under15'] = null
  let stateCode = cityState
  if (lat == null || lng == null) base.status = 'no_location'
  else if (!inAustralia(lat, lng)) {
    base.status = 'outside_au'
    base.message = 'This venue sits outside Australia, so local area statistics are not available.'
  } else {

  const g = await resolveVenueGeo(lat!, lng!)
  base.geo = { sa2Name: g.sa2Name, sa3Name: g.sa3Name, lgaName: g.lgaName, salName: g.salName, poa: g.poa }
  const ste = g.state && STE_NAME[g.state] ? g.state : cityState
  if (ste) stateCode = ste
  if (ste && STE_NAME[ste]) {
    base.stateName = STE_NAME[ste]
    base.spendLabel = STE_NAME[ste]
    base.transportCovered = ste === '1'
    if (ste !== '1') {
      base.tourism = { period: null, visitors: null, nights: null, spend: null, intlVisitors: null, intlYoyPct: null, intlPrevPeriod: null }
      base.tourismTitle = null
    }
  }
  base.benchLabel = g.gccsaName || base.stateName

  // Area profile, SEIFA and stations together. State spending is reused when the state did not change.
  const codes = [...CORE, ...AGE_MEASURES.map((a) => a.code)]
  const [sa2, gsyd, lga, seifaRows, stationRows, spendNext] = await Promise.all([
    g.sa2 ? readObs('abs_region', 'asgs', { geoType: 'SA2', geoCode: g.sa2, measure: { in: codes } }) : [],
    g.gccsa ? readObs('abs_region', 'asgs', { geoType: 'GCCSA', geoCode: g.gccsa, measure: { in: codes } }) : [],
    g.lga ? readObs('abs_region', 'lga', { geoType: 'LGA', geoCode: g.lga, measure: { in: CORE } }) : [],
    loadSeifaIndexes(seifaCandidates(g), (area) => readObs('abs_seifa', area.ds, { geoType: area.geo, geoCode: area.code })),
    base.transportCovered ? stationsNear(lat!, lng!) : Promise.resolve([]),
    ste && ste !== (cityState ?? 'AUS') ? spending(ste) : Promise.resolve(null),
  ])
  if (spendNext) base.spending = spendNext
  base.seifa = seifaRows
  base.stations = stationRows
  const pick = (rows: typeof sa2, m: string) => latest(rows.filter((r) => r.measure === m && r.value != null))
  base.area = CORE.map((m) => {
    const d = REGION_MEASURES[m], v = pick(sa2, m), b = pick(gsyd, m), c = pick(lga, m)
    return { code: m, label: d.label, unit: d.unit, decimals: d.decimals ?? 0, meaning: d.meaning, limitation: d.limitation, census: !!d.census, venue: v?.value ?? null, venuePeriod: v?.period ?? null, council: c?.value ?? null, bench: b?.value ?? null, benchPeriod: b?.period ?? null }
  }).filter((a) => a.venue != null || a.bench != null)

  const ageRows = sa2.filter((r) => AGE_MEASURES.some((a) => a.code === r.measure) && r.value != null)
  base.agePeriod = latest(ageRows)?.period ?? null
  if (base.agePeriod) {
    const lower = (band: string) => Number(band.replace('+', '').split('-')[0])
    const childCodes = AGE_MEASURES.filter((a) => lower(a.band) < 15).map((a) => a.code)
    const at = (rows: typeof sa2, code: string) => rows.find((x) => x.measure === code && x.period === base.agePeriod && x.value != null)?.value ?? null
    const localKids = shareSum(childCodes.map((c) => at(sa2, c)))
    if (localKids != null) under15 = { local: localKids, bench: shareSum(childCodes.map((c) => at(gsyd, c))) }
    base.ages = GROUPS.map(([label, lo, hi]) => {
      const ms = AGE_MEASURES.filter((a) => lower(a.band) >= lo && lower(a.band) <= hi).map((a) => a.code)
      const s = (rows: typeof sa2) => { const r = rows.filter((x) => ms.includes(x.measure) && x.period === base.agePeriod && x.value != null); return r.length ? r.reduce((t, x) => t + (x.value ?? 0), 0) : null }
      const v = s(sa2)
      return v == null ? null : { band: label, venue: v, bench: s(gsyd) }
    }).filter((x): x is AgeBand => !!x)
  }

  if (!base.area.length && !base.stations.length && !base.seifa.length) base.status = 'no_data'
  }
  return advise(base, ev, await cataloguePromise, under15, stateCode, price)
}

/** Cached for 12h per event version. A date, pin or edit change builds a new report. */
export async function getVenueIntelCached(eventId: string) {
  const stamp = await prisma.event.findUnique({ where: { id: eventId }, select: { updatedAt: true, date: true, latitude: true, longitude: true } })
  // au5 drops reports cached when every suburb was pinned on the CBD.
  const key = `venue:au5:${eventId}:${stamp?.updatedAt?.getTime() ?? 0}:${stamp?.date?.toISOString().slice(0, 10) ?? ''}:${stamp?.latitude ?? ''}:${stamp?.longitude ?? ''}`
  const hit = await prisma.intelCache.findUnique({ where: { key } })
  if (hit && Date.now() - hit.createdAt.getTime() < 12 * 3600_000) return hit.data as unknown as VenueIntel
  const data = await getVenueIntel(eventId)
  if (data.status !== 'no_location') await prisma.intelCache.upsert({ where: { key }, create: { key, data: data as never }, update: { data: data as never, createdAt: new Date() } })
  return data
}
