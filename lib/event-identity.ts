/**
 * Multi-layer duplicate decision used before a listing is created or merged.
 * Exact identifiers outrank text. Text never reaches the automatic-link band
 * on its own. These thresholds are design rules, not measured probabilities.
 */
import { usableUrl } from '@/lib/listing-link'
import { equivalentTitles, sharesStreet, venuesMatch } from '@/lib/place-match'
import { isSameEvent, normalizeTitle, normalizeVenue, similarity } from '@/lib/quality'
import { conflictingRooms, resolveVenueIdentity, sameVenueIdentity } from '@/lib/venue-identity'

/** Tracking parameters only. Session, product and event ids stay on the URL. */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'mc_cid', 'mc_eid', 'igshid', 'yclid',
  '_ga', '_gl', 'mkt_tok', 'fb_action_ids', 'fb_action_types', 'fb_source',
  'vero_id', '_hsenc', '_hsmi', 'hsa_cam', 'hsa_grp', 'hsa_mt', 'hsa_src',
  'hsa_ad', 'hsa_acc', 'hsa_net', 'hsa_kw', 'hsa_ver',
])

export const DUPLICATE_THRESHOLDS = {
  /** Automatic link only with a strong identifier and no material contradiction. */
  auto: 98,
  /** Automatic link only when an independent fact corroborates the title. */
  corroborate: 85,
  /** Below this, keep the listings apart. */
  review: 70,
} as const

const SESSION_MINUTES = 45

export type IdentityEvent = {
  title: string
  venueName: string
  city?: string | null
  date: string
  time?: string | null
  source?: string | null
  organiserName?: string | null
  externalId?: string | null
  url?: string | null
  address?: string | null
  status?: string | null
  price?: string | null
}

export type DuplicateAction = 'link' | 'review' | 'separate'

export type DuplicateDecision = {
  action: DuplicateAction
  confidence: number
  layer: 'exact_id' | 'exact_url' | 'title' | 'venue' | 'session' | 'date' | 'organiser' | 'address'
  reasons: string[]
  contradictions: string[]
}

const OWNERSHIP_KEYS = ['promoterId', 'venueId', 'duplicateOfId', 'organiserEditedAt', 'manageTokenHash', 'contactEmail', 'claims'] as const

/** A source link may fill public listing fields. It must not move ownership. */
export function assertNoOwnershipTransfer(patch: Record<string, unknown>) {
  for (const key of OWNERSHIP_KEYS) {
    if (key in patch) throw new Error(`source link cannot set ${key}`)
  }
}

export function canonicalizeListingUrl(raw?: string | null): string | null {
  const url = usableUrl(raw)
  if (!url) return null
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.pathname === '/' || /\/search\b/i.test(parsed.pathname)) return null
  parsed.hash = ''
  const kept = [...parsed.searchParams.entries()].filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
  kept.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  parsed.search = ''
  for (const [key, value] of kept) parsed.searchParams.append(key, value)
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString()
}

function minutes(value?: string | null): number | null {
  const match = value?.match(/^(\d{1,2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function organiserAgrees(a?: string | null, b?: string | null): boolean {
  const left = (a ?? '').trim().toLowerCase()
  const right = (b ?? '').trim().toLowerCase()
  if (!left || !right) return true
  if (left === right || left.includes(right) || right.includes(left)) return true
  return similarity(left, right) >= 0.5
}

function normAddress(value?: string | null): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function decision(
  action: DuplicateAction,
  confidence: number,
  layer: DuplicateDecision['layer'],
  reasons: string[],
  contradictions: string[] = [],
): DuplicateDecision {
  return { action, confidence, layer, reasons, contradictions }
}

function band(score: number, corroborated: boolean, contradictions: string[], layer: DuplicateDecision['layer'], reasons: string[]): DuplicateDecision {
  if (contradictions.length && score < DUPLICATE_THRESHOLDS.auto) {
    if (score >= DUPLICATE_THRESHOLDS.review) return decision('review', score, layer, reasons, contradictions)
    return decision('separate', score, layer, reasons, contradictions)
  }
  if (score >= DUPLICATE_THRESHOLDS.auto && contradictions.length === 0) return decision('link', score, layer, reasons, contradictions)
  if (score >= DUPLICATE_THRESHOLDS.corroborate && corroborated && contradictions.length === 0) return decision('link', score, layer, reasons, contradictions)
  if (score >= DUPLICATE_THRESHOLDS.review) return decision('review', score, layer, reasons, contradictions)
  return decision('separate', score, layer, reasons, contradictions)
}

/**
 * Decide whether two listings are the same public event.
 * Same-source rows with different external ids stay separate, including extra sessions.
 * Recurring dates stay separate unless the external id says the record moved.
 */
export function decideDuplicate(a: IdentityEvent, b: IdentityEvent): DuplicateDecision {
  const reasons: string[] = []
  const sameSource = !!a.source && a.source === b.source
  const sameExternal = sameSource && !!a.externalId && a.externalId === b.externalId
  const urlA = canonicalizeListingUrl(a.url)
  const urlB = canonicalizeListingUrl(b.url)
  const sameUrl = !!urlA && urlA === urlB

  if (sameSource && a.externalId && b.externalId && a.externalId !== b.externalId) {
    return decision('separate', 15, 'exact_id', ['Different ids from the same source'])
  }
  if (sameExternal) {
    const moved = a.date !== b.date
    return decision('link', 100, 'exact_id', ['Same source id'], moved ? ['rescheduled'] : [])
  }
  if (a.date && b.date && a.date !== b.date) {
    if (sameUrl) return decision('review', 80, 'exact_url', ['Same listing URL on a different date'], ['date'])
    return decision('separate', 20, 'date', ['Different dates'])
  }
  if (!a.date || !b.date || a.date !== b.date) return decision('separate', 10, 'date', ['Missing date'])

  const venueA = resolveVenueIdentity(a.venueName, a.city)
  const venueB = resolveVenueIdentity(b.venueName, b.city)
  if (venueA && venueB && venueA.id !== venueB.id) {
    return decision('separate', 25, 'venue', ['Different canonical venues'])
  }
  if (conflictingRooms(venueA, venueB)) {
    return decision('separate', 30, 'venue', ['Different rooms in the same venue'])
  }

  const addressA = normAddress(a.address)
  const addressB = normAddress(b.address)
  const venueSim = similarity(normalizeVenue(a.venueName), normalizeVenue(b.venueName))
  const sharedAddress = !!addressA && addressA === addressB
  const ta = minutes(a.time)
  const tb = minutes(b.time)
  const titlesMatch = equivalentTitles(a.title, b.title)
  const timesEqual = ta != null && tb != null && ta === tb
  if (sharedAddress && !sameVenueIdentity(venueA, venueB) && venueSim < 0.5 && !(titlesMatch && timesEqual)) {
    return decision('separate', 35, 'address', ['Shared street address with different venue names'])
  }

  if (ta != null && tb != null && Math.abs(ta - tb) > SESSION_MINUTES) {
    const earlyTitle = similarity(normalizeTitle(a.title), normalizeTitle(b.title))
    const sameShow = earlyTitle >= 0.85 && (sameVenueIdentity(venueA, venueB) || venueSim >= 0.5)
    if (sameShow) return decision('separate', 40, 'session', ['Start times are different sessions'])
    return decision('separate', 30, 'title', ['Different listings'])
  }
  if (!organiserAgrees(a.organiserName, b.organiserName)) {
    return decision('separate', 45, 'organiser', ['Organiser names disagree'])
  }

  if (titlesMatch && timesEqual && (venuesMatch(a.venueName, b.venueName) || sharesStreet(
    { venueName: a.venueName, address: a.address },
    { venueName: b.venueName, address: b.address },
  ))) {
    const sameVenue = venuesMatch(a.venueName, b.venueName)
    return decision('link', 92, sameVenue ? 'venue' : 'address', [
      'Same title and start time',
      sameVenue ? 'Same venue' : 'Shared street',
    ])
  }

  if (sameSource && !isSameEvent(
    { title: a.title, venueName: a.venueName, time: a.time, source: a.source ?? undefined },
    { title: b.title, venueName: b.venueName, time: b.time, source: b.source ?? undefined },
  )) {
    return decision('separate', 40, 'title', ['Same source treats this as a different listing'])
  }

  if (sameUrl && (ta == null || tb == null || ta === tb)) {
    return decision('link', 99, 'exact_url', ['Same listing URL and session'], a.status && b.status && a.status !== b.status ? ['status'] : [])
  }

  const titleSim = similarity(normalizeTitle(a.title), normalizeTitle(b.title))
  let score = 0
  if (titleSim === 1) score += 40
  else if (titleSim >= 0.85) score += 34
  else if (titleSim >= 0.6) score += 24
  else score += 8
  reasons.push(`title ${titleSim.toFixed(2)}`)

  const canonical = sameVenueIdentity(venueA, venueB)
  if (canonical) score += 30
  else if (venueSim >= 0.5) score += 22
  else if (!normalizeVenue(a.venueName) || !normalizeVenue(b.venueName)) score += 8
  reasons.push(canonical ? 'canonical venue' : `venue ${venueSim.toFixed(2)}`)

  if (ta != null && tb != null && ta === tb) score += 20
  else if (ta != null && tb != null) score += 16
  else score += 8
  if (a.organiserName && b.organiserName) score += 8
  score = Math.min(97, score)

  const corroborated = canonical || (titleSim >= 0.85 && venueSim >= 0.5 && (ta == null || tb == null || Math.abs(ta - tb) <= SESSION_MINUTES))
  const result = band(score, corroborated, [], canonical ? 'venue' : 'title', reasons)
  if (a.status && b.status && a.status !== b.status) result.contradictions.push('status')
  return result
}

export type CatalogueAudit = {
  valid: number
  alreadyPresent: number
  confirmedNew: number
  additionalSessions: number
  enrichmentOpportunities: number
  uncertain: number
  cancelledOrOutdated: number
  /** Confirmed new occurrences divided by valid occurrences. Null when nothing was valid. */
  uniqueRate: number | null
}

function bestMatch(row: IdentityEvent, pool: IdentityEvent[]): { decision: DuplicateDecision; other: IdentityEvent } | null {
  let best: { decision: DuplicateDecision; other: IdentityEvent } | null = null
  for (const other of pool) {
    const found = decideDuplicate(row, other)
    if (!best || found.confidence > best.decision.confidence || (found.confidence === best.decision.confidence && found.action === 'link' && best.decision.action !== 'link')) {
      best = { decision: found, other }
    }
  }
  return best
}

function hasText(value?: string | null): boolean {
  return !!value && value.trim().length > 0
}

/**
 * Compare one source sample with listings already on the board.
 * Comparison is limited to the same calendar date. A later occurrence is a new row.
 */
export function compareCatalogue(source: IdentityEvent[], catalogue: IdentityEvent[]): CatalogueAudit {
  const byDate = new Map<string, IdentityEvent[]>()
  for (const row of catalogue) {
    const list = byDate.get(row.date) ?? []
    list.push(row)
    byDate.set(row.date, list)
  }
  const audit: CatalogueAudit = {
    valid: 0,
    alreadyPresent: 0,
    confirmedNew: 0,
    additionalSessions: 0,
    enrichmentOpportunities: 0,
    uncertain: 0,
    cancelledOrOutdated: 0,
    uniqueRate: null,
  }
  for (const row of source) {
    if (!row.title?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue
    if (row.status === 'CANCELLED' || row.status === 'POSTPONED' || row.status === 'RESCHEDULED') {
      audit.cancelledOrOutdated++
      continue
    }
    audit.valid++
    const pool = byDate.get(row.date) ?? []
    const found = bestMatch(row, pool)
    const match = found?.decision ?? null
    if (!match || match.action === 'separate') {
      if (match?.layer === 'session') audit.additionalSessions++
      audit.confirmedNew++
      continue
    }
    if (match.action === 'review') {
      audit.uncertain++
      continue
    }
    audit.alreadyPresent++
    const other = found?.other
    if (other && ((hasText(row.time) && !hasText(other.time)) || (hasText(row.address) && !hasText(other.address)) || (hasText(row.price) && !hasText(other.price)) || (hasText(row.url) && !hasText(other.url)))) {
      audit.enrichmentOpportunities++
    }
  }
  audit.uniqueRate = audit.valid ? audit.confirmedNew / audit.valid : null
  return audit
}
