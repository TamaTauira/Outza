/**
 * Venue management and event ownership.
 * Pure rules only. Server routes call these and then read or write the database.
 * Venue rights and event rights are separate. Event.venueId is a location, never a grant.
 * A model score is never an ownership decision.
 */

export const VENUE_ROLES = ['ADMINISTRATOR', 'MANAGER'] as const
export type VenueRole = (typeof VENUE_ROLES)[number]

export const VERIFICATION_METHODS = ['BUSINESS_EMAIL', 'EXISTING_ORG', 'MANUAL', 'TRUSTED_SOURCE'] as const
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number]

export const OVERRIDE_FIELDS = [
  'title', 'description', 'date', 'time', 'endTime', 'venueName', 'venueAddress', 'status', 'price', 'category',
] as const
export type OverrideField = (typeof OVERRIDE_FIELDS)[number]

export const MATERIAL_FIELDS = ['date', 'time', 'endTime', 'venueName', 'venueAddress', 'status'] as const

export const ORGANISER_UPDATE_TITLE = 'Organiser update'
export const ORGANISER_UPDATE_BODY =
  'This event information has been updated directly by the event organiser on VibePeep and may differ from the original listing.'

export const VENUE_MANAGED_LABEL = 'Managed by the venue'

/** Plain-language copy for the claimed tick. No accuracy promise, and no “verified” wording. */
export const CLAIMED_TICK_COPY = {
  venue: {
    label: 'Claimed by the venue',
    body: 'Someone claimed this venue and VibePeep checked the claim. It means the profile is looked after by the venue. It is not a guarantee that every detail is accurate.',
  },
  organiser: {
    label: 'Claimed by the organiser',
    body: 'Someone claimed this organiser and VibePeep checked the claim. It means they are allowed to speak for the listing. It is not a guarantee that every detail is accurate.',
  },
} as const

export const MANAGE_VENUE_LABEL = 'Manage this Venue'
export const MANAGE_VENUE_BLURB =
  'Own or manage this venue? Claim your free profile to update venue information, view upcoming events and understand how people discover your venue.'

export const MANAGE_EVENT_LABEL = 'Manage this event'
export const MANAGE_EVENT_BLURB =
  'Are you the organiser? Verify your connection to this event to update its details and view performance.'

export const SOURCE_FIRST_HEADING = 'Keep your event details in sync'
export const SOURCE_FIRST_BODY =
  'We recommend updating your event details at the original event source. This helps keep information consistent across VibePeep and other places where your event appears. Once the original source updates, VibePeep will automatically refresh your listing when new information becomes available.'

export const DIRECT_EDIT_TITLE = 'Editing directly in VibePeep'
export const DIRECT_EDIT_BODY =
  'Your changes will appear on VibePeep but may not match the details shown at the original event source. For consistency across platforms, we recommend updating the original source too.'

export const ANALYTICS_CAVEAT = 'Digital views and clicks do not prove physical attendance.'
export const SPONSORED_LABEL = 'Sponsored'

const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|bigpond|optusnet|tpg|iinet|internode)\./i
const LISTING_HOSTS = /(ticketmaster|ticketek|eventbrite|humanitix|moshtix|oztix|trybooking|stickytickets|facebook|instagram|linktr)\./i

export function ownershipUiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env.OWNERSHIP_UI ?? env.VENUE_MANAGEMENT ?? env.NEXT_PUBLIC_OWNERSHIP_UI
  if (raw == null || raw === '') return true
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}

/** No paid identity vendor. Email codes use the existing mail transport. */
export function usesPaidVerificationProvider(): false {
  return false
}

export function isGenericMailbox(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return !domain || FREE_MAIL.test(domain)
}

export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean)
  if (parts.length < 2) return parts.join('.')
  const n = /^(com|org|net|gov|edu|asn|id)$/.test(parts[parts.length - 2] ?? '') && parts[parts.length - 1]?.length === 2 ? 3 : 2
  return parts.slice(-n).join('.')
}

/** Domain possession is not enough for government, education, or ticket-seller hosts. */
export function domainAloneInsufficient(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, '')
  if (d.endsWith('.gov.au') || d.endsWith('.edu.au')) return true
  if (LISTING_HOSTS.test(d)) return true
  return false
}

export function emailMatchesOfficialDomain(email: string, officialDomain: string | null | undefined): boolean {
  if (!officialDomain || isGenericMailbox(email)) return false
  const mine = registrableDomain(email.split('@')[1] ?? '')
  const official = registrableDomain(officialDomain)
  if (!mine || !official || mine !== official) return false
  if (domainAloneInsufficient(official)) return false
  return true
}

export type MembershipRow = {
  userId: string
  organisationId: string
  role: string
  status: string
  revokedAt?: Date | string | null
}

export type VenueGrantRow = {
  venueId: string
  organisationId: string
  permissionScope: string
  status: string
  revokedAt?: Date | string | null
}

export type EventGrantRow = {
  eventId: string
  organisationId: string
  status: string
  revokedAt?: Date | string | null
}

function live(status: string, revokedAt?: Date | string | null, now = Date.now()): boolean {
  if (status !== 'ACTIVE' && status !== 'APPROVED') return false
  if (!revokedAt) return true
  return new Date(revokedAt).getTime() > now
}

function narrower(membershipRole: string, grantScope: string): VenueRole | null {
  const member = membershipRole === 'ADMINISTRATOR' || membershipRole === 'MANAGER' ? membershipRole : null
  const grant = grantScope === 'ADMINISTRATOR' || grantScope === 'MANAGER' ? grantScope : null
  if (!member || !grant) return null
  if (member === 'MANAGER' || grant === 'MANAGER') return 'MANAGER'
  return 'ADMINISTRATOR'
}

/**
 * True only for an active organisation membership plus an approved venue grant.
 * Admin accounts do not skip this. Event grants are ignored.
 */
export function evaluateVenueAccess(input: {
  userId: string
  venueId: string
  memberships: MembershipRow[]
  grants: VenueGrantRow[]
  now?: number
}): { allowed: boolean; role: VenueRole | null; organisationId: string | null } {
  const now = input.now ?? Date.now()
  let best: { role: VenueRole; organisationId: string } | null = null
  for (const grant of input.grants) {
    if (grant.venueId !== input.venueId) continue
    if (!live(grant.status, grant.revokedAt, now)) continue
    const membership = input.memberships.find((m) => m.userId === input.userId && m.organisationId === grant.organisationId && live(m.status, m.revokedAt, now))
    if (!membership) continue
    const role = narrower(membership.role, grant.permissionScope)
    if (!role) continue
    if (!best || (role === 'ADMINISTRATOR' && best.role !== 'ADMINISTRATOR')) {
      best = { role, organisationId: grant.organisationId }
    }
  }
  return { allowed: !!best, role: best?.role ?? null, organisationId: best?.organisationId ?? null }
}

export type VenueAction = 'editProfile' | 'editSensitive' | 'viewAnalytics' | 'viewEvents' | 'reportEvent' | 'manageTeam' | 'grantAdmin' | 'transferOwnership' | 'configureAds'

const MANAGER_ACTIONS: VenueAction[] = ['editProfile', 'viewAnalytics', 'viewEvents', 'reportEvent']

export function venueRoleAllows(role: VenueRole | null, action: VenueAction): boolean {
  if (!role) return false
  if (action === 'grantAdmin' || action === 'transferOwnership') return false
  if (role === 'ADMINISTRATOR') return true
  return MANAGER_ACTIONS.includes(action)
}

/**
 * Explicit event rights only: the listing promoter, an approved event grant, or a VibePeep admin.
 * Venue grants are not read.
 */
export function evaluateEventAccess(input: {
  userId: string
  eventId: string
  promoterId?: string | null
  isAdmin?: boolean
  memberships?: MembershipRow[]
  grants?: EventGrantRow[]
  now?: number
}): { allowed: boolean; via: 'promoter' | 'grant' | 'admin' | null } {
  if (input.promoterId && input.promoterId === input.userId) return { allowed: true, via: 'promoter' }
  const now = input.now ?? Date.now()
  const grants = input.grants ?? []
  const memberships = input.memberships ?? []
  const viaGrant = grants.some((grant) => {
    if (grant.eventId !== input.eventId || !live(grant.status, grant.revokedAt, now)) return false
    return memberships.some((m) => m.userId === input.userId && m.organisationId === grant.organisationId && m.role !== 'MANAGER' && m.role !== '' && live(m.status, m.revokedAt, now) && (m.role === 'ORGANISER' || m.role === 'ADMINISTRATOR'))
  })
  if (viaGrant) return { allowed: true, via: 'grant' }
  if (input.isAdmin) return { allowed: true, via: 'admin' }
  return { allowed: false, via: null }
}

export type ClaimedOrganiserRow = {
  grantStatus: string
  grantRevokedAt?: Date | string | null
  organisationType: string
  verificationStatus: string
  memberships: { userId: string; role: string; status: string; revokedAt?: Date | string | null }[]
}

/**
 * The public tick beside an organiser name. True only when this listing’s promoter
 * still has a live organiser membership on an approved grant for a checked organisation.
 */
export function claimedOrganiserVisible(promoterId: string | null | undefined, rows: ClaimedOrganiserRow[], now = Date.now()): boolean {
  if (!promoterId) return false
  return rows.some((row) => {
    if (row.organisationType !== 'ORGANISER' || row.verificationStatus !== 'VERIFIED') return false
    if (!live(row.grantStatus, row.grantRevokedAt, now)) return false
    return row.memberships.some((membership) => (
      membership.userId === promoterId
      && (membership.role === 'ORGANISER' || membership.role === 'ADMINISTRATOR')
      && live(membership.status, membership.revokedAt, now)
    ))
  })
}

export function authorizeEventMutation(allowed: boolean): { ok: boolean; log: boolean } {
  return { ok: allowed, log: !allowed }
}

export function authorizeVenueMutation(allowed: boolean): { ok: boolean; log: boolean } {
  return { ok: allowed, log: !allowed }
}

export type ClaimOutcome = 'APPROVE' | 'EMAIL_CHALLENGE' | 'REVIEW' | 'DISPUTE'

export type ClaimDecision = {
  outcome: ClaimOutcome
  method: VerificationMethod
  simplified: boolean
  reason: string
}

function ignoreScore(decision: ClaimDecision, aiScore?: number | null): ClaimDecision {
  void aiScore
  return decision
}

export function assessVenueClaim(input: {
  officialDomain?: string | null
  applicantEmail?: string | null
  applicantWebsite?: string | null
  emailProved?: boolean
  largeOrganisation?: boolean
  existingVerifiedOrgRelationship?: boolean
  claimedByOther?: boolean
  aiScore?: number | null
}): ClaimDecision {
  void input.applicantWebsite
  if (input.claimedByOther) {
    return ignoreScore({ outcome: 'DISPUTE', method: 'MANUAL', simplified: false, reason: 'This venue already has a verified manager. Ask for access or report a dispute.' }, input.aiScore)
  }
  if (input.existingVerifiedOrgRelationship) {
    return ignoreScore({ outcome: 'APPROVE', method: 'EXISTING_ORG', simplified: true, reason: 'This account already manages a verified organisation linked to the venue.' }, input.aiScore)
  }
  const email = input.applicantEmail ?? ''
  const domainOk = emailMatchesOfficialDomain(email, input.officialDomain)
  if (input.largeOrganisation || (input.officialDomain && domainAloneInsufficient(input.officialDomain))) {
    return ignoreScore({ outcome: 'REVIEW', method: 'MANUAL', simplified: false, reason: 'A matching email domain is not enough for this organisation. A person reviews the claim.' }, input.aiScore)
  }
  if (domainOk && input.emailProved) {
    return ignoreScore({ outcome: 'APPROVE', method: 'BUSINESS_EMAIL', simplified: false, reason: 'The claimant opened a one-time link sent to the venue’s official domain.' }, input.aiScore)
  }
  if (domainOk) {
    return ignoreScore({ outcome: 'EMAIL_CHALLENGE', method: 'BUSINESS_EMAIL', simplified: false, reason: 'Send a one-time link to the official domain. The claim stays pending until it is opened.' }, input.aiScore)
  }
  return ignoreScore({ outcome: 'REVIEW', method: 'MANUAL', simplified: false, reason: 'Public venue details and an address typed into the form do not prove authority.' }, input.aiScore)
}

export function assessEventClaim(input: {
  emailDomainMatches?: boolean
  existingVerifiedOrgLinked?: boolean
  nameSimilarityOnly?: boolean
  sameVenueOnly?: boolean
  claimedByOther?: boolean
  trustedSourceLink?: boolean
  aiScore?: number | null
}): ClaimDecision {
  if (input.claimedByOther && !input.existingVerifiedOrgLinked && !input.trustedSourceLink) {
    return ignoreScore({ outcome: 'REVIEW', method: 'MANUAL', simplified: false, reason: 'Another organiser already manages this listing.' }, input.aiScore)
  }
  if (input.trustedSourceLink) {
    return ignoreScore({ outcome: 'APPROVE', method: 'TRUSTED_SOURCE', simplified: true, reason: 'A verified connection to the original event source confirms this account manages the event.' }, input.aiScore)
  }
  if (input.existingVerifiedOrgLinked && !input.nameSimilarityOnly && !input.sameVenueOnly) {
    return ignoreScore({ outcome: 'APPROVE', method: 'EXISTING_ORG', simplified: true, reason: 'This verified organiser is already linked to the event’s official domain.' }, input.aiScore)
  }
  if ((input.nameSimilarityOnly || input.sameVenueOnly) && !input.emailDomainMatches && !input.existingVerifiedOrgLinked) {
    return ignoreScore({ outcome: 'REVIEW', method: 'MANUAL', simplified: false, reason: 'A similar name, a shared venue, or free-text organiser text is not ownership.' }, input.aiScore)
  }
  if (input.emailDomainMatches) {
    return ignoreScore({ outcome: 'APPROVE', method: 'BUSINESS_EMAIL', simplified: false, reason: 'The signed-in email uses the same domain as the event’s own website.' }, input.aiScore)
  }
  return ignoreScore({ outcome: 'REVIEW', method: 'MANUAL', simplified: false, reason: 'Knowing the public listing is not enough. The claim waits for review.' }, input.aiScore)
}

export function finalOwnershipDecision(rules: ClaimDecision, aiScore?: number | null): ClaimDecision {
  return ignoreScore(rules, aiScore)
}

export type OverrideRow = {
  fieldName: string
  overrideValue: string
  originalSourceValue: string | null
  active?: boolean
}

export type RefreshPlan = {
  eventPatch: Record<string, string | null>
  snapshots: { fieldName: string; originalSourceValue: string | null; deactivate: boolean }[]
  materialConflict: 'SOURCE_CANCELLED' | null
  history: { fieldName: string; action: string; previousValue: string | null; updatedValue: string | null }[]
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/** Imports refresh source fields that have no active override. Overridden fields stay as the organiser left them. */
export function planSourceRefresh(input: {
  current: Record<string, string | null | undefined>
  incoming: Record<string, string | null | undefined>
  overrides: OverrideRow[]
}): RefreshPlan {
  const active = input.overrides.filter((row) => row.active !== false)
  const eventPatch: Record<string, string | null> = {}
  const snapshots: RefreshPlan['snapshots'] = []
  const history: RefreshPlan['history'] = []
  let materialConflict: RefreshPlan['materialConflict'] = null

  for (const [field, raw] of Object.entries(input.incoming)) {
    if (raw === undefined) continue
    const incoming = raw ?? null
    const row = active.find((item) => item.fieldName === field)
    if (!row) {
      if (field === 'status' && incoming === 'CANCELLED' && norm(input.current.status) !== 'cancelled' && active.length) {
        materialConflict = 'SOURCE_CANCELLED'
        history.push({ fieldName: 'status', action: 'CONFLICT', previousValue: input.current.status ?? null, updatedValue: incoming })
        continue
      }
      eventPatch[field] = incoming
      continue
    }
    const same = norm(incoming) === norm(row.overrideValue)
    snapshots.push({ fieldName: field, originalSourceValue: incoming, deactivate: same })
    if (same) {
      history.push({ fieldName: field, action: 'CLEAR_MATCH', previousValue: row.originalSourceValue, updatedValue: incoming })
    } else {
      history.push({ fieldName: field, action: 'SOURCE_SNAPSHOT', previousValue: row.originalSourceValue, updatedValue: incoming })
    }
    if (field === 'status' && incoming === 'CANCELLED' && norm(row.overrideValue) !== 'cancelled') {
      materialConflict = 'SOURCE_CANCELLED'
      history.push({ fieldName: field, action: 'CONFLICT', previousValue: row.overrideValue, updatedValue: incoming })
    }
  }

  return { eventPatch, snapshots, materialConflict, history }
}

export function needsMaterialConfirm(field: string, before: string | null, after: string | null): boolean {
  if (!MATERIAL_FIELDS.includes(field as (typeof MATERIAL_FIELDS)[number])) return false
  return norm(before) !== norm(after)
}

export function applyOverride(input: {
  current: Record<string, string | null>
  field: string
  value: string
  existing: OverrideRow | null
  confirmed?: boolean
}): { ok: true; eventValue: string; row: OverrideRow; historyAction: string } | { ok: false; error: string } {
  if (!OVERRIDE_FIELDS.includes(input.field as OverrideField)) return { ok: false, error: 'That field can’t be overridden.' }
  const before = input.current[input.field] ?? null
  if (needsMaterialConfirm(input.field, before, input.value) && !input.confirmed) {
    return { ok: false, error: 'Confirm this change to the date, time, location, or cancellation status before publishing.' }
  }
  if (norm(before) === norm(input.value)) return { ok: false, error: 'That already matches the listing.' }
  const original = input.existing?.originalSourceValue ?? before
  return {
    ok: true,
    eventValue: input.value,
    row: { fieldName: input.field, overrideValue: input.value, originalSourceValue: original, active: true },
    historyAction: 'SET',
  }
}

export function restoreField(input: { field: string; row: OverrideRow | null; current: string | null }): {
  eventValue: string | null
  active: boolean
  historyAction: 'RESTORE'
} | null {
  if (!input.row || input.row.active === false) return null
  if (input.row.fieldName !== input.field) return null
  return { eventValue: input.row.originalSourceValue, active: false, historyAction: 'RESTORE' }
}

export function publicOrganiserNotice(overrides: OverrideRow[], updatedAt?: string | null): {
  title: string
  body: string
  updatedAt: string | null
  fields: string[]
} | null {
  const active = overrides.filter((row) => row.active !== false)
  if (!active.length) return null
  return {
    title: ORGANISER_UPDATE_TITLE,
    body: ORGANISER_UPDATE_BODY,
    updatedAt: updatedAt ?? null,
    fields: active.map((row) => row.fieldName),
  }
}

export function materialCaution(conflict: string | null | undefined): string | null {
  if (conflict === 'SOURCE_CANCELLED') {
    return 'The original source reports this event as cancelled. We’re checking that with the organiser before treating the listing as confirmed.'
  }
  if (conflict) return 'The original source disagrees with an organiser update on a detail that could change someone’s plans. We’re checking it.'
  return null
}

export type EditChoice = {
  heading: string
  body: string
  primary: { label: string; href: string | null; kind: 'edit' | 'view' }
  secondary: { label: 'Edit Directly in VibePeep' }
  direct: { title: string; body: string; continueLabel: 'Continue Editing'; sourceLabel: string }
}

export function editChoices(source: { sourceUrl?: string | null; managementUrl?: string | null }): EditChoice {
  const management = usableHttp(source.managementUrl)
  const listing = usableHttp(source.sourceUrl)
  const primary = management
    ? { label: 'Update at Original Source', href: management, kind: 'edit' as const }
    : { label: 'View Original Event', href: listing, kind: 'view' as const }
  return {
    heading: SOURCE_FIRST_HEADING,
    body: SOURCE_FIRST_BODY,
    primary,
    secondary: { label: 'Edit Directly in VibePeep' },
    direct: {
      title: DIRECT_EDIT_TITLE,
      body: DIRECT_EDIT_BODY,
      continueLabel: 'Continue Editing',
      sourceLabel: management ? 'Go to Original Source' : 'View Original Event',
    },
  }
}

function usableHttp(value?: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}

/** One notice, then the editor. The warning is not a stack of screens. */
export function directEditSteps(acknowledged: boolean): Array<'notice' | 'editor'> {
  return acknowledged ? ['editor'] : ['notice', 'editor']
}

export function fieldDiffs(source: Record<string, string | null>, displayed: Record<string, string | null>, fields: string[]): Array<{ field: string; source: string | null; displayed: string | null }> {
  return fields.map((field) => ({ field, source: source[field] ?? null, displayed: displayed[field] ?? null }))
}

const SENSITIVE = new Set(['address', 'legalName', 'website', 'officialDomain'])

export function splitVenuePatch(fields: Record<string, string | null>): { immediate: Record<string, string | null>; review: Record<string, string | null> } {
  const immediate: Record<string, string | null> = {}
  const review: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE.has(key)) review[key] = value
    else immediate[key] = value
  }
  return { immediate, review }
}

const OPEN_FIELDS = new Set([
  'name', 'description', 'contactEmail', 'contactPhone', 'website', 'instagram', 'facebook', 'openingHours',
  'categories', 'facilities', 'accessibilityInfo', 'announcement', 'logoUrl', 'address', 'legalName',
])

export function validateVenueFields(input: Record<string, unknown>): { ok: true; fields: Record<string, string | null> } | { ok: false; error: string } {
  const fields: Record<string, string | null> = {}
  for (const [key, raw] of Object.entries(input)) {
    if (!OPEN_FIELDS.has(key)) continue
    if (raw == null) {
      fields[key] = null
      continue
    }
    const text = String(raw).trim().replace(/\s+/g, ' ')
    if (!text) {
      fields[key] = null
      continue
    }
    if (text.length > 4000) return { ok: false, error: `${key} is too long.` }
    if (/[<>]/.test(text) && key !== 'description' && key !== 'accessibilityInfo' && key !== 'announcement') {
      return { ok: false, error: 'Leave out angle brackets.' }
    }
    if (['website', 'instagram', 'facebook', 'logoUrl'].includes(key)) {
      const url = usableHttp(text.startsWith('http') ? text : `https://${text}`)
      if (!url || !url.startsWith('https:')) return { ok: false, error: `${key} needs an https link.` }
      fields[key] = url
      continue
    }
    if (key === 'contactEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { ok: false, error: 'That email doesn’t look right.' }
    fields[key] = text.slice(0, key === 'description' || key === 'announcement' || key === 'accessibilityInfo' ? 4000 : 300)
  }
  return { ok: true, fields }
}

export function profileCompleteness(venue: Record<string, unknown>): number {
  const keys = ['name', 'description', 'address', 'website', 'contactEmail', 'openingHours', 'categories', 'accessibilityInfo', 'logoUrl']
  const filled = keys.filter((key) => {
    const value = venue[key]
    if (Array.isArray(value)) return value.length > 0
    return typeof value === 'string' && value.trim().length > 0
  }).length
  return Math.round((filled / keys.length) * 100)
}

export const VENUE_REPORT_REASONS = [
  { key: 'NOT_HERE', label: 'This event is not taking place here' },
  { key: 'WRONG_TIME', label: 'Incorrect event date or time' },
  { key: 'CANCELLED', label: 'This event has been cancelled' },
  { key: 'WRONG_LOCATION', label: 'Wrong venue location' },
  { key: 'DUPLICATE', label: 'Duplicate listing' },
  { key: 'OTHER', label: 'Other issue' },
] as const

export function applyVenueReport(input: { reason: string; event: { id: string; title: string; status: string } }): {
  event: { id: string; title: string; status: string }
  review: true
  caution: boolean
  changed: false
} {
  const caution = input.reason === 'NOT_HERE' || input.reason === 'CANCELLED' || input.reason === 'WRONG_LOCATION'
  return { event: { ...input.event }, review: true, caution, changed: false }
}

export function reportRateLimited(openReports: number): boolean {
  return openReports >= 3
}

export function claimRateLimited(recentClaims: number): boolean {
  return recentClaims >= 5
}

export function codeRateLimited(recentCodes: number): boolean {
  return recentCodes >= 3
}

export type VenueMetrics = {
  profileViews: number
  websiteClicks: number
  directionsClicks: number
  saves: number
  shares: number
  upcomingEvents: number
  eventViews: number
  caveat: string
}

export function venueAnalyticsView(input: {
  profileViews?: number
  websiteClicks?: number
  directionsClicks?: number
  saves?: number
  shares?: number
  upcomingEvents?: number
  eventViews?: number
  spend?: number
  campaignSpend?: number
  audience?: unknown
  conversions?: number
  revenue?: number
}): VenueMetrics {
  return {
    profileViews: input.profileViews ?? 0,
    websiteClicks: input.websiteClicks ?? 0,
    directionsClicks: input.directionsClicks ?? 0,
    saves: input.saves ?? 0,
    shares: input.shares ?? 0,
    upcomingEvents: input.upcomingEvents ?? 0,
    eventViews: input.eventViews ?? 0,
    caveat: ANALYTICS_CAVEAT,
  }
}

export function canSeeOrganiserAnalytics(canManageEvent: boolean): boolean {
  return canManageEvent
}

export function canSeeVenueAnalytics(canManageVenue: boolean): boolean {
  return canManageVenue
}

/** Platform totals count each event view once. Venue aggregates are a separate read of the same activity. */
export function platformTotal(events: Array<{ views?: number }>, extras?: { venueEventViews?: number }): number {
  void extras
  return events.reduce((sum, event) => sum + (event.views ?? 0), 0)
}

export const VENUE_PRODUCTS = [
  { id: 'FEATURED', name: 'Featured venue', days: 7, priceCents: 4900 },
  { id: 'MAP_PIN', name: 'Promoted map pin', days: 7, priceCents: 2900 },
  { id: 'CATEGORY', name: 'Local category sponsorship', days: 14, priceCents: 7900 },
  { id: 'BOOST', name: 'Weekend venue boost', days: 2, priceCents: 1900 },
  { id: 'PROFILE', name: 'Profile highlight', days: 30, priceCents: 9900 },
] as const

export type VenueProductId = (typeof VENUE_PRODUCTS)[number]['id']

export function venueProduct(id: string) {
  return VENUE_PRODUCTS.find((product) => product.id === id) ?? null
}

export function purchaseDoesNotChangeGrants<T>(grants: T[], _purchase: { product: string }): { grants: T[]; sponsoredLabel: typeof SPONSORED_LABEL } {
  return { grants, sponsoredLabel: SPONSORED_LABEL }
}

export function auditableAfterRevoke<T>(history: T[]): T[] {
  return history.slice()
}
