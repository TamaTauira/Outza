/**
 * Fill blank listing fields from another source that is already linked.
 * A present, reliable value is left alone. Ticketing sources win for price and times.
 * Review pairs and hard mismatches are not donors. Clocks stay in the event's city zone.
 */
import { keepStoredDescription, sanitizeDescription } from '@/lib/description-text'
import { decideDuplicate, type DuplicateDecision } from '@/lib/event-identity'
import { bestSourceUrl } from '@/lib/images/source-url-client'
import { usableUrl } from '@/lib/listing-link'
import { isStreetAddress, isOnlineSentinel } from '@/lib/listing-venue'
import { isWeakVenueName } from '@/lib/place-match'
import { dateKeyOf, scheduleFields } from '@/lib/listing-window'
import { priceFromAmounts, readPrice, type PriceRead } from '@/lib/price'
import { SOURCES, isSameEvent, normalizeVenue, similarity } from '@/lib/quality'
import { suburbFromAddress } from '@/lib/cities'
import { pinIsCityDump } from '@/lib/venue-place'

const HARD_LAYERS = new Set<DuplicateDecision['layer']>(['venue', 'session', 'date', 'organiser', 'exact_id', 'address'])

export type DonorRelation = 'linked' | 'attributed' | 'review' | 'reject'

export type FillEvent = {
  id?: string
  title: string
  venueName: string
  venueAddress?: string | null
  suburb?: string | null
  city?: string | null
  date: string | Date
  time?: string | null
  endTime?: string | null
  endDate?: string | Date | null
  price?: string | null
  priceMin?: number | null
  priceMax?: number | null
  isFree?: boolean | null
  feesIncluded?: boolean | null
  latitude?: number | null
  longitude?: number | null
  ticketUrl?: string | null
  imageUrl?: string | null
  imageLocked?: boolean | null
  description?: string | null
  source: string
  sources?: string[] | null
  duplicateOfId?: string | null
  organiserName?: string | null
  status?: string | null
  organiserEditedAt?: Date | string | null
  communityKey?: string | null
  lastVerifiedAt?: Date | string | null
  /** Preset by a caller that already decided. Unset donors are classified. */
  relation?: DonorRelation
  lockedFields?: string[] | null
}

export type LinkedFillPlan = {
  patch: Record<string, unknown>
  filled: { field: string; source: string }[]
  skippedReview: number
}

const EMPTY: LinkedFillPlan = { patch: {}, filled: [], skippedReview: 0 }

export function reliableTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** A price we can show. TBA, blank and a default not-free flag are not prices. */
export function reliablePrice(row: {
  price?: string | null
  priceMin?: number | null
  priceMax?: number | null
  isFree?: boolean | null
}): PriceRead | null {
  const text = readPrice(row.price)
  if (text.price && (text.isFree || text.min != null)) return text
  if (typeof row.priceMin === 'number' && Number.isFinite(row.priceMin)) {
    const max = typeof row.priceMax === 'number' && Number.isFinite(row.priceMax) ? row.priceMax : row.priceMin
    return priceFromAmounts(row.priceMin, max)
  }
  if (row.isFree === true) return { price: 'Free', isFree: true, min: 0, max: 0, fromOnly: false }
  return null
}

function usableDescription(value?: string | null): string | null {
  const text = sanitizeDescription(value)
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length < 40) return null
  if (/^(tba|tbc|to be announced|to be confirmed|n\/a|see website)\b/i.test(flat)) return null
  if (/start\s*[-–:]\s*tbc/i.test(flat) && /finish\s*[-–:]\s*tbc/i.test(flat) && flat.length < 160) return null
  return text
}

function usablePin(lat?: number | null, lng?: number | null, city?: string | null, suburb?: string | null): { lat: number; lng: number } | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return null
  if (isOnlineSentinel(lat, lng)) return null
  if (lat < -45 || lat > -9 || lng < 110 || lng > 160) return null
  if (city && pinIsCityDump(lat, lng, city, suburb)) return null
  return { lat, lng }
}

function sourceRank(source: string, preferTicketing: boolean): number {
  const meta = SOURCES[source]
  return (preferTicketing && meta?.kind === 'ticketing' ? 1000 : 0) + (meta?.trust ?? 10)
}

function toIdentity(row: FillEvent) {
  return {
    title: row.title,
    venueName: row.venueName,
    city: row.city,
    date: dateKeyOf(row.date),
    time: row.time,
    source: row.source,
    organiserName: row.organiserName,
    address: row.venueAddress,
    status: row.status,
    price: row.price,
  }
}

function hardSeparate(decision: DuplicateDecision): boolean {
  return decision.action === 'separate' && decision.confidence < 50 && HARD_LAYERS.has(decision.layer)
}

/** Linked copies may fill gaps. A review pair, or a hard mismatch, may not. */
export function classifyDonor(canonical: FillEvent, donor: FillEvent): DonorRelation {
  if (!donor.source || (donor.id && donor.id === canonical.id)) return 'reject'
  if (donor.duplicateOfId && canonical.id && donor.duplicateOfId !== canonical.id) return 'reject'
  if (canonical.id && donor.duplicateOfId === canonical.id) return 'linked'
  if (donor.relation === 'linked') return 'linked'
  if (donor.relation === 'review' || donor.relation === 'reject') return donor.relation
  if (donor.communityKey) return 'reject'
  const decision = decideDuplicate(toIdentity(canonical), toIdentity(donor))
  if (decision.action === 'link') return 'linked'
  if (decision.action === 'review') return 'review'
  if (hardSeparate(decision)) return 'reject'
  const named = (canonical.sources ?? []).includes(donor.source) && donor.source !== canonical.source
  if (!named) return 'reject'
  if (!dateKeyOf(canonical.date) || dateKeyOf(canonical.date) !== dateKeyOf(donor.date)) return 'reject'
  if ((canonical.city ?? '') && donor.city && canonical.city !== donor.city) return 'reject'
  if (!isSameEvent(
    { title: canonical.title, venueName: canonical.venueName, time: canonical.time, source: canonical.source },
    { title: donor.title, venueName: donor.venueName, time: donor.time, source: donor.source },
  )) return 'reject'
  const left = normalizeVenue(canonical.venueName)
  const right = normalizeVenue(donor.venueName)
  if (left && right && similarity(left, right) < 0.5) return 'reject'
  return 'attributed'
}

function pick<T>(donors: FillEvent[], preferTicketing: boolean, read: (donor: FillEvent) => T | null): { donor: FillEvent; value: T } | null {
  const ranked = donors
    .map((donor, index) => ({ donor, index }))
    .sort((a, b) => sourceRank(b.donor.source, preferTicketing) - sourceRank(a.donor.source, preferTicketing) || a.index - b.index)
  for (const { donor } of ranked) {
    const value = read(donor)
    if (value != null) return { donor, value }
  }
  return null
}

function locked(canonical: FillEvent, field: string): boolean {
  return (canonical.lockedFields ?? []).includes(field)
}

/**
 * Fields to copy onto the canonical listing.
 * `linked` donors were confirmed (duplicateOfId or an identifier match).
 * `attributed` donors are already named on the listing and still look like the same show.
 */
export function planLinkedFill(canonical: FillEvent, donors: FillEvent[]): LinkedFillPlan {
  if (canonical.organiserEditedAt || canonical.communityKey) return EMPTY
  const usable: FillEvent[] = []
  let skippedReview = 0
  for (const donor of donors) {
    const relation = donor.relation ?? classifyDonor(canonical, donor)
    if (relation === 'review') {
      skippedReview += 1
      continue
    }
    if (relation === 'linked' || relation === 'attributed') usable.push(donor)
  }
  if (!usable.length) return { ...EMPTY, skippedReview }

  const patch: Record<string, unknown> = {}
  const filled: { field: string; source: string }[] = []
  const note = (field: string, source: string) => filled.push({ field, source })

  const timeMissing = !reliableTime(canonical.time) && !locked(canonical, 'time')
  const endMissing = !reliableTime(canonical.endTime) && !locked(canonical, 'endTime')
  if (timeMissing) {
    const found = pick(usable, true, (donor) => reliableTime(donor.time))
    if (found) {
      patch.time = found.value
      note('time', found.donor.source)
    }
  }
  if (endMissing) {
    const found = pick(usable, true, (donor) => reliableTime(donor.endTime))
    if (found) {
      patch.endTime = found.value
      note('endTime', found.donor.source)
    }
  }
  const canonicalEnd = dateKeyOf(canonical.endDate)
  const canonicalDay = dateKeyOf(canonical.date)
  if (!canonicalEnd && !locked(canonical, 'date')) {
    const found = pick(usable, true, (donor) => {
      const key = dateKeyOf(donor.endDate)
      return key && canonicalDay && key > canonicalDay ? key : null
    })
    if (found) {
      patch.endDate = new Date(`${found.value}T00:00:00.000Z`)
      note('endDate', found.donor.source)
    }
  }

  if (!reliablePrice(canonical) && !locked(canonical, 'price')) {
    const found = pick(usable, true, (donor) => reliablePrice(donor))
    if (found) {
      patch.price = found.value.price
      patch.isFree = found.value.isFree
      patch.priceMin = found.value.min
      patch.priceMax = found.value.max
      note('price', found.donor.source)
      note('isFree', found.donor.source)
      note('priceMin', found.donor.source)
      note('priceMax', found.donor.source)
      if (canonical.feesIncluded == null && typeof found.donor.feesIncluded === 'boolean') {
        patch.feesIncluded = found.donor.feesIncluded
        note('feesIncluded', found.donor.source)
      }
    }
  }

  if (!isStreetAddress(canonical.venueAddress) && !locked(canonical, 'venueAddress')) {
    const found = pick(usable, false, (donor) => (isStreetAddress(donor.venueAddress) ? donor.venueAddress!.trim() : null))
    if (found) {
      patch.venueAddress = found.value
      note('venueAddress', found.donor.source)
      const suburb = suburbFromAddress(found.value)
      if (suburb && !canonical.suburb) patch.suburb = suburb
    }
  }

  const havePin = canonical.latitude != null && canonical.longitude != null
  if (!havePin) {
    const addressSource = filled.find((row) => row.field === 'venueAddress')?.source
    const preferred = addressSource ? usable.filter((donor) => donor.source === addressSource) : usable
    const found = pick(preferred, false, (donor) => usablePin(donor.latitude, donor.longitude, canonical.city, donor.suburb ?? canonical.suburb))
      ?? (addressSource ? pick(usable, false, (donor) => usablePin(donor.latitude, donor.longitude, canonical.city, donor.suburb ?? canonical.suburb)) : null)
    if (found) {
      patch.latitude = found.value.lat
      patch.longitude = found.value.lng
      note('latitude', found.donor.source)
      note('longitude', found.donor.source)
    }
  }

  if (!usableUrl(canonical.ticketUrl) && !locked(canonical, 'ticketUrl')) {
    const found = pick(usable, true, (donor) => usableUrl(donor.ticketUrl))
    if (found) {
      patch.ticketUrl = found.value
      note('ticketUrl', found.donor.source)
    }
  }

  if (!canonical.imageUrl && !canonical.imageLocked) {
    const found = pick(usable, false, (donor) => bestSourceUrl(donor.imageUrl))
    if (found) {
      patch.imageUrl = found.value
      note('imageUrl', found.donor.source)
    }
  }

  if (!canonical.description?.trim() && !locked(canonical, 'description')) {
    const found = pick(usable, false, (donor) => usableDescription(donor.description))
    if (found) {
      patch.description = found.value
      note('description', found.donor.source)
    }
  }

  if (isWeakVenueName(canonical.venueName, canonical.venueAddress) && !locked(canonical, 'venueName')) {
    const found = pick(usable, false, (donor) => {
      const name = donor.venueName?.trim()
      if (!name || isWeakVenueName(name, donor.venueAddress)) return null
      return name
    })
    if (found) {
      patch.venueName = found.value
      note('venueName', found.donor.source)
    }
  }

  if (patch.time || patch.endTime || patch.endDate) {
    const sched = scheduleFields({
      date: canonical.date,
      endDate: (patch.endDate as Date | undefined) ?? canonical.endDate,
      time: (patch.time as string | undefined) ?? canonical.time,
      endTime: (patch.endTime as string | undefined) ?? canonical.endTime,
      city: canonical.city,
      status: canonical.status,
      source: canonical.source,
      sources: canonical.sources,
      isFree: typeof patch.isFree === 'boolean' ? patch.isFree : canonical.isFree === true,
      price: (patch.price as string | null | undefined) ?? canonical.price,
      venueAddress: (patch.venueAddress as string | undefined) ?? canonical.venueAddress,
      latitude: (patch.latitude as number | undefined) ?? canonical.latitude,
      lastVerifiedAt: canonical.lastVerifiedAt,
      title: canonical.title,
      venueName: canonical.venueName,
    })
    patch.timezone = sched.timezone
    patch.allDay = sched.allDay
    patch.startsAt = sched.startsAt
    patch.endsAt = sched.endsAt
    patch.confidenceScore = sched.confidenceScore
  }

  if (!filled.length) return { ...EMPTY, skippedReview }
  const have = new Set([canonical.source, ...(canonical.sources ?? [])])
  const added = [...new Set(filled.map((row) => row.source))].filter((source) => !have.has(source))
  if (added.length) {
    const base = canonical.sources?.length ? [...canonical.sources] : [canonical.source]
    patch.sources = [...new Set([...base, ...added])]
  }
  return { patch, filled, skippedReview }
}

export type RowPlan = { event: FillEvent; plan: LinkedFillPlan; skip: 'organiser' | null }

/** Group a loaded city-date pool the way the backfill does. Pass `onlyIds` to score one batch. */
export function plansForRows(rows: FillEvent[], onlyIds?: Set<string>): RowPlan[] {
  const targets = new Set(rows.map((row) => row.duplicateOfId).filter((id): id is string => !!id))
  const out: RowPlan[] = []
  for (const event of rows) {
    if (!event.id || event.duplicateOfId) continue
    if (onlyIds && !onlyIds.has(event.id)) continue
    const named = new Set((event.sources ?? []).filter((source) => source && source !== event.source))
    if (!named.size && !targets.has(event.id)) continue
    if (event.organiserEditedAt || event.communityKey) {
      out.push({ event, plan: EMPTY, skip: 'organiser' })
      continue
    }
    const day = dateKeyOf(event.date)
    const donors = rows.filter((other) => {
      if (!other.id || other.id === event.id) return false
      if (other.duplicateOfId === event.id) return true
      if (other.duplicateOfId) return false
      return !!day && dateKeyOf(other.date) === day && (other.city ?? '') === (event.city ?? '')
    })
    out.push({ event, plan: planLinkedFill(event, donors), skip: null })
  }
  return out
}

const PUBLIC_GROUPS: { label: string; fields: string[] }[] = [
  { label: 'the start time', fields: ['time'] },
  { label: 'the finish time', fields: ['endTime', 'endDate'] },
  { label: 'the price', fields: ['price', 'priceMin', 'priceMax', 'isFree', 'feesIncluded'] },
  { label: 'the address', fields: ['venueAddress'] },
  { label: 'the map pin', fields: ['latitude', 'longitude'] },
  { label: 'the ticket link', fields: ['ticketUrl'] },
  { label: 'the image', fields: ['imageUrl'] },
  { label: 'the description', fields: ['description'] },
  { label: 'the venue name', fields: ['venueName'] },
]

export function fieldSourcesFromRecords(
  records: { source: string; contributed: unknown }[],
  primary?: string | null,
): Record<string, string> {
  const ranked = [...records].sort((a, b) => sourceRank(b.source, true) - sourceRank(a.source, true))
  const out: Record<string, string> = {}
  for (const row of ranked) {
    if (!row.source || row.source === primary) continue
    if (!row.contributed || typeof row.contributed !== 'object' || Array.isArray(row.contributed)) continue
    for (const [field, on] of Object.entries(row.contributed)) {
      if (on && !out[field]) out[field] = row.source
    }
  }
  return out
}

export function filledSourceNote(primary: string | null | undefined, fieldSources?: Record<string, string> | null): string | null {
  if (!fieldSources) return null
  const bySource = new Map<string, string[]>()
  for (const group of PUBLIC_GROUPS) {
    const source = group.fields.map((field) => fieldSources[field]).find((item) => item && item !== primary)
    if (!source) continue
    const labels = bySource.get(source) ?? []
    if (!labels.includes(group.label)) labels.push(group.label)
    bySource.set(source, labels)
  }
  if (!bySource.size) return null
  const count = [...bySource.values()].reduce((sum, labels) => sum + labels.length, 0)
  const parts = [...bySource.entries()].map(([source, labels]) => {
    const name = (SOURCES[source]?.label || source).replace(/\bverified\b/ig, '').replace(/\s{2,}/g, ' ').trim() || 'another listing'
    return `${joinLabels(labels)} ${labels.length === 1 ? 'was' : 'were'} filled from ${name}`
  })
  return `${parts.join('. ')}. The original listing left ${count === 1 ? 'it' : 'them'} blank.`
}

function joinLabels(labels: string[]): string {
  const pretty = labels.map((label, index) => (index === 0 ? capitalize(label) : label))
  if (pretty.length === 1) return pretty[0]
  if (pretty.length === 2) return `${pretty[0]} and ${pretty[1]}`
  return `${pretty.slice(0, -1).join(', ')} and ${pretty[pretty.length - 1]}`
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

type GuardRow = {
  date: string | Date
  endDate?: string | Date | null
  time?: string | null
  endTime?: string | null
  city?: string | null
  status?: string | null
  source?: string | null
  sources?: string[] | null
  title?: string | null
  venueName?: string | null
  venueAddress?: string | null
  price?: string | null
  priceMin?: number | null
  priceMax?: number | null
  isFree?: boolean | null
  feesIncluded?: boolean | null
  latitude?: number | null
  longitude?: number | null
  description?: string | null
  lastVerifiedAt?: Date | string | null
}

/**
 * A source refresh may replace a value with a new one it actually published.
 * It may not wipe a reliable value with a blank, a TBA, or a non-street address.
 */
export function guardAgainstWeakerSource(existing: GuardRow, update: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...update }
  const incomingTime = reliableTime(next.time)
  const incomingEnd = reliableTime(next.endTime)
  const keptExistingTime = !incomingTime && !!reliableTime(existing.time)
  const keptExistingEnd = !incomingEnd && !!reliableTime(existing.endTime)
  if (keptExistingTime) delete next.time
  if (keptExistingEnd) delete next.endTime
  if (keptExistingTime || keptExistingEnd) {
    const sched = scheduleFields({
      date: existing.date,
      endDate: (next.endDate as Date | string | null | undefined) ?? existing.endDate,
      time: incomingTime ?? existing.time,
      endTime: incomingEnd ?? existing.endTime,
      city: existing.city,
      status: existing.status,
      source: existing.source,
      sources: existing.sources,
      isFree: existing.isFree === true,
      price: existing.price,
      title: existing.title ?? '',
      venueName: existing.venueName ?? '',
      venueAddress: existing.venueAddress,
      latitude: existing.latitude,
      lastVerifiedAt: existing.lastVerifiedAt,
    })
    next.timezone = sched.timezone
    next.allDay = sched.allDay
    next.startsAt = sched.startsAt
    next.endsAt = sched.endsAt
    next.confidenceScore = sched.confidenceScore
  }

  const incomingPrice = reliablePrice({
    price: typeof next.price === 'string' || next.price == null ? next.price as string | null : null,
    priceMin: typeof next.priceMin === 'number' ? next.priceMin : null,
    priceMax: typeof next.priceMax === 'number' ? next.priceMax : null,
    isFree: next.isFree === true,
  })
  if (!incomingPrice && reliablePrice(existing)) {
    delete next.price
    delete next.priceMin
    delete next.priceMax
    delete next.isFree
    delete next.feesIncluded
  }

  if (isStreetAddress(existing.venueAddress) && 'venueAddress' in next && !isStreetAddress(typeof next.venueAddress === 'string' ? next.venueAddress : null)) {
    delete next.venueAddress
  }
  if (typeof next.description === 'string' && keepStoredDescription(existing.description, next.description)) delete next.description
  if (existing.endDate && (next.endDate == null || next.endDate === '')) delete next.endDate
  if (existing.latitude != null && existing.longitude != null && ('latitude' in next || 'longitude' in next)) {
    const lat = typeof next.latitude === 'number' ? next.latitude : null
    const lng = typeof next.longitude === 'number' ? next.longitude : null
    if (usablePin(lat, lng, existing.city) == null) {
      delete next.latitude
      delete next.longitude
    }
  }
  return next
}
