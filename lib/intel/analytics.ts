// OUTZA Intelligence: venue report for one event, built only from imported official data. Nothing is estimated or invented.
import { prisma } from '@/lib/prisma'
import { resolveVenueGeo } from './geo'
import { readObs } from './store'
import { CITIES } from '@/lib/cities'
import { AGE_MEASURES, HSI_CATEGORIES, INTEL_SOURCES, REGION_MEASURES, SEIFA_INDEXES, type DataKind, type SourceKey } from './sources'
import { confidenceFor, haversineKm, normStation, pctChange, ptsDiff } from './util'

export type Confidence = 'high' | 'medium' | 'low' | 'insufficient'
export type AreaStat = { code: string; label: string; unit: string; decimals: number; meaning: string; limitation?: string; census: boolean; venue: number | null; venuePeriod: string | null; council: number | null; bench: number | null; benchPeriod: string | null }
export type AgeBand = { band: string; venue: number; bench: number | null }
export type Station = { name: string; modes: string; distanceKm: number; month: string | null; entries: number | null; exits: number | null; yoyPct: number | null; accessible: boolean }
export type SpendRow = { category: string; label: string; month: string; valueM: number | null; yoyPct: number | null; momPct: number | null }
export type Insight = { title: string; detail: string; kind: DataKind; confidence: Confidence; sources: SourceKey[] }
export type SourceStatus = { key: SourceKey; name: string; status: string; lastSuccessAt: string | null; latestPeriod: string | null; attribution: string; licence: string; limitations: string; url: string }

export type VenueIntel = {
  event: { id: string; title: string; venueName: string; suburb: string | null; city: string; date: string }
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
const yearsOld = (period: string | null) => (period ? new Date().getUTCFullYear() - Number(period.slice(0, 4)) : 99)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-09" → "Sep 2026", "YE-2026-06" → "year ending Jun 2026", "2024" stays. */
export const fmtPeriod = (p?: string | null) => {
  if (!p) return ''
  const m = p.match(/^(YE-)?(\d{4})-(\d{2})$/)
  return m ? `${m[1] ? 'year ending ' : ''}${MON[Number(m[3]) - 1]} ${m[2]}` : p
}
const scaled = (v: number | null, mult: number) => (v == null ? null : v * 10 ** mult)

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://photon.komoot.io/api/?limit=1&lang=en&bbox=112,-44,154,-10&q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'OUTZA Intelligence (venue lookup)' }, signal: AbortSignal.timeout(8000) })
    const feature = res.ok ? (await res.json())?.features?.[0] : null
    if (feature?.properties?.countrycode && feature.properties.countrycode !== 'AU') return null
    const c = feature?.geometry?.coordinates
    return Array.isArray(c) ? { lat: Number(c[1]), lng: Number(c[0]) } : null
  } catch { return null }
}

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

function buildInsights(r: VenueIntel): Insight[] {
  const out: Insight[] = []
  const area = r.geo?.sa2Name ?? 'the venue area'
  // Age skew
  if (r.ages.length) {
    const diffs = r.ages.filter((a) => a.bench != null).map((a) => ({ ...a, d: ptsDiff(a.venue, a.bench) ?? 0 })).sort((a, b) => b.d - a.d)
    const top = diffs[0]
    if (top && top.d >= 2) out.push({ title: `Residents aged ${top.band} are over-represented locally`, detail: `${top.venue.toFixed(1)}% of ${area} residents are aged ${top.band}, versus ${top.bench!.toFixed(1)}% across ${r.benchLabel} (${r.agePeriod}). Worth testing artwork, line-ups and price points that speak to this age group in local promotion.`, kind: 'derived', confidence: confidenceFor({ hasData: true, geoPrecise: true, ageYears: yearsOld(r.agePeriod) }), sources: ['abs_region'] })
  }
  // Hospitality density
  const food = r.area.find((a) => a.code === 'CABEE_17')
  const pop = r.area.find((a) => a.code === 'ERP_P_20')
  if (food?.venue != null && pop?.venue && food.bench != null && r.area.find((a) => a.code === 'ERP_P_20')?.bench) {
    const local = (food.venue / pop.venue) * 1000, bench = (food.bench / pop.bench!) * 1000
    if (local > bench * 1.5) out.push({ title: 'Lots of places to eat and drink nearby', detail: `${area} has about ${local.toFixed(1)} registered accommodation and food businesses per 1,000 residents, versus ${bench.toFixed(1)} across ${r.benchLabel}. That points to a going-out precinct where pre- and post-event food and drink partnerships could work. Registrations are not foot traffic.`, kind: 'derived', confidence: confidenceFor({ hasData: true, geoPrecise: true, ageYears: yearsOld(food.venuePeriod), proxy: true }), sources: ['abs_region'] })
  }
  // Transport
  const st = r.stations.find((s) => s.entries != null)
  if (st) out.push({ title: `${st.name} is ${st.distanceKm < 1 ? `${Math.round(st.distanceKm * 1000)} m` : `${st.distanceKm.toFixed(1)} km`} away`, detail: `It logged ${st.entries!.toLocaleString('en-AU')} Opal tap-ons in ${fmtPeriod(st.month)}${st.yoyPct != null ? ` (${st.yoyPct >= 0 ? '+' : ''}${st.yoyPct.toFixed(1)}% on the same month last year)` : ''}. Put public transport directions up front in your listing. Straight-line distance; taps are not attendance.`, kind: 'observed', confidence: confidenceFor({ hasData: true, geoPrecise: true, ageYears: 0 }), sources: ['tfnsw'] })
  else if (r.transportCovered && r.status === 'ok' && !r.stations.length) out.push({ title: 'No train, metro or light rail within 2 km', detail: 'Bus stops are not in this dataset yet, so check bus routes before you tell people it is hard to reach. Consider parking, rideshare or shuttle info in your listing.', kind: 'observed', confidence: 'medium', sources: ['tfnsw'] })
  // Spending trend
  const rec = r.spending.find((s) => s.category === '50'), hosp = r.spending.find((s) => s.category === '60')
  if (rec?.yoyPct != null || hosp?.yoyPct != null) {
    const parts = [rec?.yoyPct != null ? `recreation and culture ${rec.yoyPct >= 0 ? 'up' : 'down'} ${Math.abs(rec.yoyPct).toFixed(1)}%` : null, hosp?.yoyPct != null ? `hotels, cafes and restaurants ${hosp.yoyPct >= 0 ? 'up' : 'down'} ${Math.abs(hosp.yoyPct).toFixed(1)}%` : null].filter(Boolean)
    out.push({ title: `${r.spendLabel} going-out spending trend`, detail: `In ${fmtPeriod((rec ?? hosp)!.month)}, ${r.spendLabel} household spending was ${parts.join(' and ')} on a year earlier (current prices, not adjusted for inflation). This is statewide, not your venue or ticket sales.`, kind: 'observed', confidence: confidenceFor({ hasData: true, geoPrecise: false, ageYears: 0 }), sources: ['abs_hsi'] })
  }
  // Tourism
  if (r.tourismTitle && r.tourism.intlYoyPct != null && r.tourism.intlVisitors != null) out.push({ title: `International visitors ${r.tourism.intlYoyPct >= 0 ? 'up' : 'down'} ${Math.abs(r.tourism.intlYoyPct).toFixed(1)}%`, detail: `${(r.tourism.intlVisitors / 1e6).toFixed(2)} million international visitors in the ${fmtPeriod(r.tourism.period)} (${r.tourismTitle}). If your event suits visitors, consider an English-friendly, map-ready listing and hotel-area promotion. Region-wide survey estimate, not venue-level.`, kind: 'observed', confidence: confidenceFor({ hasData: true, geoPrecise: false, ageYears: 1 }), sources: ['dnsw'] })
  // SEIFA
  const ier = r.seifa.find((s) => s.index === 'IER')
  if (ier?.nswDecile != null) out.push({ title: `Economic resources: ${r.stateName} decile ${ier.nswDecile} of 10`, detail: `${ier.area} ranks in decile ${ier.nswDecile} for area-level economic resources within ${r.stateName} (SEIFA 2021, 10 = most resources). It describes the area as a whole, not your audience, so treat it as one input for pricing, never the answer.`, kind: 'hypothesis', confidence: confidenceFor({ hasData: true, geoPrecise: true, ageYears: 5, proxy: true }), sources: ['abs_seifa'] })
  return out
}

export async function getVenueIntel(eventId: string): Promise<VenueIntel> {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, title: true, venueName: true, venueAddress: true, suburb: true, city: true, date: true, latitude: true, longitude: true } })
  if (!ev) throw new Error('Event not found')
  const cityState = stateCodeForCity(ev.city)
  const base: VenueIntel = {
    event: { id: ev.id, title: ev.title, venueName: ev.venueName, suburb: ev.suburb, city: ev.city, date: ev.date.toISOString() },
    status: 'ok', area: [], ages: [], agePeriod: null, seifa: [], stations: [], spending: [], insights: [],
    tourism: { period: null, visitors: null, nights: null, spend: null, intlVisitors: null, intlYoyPct: null, intlPrevPeriod: null },
    tourismTitle: null,
    benchLabel: 'the wider region',
    spendLabel: cityState ? STE_NAME[cityState] : 'Australia',
    stateName: cityState ? STE_NAME[cityState] : 'Australia',
    transportCovered: cityState === '1',
    sources: await sourceStatuses(), generatedAt: new Date().toISOString(),
  }
  let lat = ev.latitude, lng = ev.longitude
  if (lat == null || lng == null) {
    const q = [ev.venueName, ev.venueAddress, ev.suburb, ev.city, 'Australia'].filter(Boolean).join(', ')
    const g = (await geocode(q)) ?? (await geocode([ev.venueAddress ?? ev.suburb, ev.city].filter(Boolean).join(', ')))
    if (g && inAustralia(g.lat, g.lng)) { lat = g.lat; lng = g.lng; await prisma.event.update({ where: { id: ev.id }, data: { latitude: lat, longitude: lng } }).catch(() => {}) }
  }
  base.spending = await spending(cityState ?? 'AUS')
  if (cityState === '1') {
    base.tourism = await tourism(ev.city === 'Sydney' ? 'SYD' : 'NSW')
    base.tourismTitle = ev.city === 'Sydney' ? 'Visitors to Sydney' : 'Visitors to New South Wales'
  }
  if (lat == null || lng == null) return { ...base, status: 'no_location', message: 'We could not pin this venue on the map yet. Add a full street address and the local area report will appear.', insights: buildInsights(base) }
  if (!inAustralia(lat, lng)) return { ...base, status: 'outside_au', message: 'This venue sits outside Australia, so local area statistics are not available.', insights: buildInsights(base) }

  const g = await resolveVenueGeo(lat, lng)
  base.geo = { sa2Name: g.sa2Name, sa3Name: g.sa3Name, lgaName: g.lgaName, salName: g.salName, poa: g.poa }
  const ste = g.state && STE_NAME[g.state] ? g.state : cityState
  if (ste && STE_NAME[ste]) {
    base.stateName = STE_NAME[ste]
    base.spendLabel = STE_NAME[ste]
    base.transportCovered = ste === '1'
    base.spending = await spending(ste)
    if (ste === '1') {
      base.tourism = await tourism(ev.city === 'Sydney' ? 'SYD' : 'NSW')
      base.tourismTitle = ev.city === 'Sydney' ? 'Visitors to Sydney' : 'Visitors to New South Wales'
    } else {
      base.tourism = { period: null, visitors: null, nights: null, spend: null, intlVisitors: null, intlYoyPct: null, intlPrevPeriod: null }
      base.tourismTitle = null
    }
  }
  base.benchLabel = g.gccsaName || base.stateName

  // Area profile: venue SA2 vs council (LGA) vs the venue's greater capital city (or rest-of-state region).
  const codes = [...CORE, ...AGE_MEASURES.map((a) => a.code)]
  const [sa2, gsyd, lga] = await Promise.all([
    g.sa2 ? readObs('abs_region', 'asgs', { geoType: 'SA2', geoCode: g.sa2, measure: { in: codes } }) : [],
    g.gccsa ? readObs('abs_region', 'asgs', { geoType: 'GCCSA', geoCode: g.gccsa, measure: { in: codes } }) : [],
    g.lga ? readObs('abs_region', 'lga', { geoType: 'LGA', geoCode: g.lga, measure: { in: CORE } }) : [],
  ])
  const pick = (rows: typeof sa2, m: string) => latest(rows.filter((r) => r.measure === m && r.value != null))
  base.area = CORE.map((m) => {
    const d = REGION_MEASURES[m], v = pick(sa2, m), b = pick(gsyd, m), c = pick(lga, m)
    return { code: m, label: d.label, unit: d.unit, decimals: d.decimals ?? 0, meaning: d.meaning, limitation: d.limitation, census: !!d.census, venue: v?.value ?? null, venuePeriod: v?.period ?? null, council: c?.value ?? null, bench: b?.value ?? null, benchPeriod: b?.period ?? null }
  }).filter((a) => a.venue != null || a.bench != null)

  const ageRows = sa2.filter((r) => AGE_MEASURES.some((a) => a.code === r.measure) && r.value != null)
  base.agePeriod = latest(ageRows)?.period ?? null
  if (base.agePeriod) {
    const lower = (band: string) => Number(band.replace('+', '').split('-')[0])
    base.ages = GROUPS.map(([label, lo, hi]) => {
      const ms = AGE_MEASURES.filter((a) => lower(a.band) >= lo && lower(a.band) <= hi).map((a) => a.code)
      const s = (rows: typeof sa2) => { const r = rows.filter((x) => ms.includes(x.measure) && x.period === base.agePeriod && x.value != null); return r.length ? r.reduce((t, x) => t + (x.value ?? 0), 0) : null }
      const v = s(sa2)
      return v == null ? null : { band: label, venue: v, bench: s(gsyd) }
    }).filter((x): x is AgeBand => !!x)
  }

  // SEIFA: suburb (SAL) first, venue SA2 as fallback
  const seifaArea = g.sal ? { ds: 'sal', geo: 'SAL', code: g.sal, name: g.salName ?? 'Suburb' } : g.sa2 ? { ds: 'sa2', geo: 'SA2', code: g.sa2, name: g.sa2Name ?? 'Venue area' } : null
  if (seifaArea) {
    const s = await readObs('abs_seifa', seifaArea.ds, { geoType: seifaArea.geo, geoCode: seifaArea.code })
    base.seifa = Object.entries(SEIFA_INDEXES).map(([k, d]) => ({ index: k, label: d.label, meaning: d.meaning, area: seifaArea.name, nswDecile: s.find((x) => x.category === k && x.measure === 'RWSD')?.value ?? null, ausDecile: s.find((x) => x.category === k && x.measure === 'RWAD')?.value ?? null })).filter((x) => x.nswDecile != null || x.ausDecile != null)
  }

  base.stations = base.transportCovered ? await stationsNear(lat, lng) : []
  if (!base.area.length && !base.stations.length && !base.seifa.length) base.status = 'no_data'
  base.insights = buildInsights(base)
  return base
}

/** Cached for 12h per event; the cache is cleared whenever a source imports a new version. */
export async function getVenueIntelCached(eventId: string) {
  const key = `venue:au2:${eventId}`
  const hit = await prisma.intelCache.findUnique({ where: { key } })
  if (hit && Date.now() - hit.createdAt.getTime() < 12 * 3600_000) return hit.data as unknown as VenueIntel
  const data = await getVenueIntel(eventId)
  if (data.status !== 'no_location') await prisma.intelCache.upsert({ where: { key }, create: { key, data: data as never }, update: { data: data as never, createdAt: new Date() } })
  return data
}
