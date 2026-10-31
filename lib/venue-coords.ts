/**
 * When a listing has no usable pin, read the original page and store the
 * address it states plus a pin in that event's city.
 * Suburb-only text is not treated as a street address.
 */
import { reconcileSuburb } from '@/lib/categories'
import { prisma } from '@/lib/db'
import { cityDef } from '@/lib/cities'
import { locateAddress } from '@/lib/geocode'
import { usableUrl } from '@/lib/listing-link'
import { venueKey } from '@/lib/listing-window'
import {
  classifyVenueOutcome,
  extractListingVenue,
  isStreetAddress,
  mergeVenueFacts,
  missingCoordsNotice,
  noteNotVenue,
  pinFitsCity,
  statedPlaceAddress,
  type CoordNoticeKind,
  type ExtractedVenue,
} from '@/lib/listing-venue'
import { yieldIfBudget } from '@/lib/source-budget'
import { distanceKm } from '@/lib/travel'
import { placeFromText } from '@/lib/venue-place'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const INGEST_FETCH_CAP = 12
const INGEST_GEOCODE_CAP = 20

let ingestFetches = 0
let ingestGeocodes = 0
let recoverGeocodes = 0

export interface VenueCoordReport {
  checked: number
  fixed: number
  genuinelyMissing: number
  fetchFailed: number
  onlineOrTba: number
  unplaced: number
  noLink: number
}

export interface VenuePinPatch {
  venueName: string
  venueAddress: string | null
  latitude: number
  longitude: number
}

interface EventRow {
  id: string
  title: string
  city: string
  venueName: string
  venueAddress: string | null
  suburb: string | null
  latitude: number | null
  longitude: number | null
  sourceUrl: string | null
  ticketUrl: string | null
  organiserUrl: string | null
  organiserEditedAt: Date | null
  communityKey: string | null
  venueId: string | null
}

export function listingUrlOf(row: { sourceUrl?: string | null; ticketUrl?: string | null; organiserUrl?: string | null }): string | null {
  return usableUrl(row.sourceUrl) ?? usableUrl(row.ticketUrl) ?? usableUrl(row.organiserUrl)
}

export function needsVenueLookup(row: {
  city: string
  venueName: string
  venueAddress: string | null
  suburb: string | null
  latitude: number | null
  longitude: number | null
}): boolean {
  const street = isStreetAddress(row.venueAddress)
  const pin = row.latitude != null && row.longitude != null
    && pinFitsCity(row.latitude, row.longitude, row.city, row.venueAddress, row.suburb)
  if (!pin) return true
  if (!street) return true
  return pinIsSuburbCentroid(row)
}

/** Page fetch + geocode for ingest. Returns a pin only when the city check passes. */
export async function enrichMissingPin(input: {
  city: string
  venueName: string
  address: string | null
  url: string | null
  allowFetch: boolean
}): Promise<{ venueName: string; venueAddress: string | null; lat: number; lng: number } | null> {
  if (yieldIfBudget('venue coordinates')) return null
  let extracted: ExtractedVenue | null = null
  const url = usableUrl(input.url)
  if (input.allowFetch && url && ingestFetches < INGEST_FETCH_CAP) {
    ingestFetches++
    const page = await fetchListingPage(url)
    if (page && !blockedPage(page.html)) extracted = extractListingVenue(page.html, page.finalUrl)
  }
  const merged = extracted
    ? mergeVenueFacts({ venueName: input.venueName, venueAddress: input.address }, extracted)
    : { venueName: input.venueName, venueAddress: input.address }
  const address = isStreetAddress(merged.venueAddress) ? merged.venueAddress : null
  const pagePin = extracted?.lat != null && extracted.lng != null ? { lat: extracted.lat, lng: extracted.lng } : null
  const pin = await resolvePin(input.city, address, pagePin, input.address, 'ingest')
  if (!pin) return null
  return { venueName: merged.venueName, venueAddress: address ?? input.address, lat: pin.lat, lng: pin.lng }
}

/**
 * Re-check open "Missing venue coordinates" notices, and other events in `extraIds`.
 * A notice is closed only after a pin is saved. Fetch failures stay open with retry wording.
 */
export async function recoverMissingVenueCoordinates(opts: { limit?: number; extraIds?: string[] } = {}): Promise<VenueCoordReport & { patches: Map<string, VenuePinPatch>; outcomes: Map<string, CoordNoticeKind | 'fixed'> }> {
  const report: VenueCoordReport = { checked: 0, fixed: 0, genuinelyMissing: 0, fetchFailed: 0, onlineOrTba: 0, unplaced: 0, noLink: 0 }
  const patches = new Map<string, VenuePinPatch>()
  const outcomes = new Map<string, CoordNoticeKind | 'fixed'>()
  const open = await prisma.qualityAudit.findMany({
    where: { status: 'OPEN', action: 'MISSING_COORDS' },
    select: { id: true, eventId: true, detail: true },
    take: 500,
  })
  const noticeIds = open.map((row) => row.eventId).filter((id): id is string => !!id)
  const ordered = [...new Set([...noticeIds, ...(opts.extraIds ?? [])])]
  const limit = opts.limit ?? ordered.length
  const ids = ordered.slice(0, limit)
  if (!ids.length) return { ...report, patches, outcomes }

  const events = await prisma.event.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, title: true, city: true, venueName: true, venueAddress: true, suburb: true,
      latitude: true, longitude: true, sourceUrl: true, ticketUrl: true, organiserUrl: true,
      organiserEditedAt: true, communityKey: true, venueId: true,
    },
  })
  const byId = new Map(events.map((row) => [row.id, row]))
  const noticesFor = new Map<string, typeof open>()
  for (const row of open) {
    if (!row.eventId) continue
    noticesFor.set(row.eventId, [...(noticesFor.get(row.eventId) ?? []), row])
  }
  const pageCache = new Map<string, ExtractedVenue | 'fail'>()

  await pool(ids, 3, async (id) => {
    if (yieldIfBudget('venue coordinates')) return
    const ev = byId.get(id)
    const notices = noticesFor.get(id) ?? []
    if (!ev) {
      report.checked++
      if (notices.length) await closeNotices(notices.map((n) => n.id))
      return
    }
    if (ev.communityKey) return
    report.checked++
    const outcome = await settleOne(ev, pageCache)
    outcomes.set(id, outcome.kind)
    if (outcome.kind === 'fixed') {
      if (outcome.patch) {
        patches.set(id, outcome.patch)
        report.fixed++
        if (notices.length) await closeNotices(notices.map((n) => n.id))
      }
      return
    }
    if (outcome.kind === 'online' || outcome.kind === 'tba') report.onlineOrTba++
    if (outcome.kind === 'no-address' || outcome.kind === 'online' || outcome.kind === 'tba') report.genuinelyMissing++
    if (outcome.kind === 'fetch-failed' || outcome.kind === 'unplaced') report.fetchFailed++
    if (outcome.kind === 'no-link') report.noLink++
    const detail = missingCoordsNotice(ev.title, outcome.kind)
    for (const notice of notices) {
      if (notice.detail === detail) continue
      await prisma.qualityAudit.update({ where: { id: notice.id }, data: { detail } })
    }
  })

  console.log('[venue-coords]', report)
  return { ...report, patches, outcomes }
}

async function settleOne(ev: EventRow, pageCache: Map<string, ExtractedVenue | 'fail'>): Promise<{ kind: CoordNoticeKind | 'fixed'; patch: VenuePinPatch | null }> {
  const locked = !!ev.organiserEditedAt
  const url = listingUrlOf(ev)
  if (!needsVenueLookup(ev) && isStreetAddress(ev.venueAddress) && ev.latitude != null && ev.longitude != null && !noteNotVenue(ev.venueName)) {
    return { kind: 'fixed', patch: { venueName: ev.venueName, venueAddress: ev.venueAddress, latitude: ev.latitude, longitude: ev.longitude } }
  }
  if (locked) return settleLocked(ev)

  let extracted: ExtractedVenue | null = null
  let fetchFailed = false
  if (url) {
    const cached = pageCache.get(url)
    if (cached === 'fail') fetchFailed = true
    else if (cached) extracted = cached
    else {
      const page = await fetchListingPage(url)
      if (!page || blockedPage(page.html)) {
        fetchFailed = true
        pageCache.set(url, 'fail')
      } else {
        extracted = extractListingVenue(page.html, page.finalUrl)
        pageCache.set(url, extracted)
      }
    }
  }

  const merged = !locked && extracted
    ? mergeVenueFacts(ev, extracted)
    : { venueName: ev.venueName, venueAddress: ev.venueAddress }
  const address = isStreetAddress(merged.venueAddress)
    ? merged.venueAddress
    : (isStreetAddress(ev.venueAddress)
      ? ev.venueAddress
      : statedPlaceAddress(merged.venueAddress))
  const pagePin = extracted?.lat != null && extracted.lng != null ? { lat: extracted.lat, lng: extracted.lng } : null
  const pin = await resolvePin(ev.city, address, pagePin, ev.suburb, 'recover')
  const kind = classifyVenueOutcome({
    fetchFailed,
    hadLink: !!url,
    extracted,
    pin,
  })
  if (kind !== 'fixed' || !pin) return { kind: kind === 'fixed' ? 'unplaced' : kind, patch: null }

  const venueName = (merged.venueName || ev.venueName).slice(0, 200)
  const venueAddress = address ?? ev.venueAddress
  {
    const suburb = reconcileSuburb(ev.suburb, venueName, venueAddress, ev.city)
    const { makeSeriesKey } = await import('@/lib/event-store')
    await prisma.event.update({
      where: { id: ev.id },
      data: {
        venueName,
        ...(address ? { venueAddress: address } : {}),
        suburb,
        latitude: pin.lat,
        longitude: pin.lng,
        seriesKey: makeSeriesKey(ev.title, venueName, ev.city),
      },
    })
    const key = venueKey(ev.city, venueName)
    const venue = await prisma.venue.upsert({
      where: { key },
      create: {
        key,
        name: venueName,
        city: ev.city,
        timezone: cityDef(ev.city).tz,
        latitude: pin.lat,
        longitude: pin.lng,
        address: venueAddress,
      },
      update: {
        latitude: pin.lat,
        longitude: pin.lng,
        ...(venueAddress ? { address: venueAddress } : {}),
      },
      select: { id: true },
    })
    if (ev.venueId !== venue.id) await prisma.event.update({ where: { id: ev.id }, data: { venueId: venue.id } })
  }
  return { kind: 'fixed', patch: { venueName, venueAddress: address ?? ev.venueAddress, latitude: pin.lat, longitude: pin.lng } }
}

/** Organiser-edited rows keep their own name and address. A street they already saved can still be pinned. */
async function settleLocked(ev: EventRow): Promise<{ kind: CoordNoticeKind | 'fixed'; patch: VenuePinPatch | null }> {
  const address = isStreetAddress(ev.venueAddress) ? ev.venueAddress : null
  const pin = address ? await resolvePin(ev.city, address, null, ev.suburb, 'recover') : null
  if (pin && (ev.latitude == null || ev.longitude == null)) {
    await prisma.event.update({ where: { id: ev.id }, data: { latitude: pin.lat, longitude: pin.lng } })
  }
  if (pin) return { kind: 'fixed', patch: { venueName: ev.venueName, venueAddress: ev.venueAddress, latitude: pin.lat, longitude: pin.lng } }
  if (/^(online|virtual)$/i.test(ev.venueName.trim())) return { kind: 'online', patch: null }
  if (/^(tba|tbc)$/i.test(ev.venueName.trim())) return { kind: 'tba', patch: null }
  if (!address) return { kind: 'no-address', patch: null }
  return { kind: 'unplaced', patch: null }
}

async function resolvePin(
  city: string,
  address: string | null,
  pagePin: { lat: number; lng: number } | null,
  suburb: string | null | undefined,
  bucket: 'ingest' | 'recover',
): Promise<{ lat: number; lng: number } | null> {
  if (pagePin && pinFitsCity(pagePin.lat, pagePin.lng, city, address, suburb)) return pagePin
  if (!isStreetAddress(address)) return null
  const used = bucket === 'ingest' ? ingestGeocodes : recoverGeocodes
  const cap = bucket === 'ingest' ? INGEST_GEOCODE_CAP : 400
  if (used >= cap || yieldIfBudget('venue geocode')) return null
  if (bucket === 'ingest') ingestGeocodes++
  else recoverGeocodes++
  const state = cityDef(city).state
  const query = address!.toUpperCase().includes(state) ? address! : `${address}, ${state}`
  const geo = await locateAddress(query, city).catch(() => null)
  if (!geo || !pinFitsCity(geo.lat, geo.lng, city, address, suburb)) return null
  return geo
}

export async function fetchListingPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return null
  try {
    const res = await fetch(parsed, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (type && !/html|xml|text\/plain/i.test(type)) return null
    const html = (await res.text()).slice(0, 800_000)
    return html ? { html, finalUrl: res.url || url } : null
  } catch {
    return null
  }
}

function blockedPage(html: string): boolean {
  const sample = html.slice(0, 5000)
  const interstitial = /cf-browser-verification|attention required|captcha-delivery|g-recaptcha/i.test(sample)
  if (!interstitial) return false
  return !/PostalAddress|streetAddress|addressText|latLng:"/i.test(html)
}

function pinIsSuburbCentroid(row: { city: string; venueName: string; venueAddress: string | null; suburb: string | null; latitude: number | null; longitude: number | null }): boolean {
  if (row.latitude == null || row.longitude == null) return false
  const place = placeFromText({ venueAddress: row.venueAddress, venueName: row.venueName, suburb: row.suburb, city: row.city })
  if (place.lat == null || place.lng == null) return false
  return distanceKm({ lat: row.latitude, lng: row.longitude }, { lat: place.lat, lng: place.lng }) < 0.15
}

async function closeNotices(ids: string[]) {
  if (!ids.length) return
  await prisma.qualityAudit.updateMany({
    where: { id: { in: ids }, status: 'OPEN' },
    data: { status: 'RESOLVED', reviewedAt: new Date() },
  })
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      if (yieldIfBudget('venue coordinates')) return
      const item = items[next++]
      try {
        await fn(item)
      } catch (err) {
        console.error('[venue-coords] event failed:', err instanceof Error ? err.message : err)
      }
    }
  })
  await Promise.all(workers)
}
