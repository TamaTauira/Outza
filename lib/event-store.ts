import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { classifyCategory, checkLGBTI, reconcileSuburb } from '@/lib/categories'
import { DEFAULT_CITY, tidyVenueName } from '@/lib/cities'
import { normalizeTitle, normalizeVenue } from '@/lib/quality'
import { fieldConflicts, scheduleFields } from '@/lib/listing-window'
import { assertNoOwnershipTransfer, decideDuplicate } from '@/lib/event-identity'
import { guardAgainstWeakerSource, planLinkedFill } from '@/lib/linked-fill'
import { findEventIdBySourceKey, recordContribution, rememberSource } from '@/lib/source-record'
import { recordFieldConflict } from '@/lib/listing-audit'
import { readPrice } from '@/lib/price'
import { assetIdFor, bestSourceUrl } from '@/lib/images/source-url'
import { toSydneyParts } from '@/lib/event-store-parts'
import { sanitizeDbText, sanitizeDbUrl } from '@/lib/db-text'
import { normalizeListingUrls, usableUrl } from '@/lib/listing-link'
import { remainingBudgetMs, sourceFetchSignal, sourceOverBudget } from '@/lib/source-budget'
import { applyProtectedRefresh } from '@/lib/event-overrides'

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export interface RawEvent {
  title: string
  description?: string | null
  date: string // YYYY-MM-DD (Sydney local)
  time?: string | null // HH:MM
  endDate?: string | null // YYYY-MM-DD
  endTime?: string | null // HH:MM
  venueName: string
  venueAddress?: string | null
  genres?: string[]
  price?: string | null
  isFree?: boolean
  imageUrl?: string | null
  ticketUrl?: string | null
  sourceUrl?: string | null
  latitude?: number | null
  longitude?: number | null
  source: string
  city?: string
  status?: string | null
  feesIncluded?: boolean | null
  galleryUrls?: string[]
  accessibilityInfo?: string | null
  ageRestriction?: string | null
  organiserName?: string | null
  organiserUrl?: string | null
  /** Stable id from the source. Different ids from the same source are different sessions. */
  externalId?: string | null
}

export function makeDedupeHash(title: string, date: string, venue: string): string {
  const normalized = `${title}|${date}|${venue}`.toLowerCase().replace(/\s+/g, ' ').trim()
  return crypto.createHash('md5').update(normalized).digest('hex')
}

export { toSydneyParts }

export function sydneyToday(): Date {
  return new Date(`${toSydneyParts(new Date()).date}T00:00:00.000Z`)
}

function normTime(t?: string | null): string | null {
  if (!t) return null
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

function cleanText(s?: string | null, max = 600): string {
  return sanitizeDbText(s, max)
}

export function makeSeriesKey(title: string, venue: string, city: string): string {
  return crypto.createHash('md5').update(`${normalizeTitle(title)}|${normalizeVenue(venue)}|${city}`).digest('hex')
}

const STATUS_UPDATABLE = new Set(['CANCELLED', 'POSTPONED', 'RESCHEDULED', 'SOLD_OUT', 'SCHEDULED'])

function pinOnly(pin: { lat: number; lng: number } | null, existing: { latitude: number | null; longitude: number | null }) {
  if (!pin || (existing.latitude != null && existing.longitude != null)) return {}
  return { latitude: pin.lat, longitude: pin.lng }
}

function finitePin(lat?: number | null, lng?: number | null): { lat: number; lng: number } | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

/** Street addresses are geocoded. Pages are fetched only when the feed had no street. */
async function fillPinFromListing(input: { city: string; venueName: string; address: string | null; url: string | null }) {
  const { isStreetAddress } = await import('@/lib/listing-venue')
  const { enrichMissingPin } = await import('@/lib/venue-coords')
  return enrichMissingPin({ ...input, allowFetch: !isStreetAddress(input.address) })
}

export async function saveEvent(ev: RawEvent): Promise<boolean> {
  if (!ev.title || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) return false
  const title = cleanText(ev.title, 250)
  if (!title) return false
  const description = cleanText(ev.description)
  const date = new Date(`${ev.date}T00:00:00.000Z`)
  if (date < sydneyToday()) return false
  const city = ev.city ?? DEFAULT_CITY
  const rawVenue = cleanText(ev.venueName, 200) || 'TBA'
  let suburb = reconcileSuburb(null, rawVenue, ev.venueAddress, city)
  let venueName = tidyVenueName(rawVenue, ev.venueAddress, city)
  const { category, subTags } = classifyCategory(title, description, ev.genres ?? [])
  const isLGBTI = checkLGBTI(title, `${description} ${(ev.genres ?? []).join(' ')}`)
  const parsedPrice = readPrice(ev.price, Boolean(ev.isFree))
  const isFree = parsedPrice.isFree
  const price = parsedPrice.price
  const time = normTime(ev.time)
  const endTime = normTime(ev.endTime)
  const endDate = ev.endDate && ev.endDate !== ev.date ? new Date(`${ev.endDate}T00:00:00.000Z`) : null
  const dedupeHash = makeDedupeHash(title, ev.date, venueName)
  const legacyHash = makeDedupeHash(title, ev.date, rawVenue)
  const status = ev.status && STATUS_UPDATABLE.has(ev.status) ? ev.status : 'SCHEDULED'
  const range = { min: parsedPrice.min, max: parsedPrice.max }
  const now = new Date()
  const imageUrl = bestSourceUrl(sanitizeDbUrl(ev.imageUrl, 2000))
  let venueAddress = ev.venueAddress ? cleanText(ev.venueAddress, 500) : ''
  const galleryUrls = (ev.galleryUrls ?? []).map((u) => sanitizeDbUrl(u, 2000)).filter((u): u is string => !!u).slice(0, 8)
  // Repair escapes and unpaired surrogates before and after URL normalisation.
  // usableUrl still cuts with slice(), which can split an emoji.
  const links = normalizeListingUrls({
    source: ev.source,
    ticketUrl: sanitizeDbUrl(ev.ticketUrl, 2000),
    sourceUrl: sanitizeDbUrl(ev.sourceUrl, 2000),
    organiserUrl: sanitizeDbUrl(ev.organiserUrl, 2000),
  })
  const storedLinks = {
    ticketUrl: sanitizeDbUrl(links.ticketUrl, 500),
    sourceUrl: sanitizeDbUrl(links.sourceUrl, 500),
    organiserUrl: sanitizeDbUrl(links.organiserUrl, 500),
  }
  const sched = scheduleFields({
    date: ev.date,
    endDate: ev.endDate,
    time,
    endTime,
    city,
    status,
    source: ev.source,
    isFree,
    price,
    title,
    venueName,
    venueAddress: venueAddress || null,
    latitude: ev.latitude,
    lastVerifiedAt: now,
    organiserName: ev.organiserName,
  })

  const data = {
    description, time, endTime, endDate, category, subTags, isLGBTI, isFree, price,
    imageUrl,
    priceMin: range.min, priceMax: range.max, feesIncluded: ev.feesIncluded ?? null,
    status, statusSource: status === 'SCHEDULED' ? null : ev.source, lastVerifiedAt: now,
    timezone: sched.timezone, allDay: sched.allDay, startsAt: sched.startsAt, endsAt: sched.endsAt,
    confidenceScore: sched.confidenceScore,
    // A refresh that omits a link must not wipe one we already stored.
    ...(storedLinks.ticketUrl ? { ticketUrl: storedLinks.ticketUrl } : {}),
    ...(storedLinks.sourceUrl ? { sourceUrl: storedLinks.sourceUrl } : {}),
    ...(storedLinks.organiserUrl ? { organiserUrl: storedLinks.organiserUrl } : {}),
    // Visitor details only overwrite when the source actually supplies them
    ...(galleryUrls.length ? { galleryUrls } : {}),
    ...(ev.accessibilityInfo ? { accessibilityInfo: cleanText(ev.accessibilityInfo, 1000) } : {}),
    ...(ev.ageRestriction ? { ageRestriction: cleanText(ev.ageRestriction, 120) } : {}),
    ...(ev.organiserName ? { organiserName: cleanText(ev.organiserName, 160) } : {}),
  }

  const eventSelect = {
    id: true, dedupeHash: true, source: true, sources: true, imageUrl: true, imageAssetId: true, imageLocked: true,
    organiserEditedAt: true, communityKey: true, latitude: true, longitude: true, title: true, venueName: true,
    venueAddress: true, city: true, date: true, status: true, time: true, endTime: true, endDate: true,
    price: true, priceMin: true, priceMax: true, isFree: true, feesIncluded: true, description: true, lastVerifiedAt: true,
  } as const
  const externalId = ev.externalId?.trim() || null
  const identityUrl = storedLinks.sourceUrl || storedLinks.ticketUrl
  const linkedId = await findEventIdBySourceKey({ source: ev.source, externalId, url: identityUrl, date: ev.date, time })
  let existing = linkedId
    ? await prisma.event.findUnique({ where: { id: linkedId }, select: eventSelect })
    : null
  if (!existing) {
    existing = await prisma.event.findFirst({
      where: { dedupeHash: { in: [...new Set([dedupeHash, legacyHash])] } },
      select: eventSelect,
    })
  }
  const identityHit = !!existing && existing.id === linkedId
  let pin = finitePin(ev.latitude, ev.longitude)
  if (!pin && !(existing && existing.latitude != null && existing.longitude != null) && ev.source !== 'community') {
    const filled = await fillPinFromListing({
      city,
      venueName,
      address: venueAddress || null,
      url: storedLinks.sourceUrl || storedLinks.ticketUrl || storedLinks.organiserUrl,
    }).catch(() => null)
    if (filled) {
      pin = { lat: filled.lat, lng: filled.lng }
      if (filled.venueAddress) {
        venueAddress = cleanText(filled.venueAddress, 500)
        venueName = tidyVenueName(filled.venueName, venueAddress, city)
        suburb = reconcileSuburb(suburb, venueName, venueAddress, city)
      }
    }
  }
  if (pin) Object.assign(data, { latitude: pin.lat, longitude: pin.lng })
  const crossFill = {
    time, endTime, price, isFree, priceMin: range.min, priceMax: range.max, feesIncluded: ev.feesIncluded ?? null,
    status, imageUrl, description, title, venueName,
    endDate: ev.endDate && ev.endDate !== ev.date ? ev.endDate : null,
    venueAddress: venueAddress || null,
    latitude: pin?.lat ?? null,
    longitude: pin?.lng ?? null,
    ...storedLinks,
  }
  if (existing) {
    if (existing.source === 'community' || existing.communityKey) return false
    const sources = existing.sources.includes(ev.source) ? existing.sources : [...existing.sources, ev.source]
    const incomingFields = {
      title,
      description,
      date: ev.date,
      time,
      endTime,
      venueName,
      venueAddress: venueAddress || null,
      status,
      price,
      category,
    }
    const legacyLock = { sources, lastVerifiedAt: new Date(), ...(status === 'CANCELLED' ? { status } : {}) }
    if (existing.source === ev.source) {
      const { imageUrl: _img, ...rest } = data
      const update: Record<string, unknown> = {
        ...rest, sources, venueName, suburb,
        seriesKey: makeSeriesKey(title, venueName, city),
        ...(venueAddress ? { venueAddress } : {}),
      }
      if (dedupeHash !== existing.dedupeHash) {
        const clash = await prisma.event.findUnique({ where: { dedupeHash }, select: { id: true } })
        if (!clash) {
          update.dedupeHash = dedupeHash
          if (identityHit) update.date = date
        }
      }
      // Admin-replaced artwork is locked; a source that drops its image keeps the one we have
      if (!existing.imageLocked && imageUrl && imageUrl !== existing.imageUrl) {
        update.imageUrl = imageUrl
        if (existing.imageAssetId && existing.imageAssetId !== assetIdFor(imageUrl)) {
          update.imageAssetId = null // re-linked and processed by the async image pass
          await prisma.imageHistory.create({
            data: { eventId: existing.id, oldAssetId: existing.imageAssetId, oldUrl: existing.imageUrl, newUrl: imageUrl, reason: 'SOURCE_UPDATE' },
          })
        }
      }
      // Per-field organiser overrides keep their values. Other fields, including artwork, still refresh.
      if (await applyProtectedRefresh(existing.id, incomingFields, update)) {
        await rememberSource({ eventId: existing.id, source: ev.source, externalId, url: identityUrl, date: ev.date, time })
        return true
      }
      // Older organiser edits lock the whole listing. Cancellation from the source still lands.
      if (existing.organiserEditedAt) {
        const locked = { ...legacyLock, ...pinOnly(pin, existing) }
        assertNoOwnershipTransfer(locked)
        await prisma.event.update({ where: { id: existing.id }, data: locked })
        await rememberSource({ eventId: existing.id, source: ev.source, externalId, url: identityUrl, date: ev.date, time })
        return true
      }
      const guarded = guardAgainstWeakerSource(existing, update)
      assertNoOwnershipTransfer(guarded)
      await prisma.event.update({ where: { id: existing.id }, data: guarded })
      await rememberSource({ eventId: existing.id, source: ev.source, externalId, url: identityUrl, date: ev.date, time })
    } else {
      if (await applyProtectedRefresh(existing.id, incomingFields, { sources, lastVerifiedAt: new Date() })) {
        await rememberSource({ eventId: existing.id, source: ev.source, externalId, url: identityUrl, date: ev.date, time })
        return true
      }
      if (existing.organiserEditedAt) {
        const locked = { ...legacyLock, ...pinOnly(pin, existing) }
        assertNoOwnershipTransfer(locked)
        await prisma.event.update({ where: { id: existing.id }, data: locked })
        await rememberSource({ eventId: existing.id, source: ev.source, externalId, url: identityUrl, date: ev.date, time })
        return true
      }
      await mergeInto(existing.id, ev.source, sources, crossFill)
      await rememberSource({ eventId: existing.id, source: ev.source, externalId, url: identityUrl, date: ev.date, time })
    }
    return true
  }

  // A cancelled listing we have never seen is not worth adding
  if (status === 'CANCELLED') return false

  // Cross-source duplicate: a fuzzy title/venue/time match on the same day in the same city
  const candidates = await prisma.event.findMany({
    where: { date, city, duplicateOfId: null, communityKey: null },
    select: { id: true, title: true, venueName: true, time: true, sources: true, source: true, organiserName: true },
    take: 400,
  })
  const incomingIdentity = {
    title, venueName, city, date: ev.date, time, source: ev.source, organiserName: ev.organiserName,
    externalId, url: identityUrl, address: venueAddress || null, status,
  }
  const dup = candidates.find((c) => decideDuplicate(
    { title: c.title, venueName: c.venueName, city, date: ev.date, time: c.time, source: c.source, organiserName: c.organiserName },
    incomingIdentity,
  ).action === 'link')
  if (dup) {
    const sources = dup.sources.includes(ev.source) ? dup.sources : [...dup.sources, ev.source]
    await mergeInto(dup.id, ev.source, sources, crossFill)
    await rememberSource({ eventId: dup.id, source: ev.source, externalId, url: identityUrl, date: ev.date, time })
    return false
  }

  assertNoOwnershipTransfer(data)
  const created = await prisma.event.create({
    data: {
      ...data, title, date, venueName,
      venueAddress: venueAddress || null,
      suburb,
      source: ev.source, sources: [ev.source], dedupeHash, city,
      seriesKey: makeSeriesKey(title, venueName, city),
    },
  })
  await rememberSource({ eventId: created.id, source: ev.source, externalId, url: identityUrl, date: ev.date, time })
  return true
}

/** Another source confirmed an event we already list: record it and fill gaps, never overwrite a reliable value. */
async function mergeInto(
  id: string,
  source: string,
  sources: string[],
  f: {
    time: string | null
    endTime: string | null
    endDate?: string | null
    price: string | null
    isFree?: boolean
    priceMin?: number | null
    priceMax?: number | null
    feesIncluded?: boolean | null
    status: string
    imageUrl?: string | null
    description?: string | null
    title?: string
    venueName?: string
    venueAddress?: string | null
    latitude?: number | null
    longitude?: number | null
    ticketUrl?: string | null
    sourceUrl?: string | null
    organiserUrl?: string | null
  },
) {
  const cur = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true, title: true, venueName: true, venueAddress: true, suburb: true, city: true, date: true,
      time: true, endTime: true, endDate: true, price: true, priceMin: true, priceMax: true, isFree: true,
      feesIncluded: true, latitude: true, longitude: true, ticketUrl: true, sourceUrl: true, organiserUrl: true,
      imageUrl: true, imageLocked: true, description: true, source: true, sources: true, status: true,
      organiserEditedAt: true, communityKey: true, lastVerifiedAt: true,
    },
  })
  if (!cur || cur.organiserEditedAt || cur.communityKey) return
  const plan = planLinkedFill({ ...cur, sources }, [{
    relation: 'linked',
    source,
    title: f.title || cur.title,
    venueName: f.venueName || cur.venueName,
    city: cur.city,
    date: cur.date,
    time: f.time,
    endTime: f.endTime,
    endDate: f.endDate,
    price: f.price,
    isFree: f.isFree,
    priceMin: f.priceMin,
    priceMax: f.priceMax,
    feesIncluded: f.feesIncluded,
    venueAddress: f.venueAddress,
    latitude: f.latitude,
    longitude: f.longitude,
    ticketUrl: f.ticketUrl,
    imageUrl: f.imageUrl,
    description: f.description,
    status: f.status,
  }])
  const fill: Record<string, unknown> = { ...plan.patch, sources, lastVerifiedAt: new Date() }
  if (!usableUrl(cur.sourceUrl) && f.sourceUrl) fill.sourceUrl = f.sourceUrl
  if (!usableUrl(cur.organiserUrl) && f.organiserUrl) fill.organiserUrl = f.organiserUrl
  const conflicts = fieldConflicts(cur, f).filter((line) => line.startsWith('time ') || line.startsWith('end '))
  if (conflicts.length) {
    await recordFieldConflict(id, `Kept the original times. ${source} disagreed: ${conflicts.join('; ')}. Provenance stays on sources.`)
  }
  // Cancellations and postponements matter more than which source reported them first
  if (cur.status === 'SCHEDULED' && f.status !== 'SCHEDULED') Object.assign(fill, { status: f.status, statusSource: source })
  assertNoOwnershipTransfer(fill)
  await prisma.event.update({ where: { id }, data: fill })
  const contributed = plan.filled.filter((row) => row.source === source).map((row) => row.field)
  if (contributed.length) {
    await recordContribution({
      eventId: id,
      source,
      fields: contributed,
      url: f.sourceUrl || f.ticketUrl,
      date: cur.date.toISOString().slice(0, 10),
      time: typeof fill.time === 'string' ? fill.time : cur.time,
    })
  }
}

export async function fetchHtml(url: string, retries = 2): Promise<string | null> {
  if (sourceOverBudget()) return null
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
      signal: sourceFetchSignal(20000),
    })
    if (res.status === 429 && retries > 0) {
      if (sourceOverBudget()) return null
      await sleep(30000)
      if (sourceOverBudget()) return null
      return fetchHtml(url, retries - 1)
    }
    if (!res.ok) {
      console.warn(`[scrape] ${url} -> ${res.status}`)
      return null
    }
    return await res.text()
  } catch (e: any) {
    console.warn(`[scrape] ${url} failed: ${e?.message}`)
    return null
  }
}

export function extractNextData(html: string): any | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, remainingBudgetMs(ms)))
