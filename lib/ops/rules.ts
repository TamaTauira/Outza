/**
 * Pure auto-resolve rules. Callers load rows and apply effects.
 * Protests and rallies stay hidden. A bot never hard-deletes a row.
 */
import { isRally, listingModeration, needsModeration } from '@/lib/listing-moderation'
import { isFreeMail } from '@/lib/trust'
import { clamp01, type Ruling, type Thresholds, DEFAULT_THRESHOLDS } from '@/lib/ops/types'

export { DEFAULT_THRESHOLDS }

const HOST_SOURCE: [RegExp, string][] = [
  [/ticketmaster\./i, 'ticketmaster'],
  [/humanitix\./i, 'humanitix'],
  [/moshtix\./i, 'moshtix'],
  [/oztix\./i, 'oztix'],
  [/ticketek\./i, 'ticketek'],
  [/eventbrite\./i, 'eventbrite'],
  [/cityofsydney\.nsw\.gov\.au/i, 'cityofsydney'],
  [/brisbane\.qld\.gov\.au/i, 'brisbanecouncil'],
  [/frontiertouring\./i, 'frontier'],
]

export function sourceFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname.toLowerCase()
    return HOST_SOURCE.find(([re]) => re.test(host))?.[1] ?? null
  } catch {
    return null
  }
}

function act(action: string, reason: string, confidence: number, actor: 'bot:rules' | 'bot:ai' = 'bot:rules', extra: { highRisk?: boolean; patch?: Record<string, unknown> } = {}): Ruling {
  return { outcome: 'act', action, reason, confidence: clamp01(confidence), actor, ...extra }
}

function digest(summary: string, reason: string, confidence: number, approveAction: string, declineAction: string): Ruling {
  return { outcome: 'digest', summary, reason, confidence: clamp01(confidence), approveAction, declineAction }
}

export function ruleExpiredHidden(input: { past: boolean }): Ruling {
  if (!input.past) return { outcome: 'skip', reason: 'Listing is still upcoming.' }
  return act('close-audit', 'Event already past. The row stays in the database.', 1)
}

export function ruleMissingCoords(input: {
  hasPin: boolean
  geocoded: { lat: number; lng: number } | null
  failures: number
  centroid: { lat: number; lng: number } | null
}): Ruling {
  if (input.hasPin) return act('close-audit', 'A pin is already stored.', 0.99)
  if (input.geocoded) {
    return act('set-coords', 'Geocode placed the venue. The listing stays.', 0.88, 'bot:rules', {
      patch: { lat: input.geocoded.lat, lng: input.geocoded.lng },
    })
  }
  const failures = Math.max(0, input.failures)
  if (failures >= 3 && input.centroid) {
    return act('set-centroid', 'Geocode failed three times. Using the suburb centroid. The pin is approximate.', 0.62, 'bot:rules', {
      patch: { lat: input.centroid.lat, lng: input.centroid.lng },
    })
  }
  if (failures >= 3) {
    return digest(
      'No geocode and no suburb centroid. Approve closes the flag and leaves the listing unpinned. Decline leaves it in the queue.',
      'Could not place the venue.',
      0.3,
      'close-audit',
      'leave-open',
    )
  }
  return { outcome: 'skip', reason: 'Geocode will be tried again.' }
}

export type SourceFreshness = { source: string; refreshedAt: string | null }

export function ruleTimeConflict(input: {
  kind: 'sources' | 'hours'
  ticketUrl?: string | null
  organiserUrl?: string | null
  sources: SourceFreshness[]
  thresholds?: Thresholds
}): Ruling {
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS
  if (input.kind === 'hours') {
    return digest(
      'The start time sits outside the venue hours on file. Approve accepts the listing as stored. Decline closes the flag without changing the time.',
      'Venue hours and the listing time disagree.',
      0.35,
      'close-audit',
      'close-audit',
    )
  }
  const named = sourceFromUrl(input.organiserUrl) ?? sourceFromUrl(input.ticketUrl)
  const known = new Set(input.sources.map((row) => row.source.toLowerCase()))
  if (named && (known.size === 0 || known.has(named))) {
    return act('close-audit', `Kept the listing from ${named}, which matches the event's own link.`, 0.93, 'bot:rules', {
      patch: { source: named },
    })
  }
  const ranked = [...input.sources].filter((row) => row.refreshedAt).sort((a, b) => (
    new Date(b.refreshedAt ?? 0).getTime() - new Date(a.refreshedAt ?? 0).getTime()
  ))
  const newest = ranked[0]
  const previous = ranked[1]
  if (!newest?.refreshedAt) {
    return digest(
      'Two sources disagree and neither has a clear refresh time. Approve keeps the current listing. Decline closes the flag the same way.',
      'No source is clearly newer.',
      0.4,
      'close-audit',
      'close-audit',
    )
  }
  const gap = previous?.refreshedAt ? new Date(newest.refreshedAt).getTime() - new Date(previous.refreshedAt).getTime() : 86_400_000
  const confidence = gap >= 12 * 3600_000 ? 0.8 : 0.45
  if (confidence >= thresholds.timeConflict) {
    return act('close-audit', `Kept the more recently refreshed source (${newest.source}).`, confidence, 'bot:rules', {
      patch: { source: newest.source },
    })
  }
  return digest(
    `The newer source is ${newest.source}, but the refresh times are close. Approve keeps the current listing. Decline closes the flag without a source change.`,
    'Low confidence on which source to keep.',
    confidence,
    'close-audit',
    'close-audit',
  )
}

export function ruleDuplicateFlagged(input: { primaryPromoted: boolean; otherPromoted: boolean }): Ruling {
  if (input.primaryPromoted && input.otherPromoted) {
    return digest(
      'Both listings are promoted, so neither was merged. Approve keeps both and closes the flag. Decline hides the second as a duplicate of the first. You can undo that for 30 days.',
      'Both listings are promoted.',
      0.4,
      'keep-both',
      'link-duplicate',
    )
  }
  return act('keep-both', 'Kept both listings. One is organiser-owned or promoted, so they were not merged.', 0.97)
}

export function ruleDuplicateReview(input: { score: number | null; thresholds?: Thresholds }): Ruling {
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS
  if (input.score == null || !Number.isFinite(input.score)) {
    return digest(
      'The model did not score this pair. Approve links the second listing as a duplicate and keeps the row. Decline leaves both public and closes the flag.',
      'No similarity score.',
      0.5,
      'link-duplicate',
      'dismiss-duplicate',
    )
  }
  const score = clamp01(input.score)
  if (score >= thresholds.duplicateLink) {
    return act('link-duplicate', `Same listing (similarity ${score.toFixed(2)}). The duplicate row stays in the database and drops off public boards.`, score, 'bot:ai')
  }
  if (score <= thresholds.duplicateDismiss) {
    return act('dismiss-duplicate', `Not the same listing (similarity ${score.toFixed(2)}). Both stay public.`, score, 'bot:ai')
  }
  return digest(
    `Similarity ${score.toFixed(2)} is between the thresholds. Approve links the second listing as a duplicate. Decline leaves both public.`,
    'Similarity is not decisive.',
    score,
    'link-duplicate',
    'dismiss-duplicate',
  )
}

export type HeldAi = { label: 'harm' | 'rally' | 'ordinary' | 'unsure'; confidence: number; highRisk?: boolean } | null

export function ruleHeldEvent(input: {
  title: string
  description?: string | null
  past: boolean
  ai?: HeldAi
  thresholds?: Thresholds
}): Ruling {
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS
  if (input.past) return act('close-past', 'Past-dated held listing. It stays hidden and leaves the review pile.', 0.99)
  if (needsModeration(input.title, input.description)) {
    return act('keep-hidden', 'Hate, violence, weapons, self-harm, or a scam cue. The listing stays hidden.', 0.99, 'bot:rules', { highRisk: true })
  }
  if (isRally(input.title, input.description)) {
    return act('keep-hidden', 'Protests and rallies stay hidden.', 0.99)
  }
  const fresh = listingModeration(input.title, input.description)
  if (fresh.moderationStatus === 'hidden') {
    return act('keep-hidden', 'Junk or off-board wording. The listing stays hidden.', 0.9)
  }
  const ai = input.ai
  if (ai?.label === 'harm' || ai?.highRisk) {
    return act('keep-hidden', 'The model rated this high-risk. The listing stays hidden.', Math.max(ai.confidence, 0.9), 'bot:ai', { highRisk: true })
  }
  if (ai?.label === 'rally') return act('keep-hidden', 'The model read this as a protest or rally. It stays hidden.', ai.confidence, 'bot:ai')
  if (ai?.label === 'ordinary' && ai.confidence >= thresholds.heldApprove) {
    return act('publish', 'Ordinary class, trivia, talk, or similar. Publishing it.', ai.confidence, 'bot:ai')
  }
  if (ai && ai.label !== 'ordinary') {
    return digest(
      'The model was not confident. Approve publishes the listing. Decline keeps it hidden.',
      'Low confidence classification.',
      ai.confidence,
      'publish',
      'keep-hidden',
    )
  }
  if (ai?.label === 'ordinary') {
    return digest(
      'The model thinks this is ordinary, but the confidence is under the threshold. Approve publishes it. Decline keeps it hidden.',
      'Low confidence classification.',
      ai.confidence,
      'publish',
      'keep-hidden',
    )
  }
  if (!fresh.hidden && fresh.moderationStatus === 'approved') {
    return act('publish', 'Ordinary listing. The current filter would not hold it.', 0.94)
  }
  return digest(
    'A person needs to say whether this held listing is ordinary. Approve publishes it. Decline keeps it hidden.',
    'No model classification.',
    0.5,
    'publish',
    'keep-hidden',
  )
}

export type SourceLook = {
  ok: boolean
  cancelled?: boolean
  date?: string | null
  missing?: boolean
}

export function ruleEventReport(input: {
  reason: string
  source: SourceLook | null
  score?: number | null
  summary?: string | null
  thresholds?: Thresholds
}): Ruling {
  if (input.reason === 'DUPLICATE') return ruleDuplicateReview({ score: input.score ?? null, thresholds: input.thresholds })
  if (input.reason === 'OTHER') {
    const summary = (input.summary ?? '').trim() || 'A visitor described a problem that needs a person.'
    return digest(
      `${summary} Approve marks the report resolved. Decline dismisses it. The listing is unchanged either way.`,
      'Report needs a person.',
      0.4,
      'close-report-resolved',
      'close-report-dismissed',
    )
  }
  if (!input.source || !input.source.ok) {
    return digest(
      'The source page could not be read. Approve marks the report resolved. Decline dismisses it.',
      'Source page was not available.',
      0.35,
      'close-report-resolved',
      'close-report-dismissed',
    )
  }
  if (input.reason === 'CANCELLED') {
    if (input.source.cancelled || input.source.missing) {
      return act('set-status', 'The source page confirms the listing is cancelled or gone.', 0.92, 'bot:rules', { patch: { status: 'CANCELLED' } })
    }
    return act('close-report-dismissed', 'Source still shows the original listing.', 0.9)
  }
  if (input.reason === 'WRONG_DATE') {
    if (input.source.date) {
      return act('set-date', 'The source page shows a different date. Updating the listing to that date.', 0.86, 'bot:rules', { patch: { date: input.source.date } })
    }
    return act('close-report-dismissed', 'Source still shows the original date.', 0.88)
  }
  if (input.reason === 'BROKEN_LINK') {
    if (input.source.missing) return act('close-report-resolved', 'The source page is gone. The listing stays in the database.', 0.84)
    return act('close-report-dismissed', 'Source still shows the original page.', 0.9)
  }
  return digest(
    'This report is outside the automatic checks. Approve marks it resolved. Decline dismisses it.',
    'Unhandled report reason.',
    0.3,
    'close-report-resolved',
    'close-report-dismissed',
  )
}

export function ruleClaim(input: {
  email: string
  organiserUrls: (string | null | undefined)[]
  emailVerified: boolean
  hasEvidence: boolean
  dispute: boolean
  promoted: boolean
  domainMatches: boolean
}): Ruling {
  if (input.dispute || input.promoted) {
    return digest(
      input.dispute
        ? 'This is a dispute about who manages the listing. Approve grants the claim. Decline rejects it.'
        : 'This listing is promoted or paid. Approve grants the claim. Decline rejects it.',
      input.dispute ? 'Dispute stays with a person.' : 'Paid listing stays with a person.',
      0.3,
      'approve-claim',
      'reject-claim',
    )
  }
  const hostMatches = input.domainMatches || organiserHostMatches(input.email, input.organiserUrls)
  if (hostMatches || input.emailVerified) {
    const why = input.emailVerified ? 'A verification code was used for this claim.' : 'The claimant domain matches the organiser link.'
    return act('approve-claim', why, 0.93)
  }
  if (isFreeMail(input.email) && !input.hasEvidence) {
    return act('request-evidence', 'Free-mail address with no evidence. Asking for evidence. No template is sent until one is approved.', 0.8)
  }
  return digest(
    'The claim does not match a work domain or a used verification code. Approve grants it. Decline rejects it.',
    'Claim needs a person.',
    0.45,
    'approve-claim',
    'reject-claim',
  )
}

function organiserHostMatches(email: string, urls: (string | null | undefined)[]): boolean {
  if (isFreeMail(email)) return false
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return false
  return urls.some((url) => {
    const source = sourceFromUrl(url)
    if (source) return false
    try {
      const host = new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '')
      return host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`)
    } catch {
      return false
    }
  })
}

export const SAFE_VENUE_FIELDS = new Set([
  'hoursNote', 'openTime', 'closeTime', 'description', 'website', 'instagram', 'facebook', 'gettingThere', 'announcement',
])

export const IMAGE_VENUE_FIELDS = new Set(['logoUrl', 'photos'])

export function ruleVenueProfile(input: { field: string; verifiedManager: boolean; imageSuspect: boolean }): Ruling {
  const field = input.field
  if (!input.verifiedManager) {
    return digest(
      `Change to ${field} is not from a verified manager. Approve applies it. Decline rejects it.`,
      'Manager is not verified.',
      0.4,
      'apply-venue-field',
      'reject-venue-change',
    )
  }
  if (IMAGE_VENUE_FIELDS.has(field)) {
    if (input.imageSuspect) {
      return digest(
        'The image looks like a placeholder or a suspect asset. Approve applies it anyway. Decline rejects it.',
        'Suspect image.',
        0.35,
        'apply-venue-field',
        'reject-venue-change',
      )
    }
    return act('apply-venue-field', `Verified manager updated ${field}. The image check passed.`, 0.86)
  }
  if (SAFE_VENUE_FIELDS.has(field)) {
    return act('apply-venue-field', `Verified manager updated ${field}.`, 0.9)
  }
  return digest(
    `Change to ${field} (name, address, or another sensitive field). Approve applies it. Decline rejects it.`,
    'Sensitive venue field.',
    0.4,
    'apply-venue-field',
    'reject-venue-change',
  )
}

/** Historical rows stay untouched until a person approves the backlog run. */
export function shouldResolveExisting(createdAt: Date, liveSince: Date, allowBacklog: boolean): boolean {
  if (allowBacklog) return true
  return createdAt.getTime() >= liveSince.getTime()
}
