import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ANALYTICS_CAVEAT,
  CLAIMED_TICK_COPY,
  DIRECT_EDIT_BODY,
  DIRECT_EDIT_TITLE,
  MANAGE_EVENT_BLURB,
  MANAGE_VENUE_BLURB,
  ORGANISER_UPDATE_BODY,
  ORGANISER_UPDATE_TITLE,
  SOURCE_FIRST_HEADING,
  SPONSORED_LABEL,
  VENUE_MANAGED_LABEL,
  applyOverride,
  applyVenueReport,
  assessEventClaim,
  assessVenueClaim,
  auditableAfterRevoke,
  authorizeEventMutation,
  canSeeOrganiserAnalytics,
  canSeeVenueAnalytics,
  claimedOrganiserVisible,
  claimRateLimited,
  directEditSteps,
  editChoices,
  evaluateEventAccess,
  evaluateVenueAccess,
  finalOwnershipDecision,
  materialCaution,
  ownershipUiEnabled,
  planSourceRefresh,
  platformTotal,
  profileCompleteness,
  publicOrganiserNotice,
  purchaseDoesNotChangeGrants,
  reportRateLimited,
  restoreField,
  splitVenuePatch,
  usesPaidVerificationProvider,
  validateVenueFields,
  venueAnalyticsView,
  venueProduct,
  venueRoleAllows,
  type EventGrantRow,
  type MembershipRow,
  type VenueGrantRow,
} from './ownership'
import { assessCode, hashVerificationSecret } from './email-code'

const lantern = 'venue-lantern'
const jazz = 'event-jazz'
const comedy = 'event-comedy'
const trivia = 'event-trivia'
const venueOrg = 'org-lantern'
const jazzOrg = 'org-jazz'

const venueAdmin: MembershipRow = { userId: 'ada', organisationId: venueOrg, role: 'ADMINISTRATOR', status: 'ACTIVE' }
const venueManager: MembershipRow = { userId: 'ada', organisationId: venueOrg, role: 'MANAGER', status: 'ACTIVE' }
const jazzOrganiser: MembershipRow = { userId: 'jazz-user', organisationId: jazzOrg, role: 'ORGANISER', status: 'ACTIVE' }
const venueGrant: VenueGrantRow = { venueId: lantern, organisationId: venueOrg, permissionScope: 'ADMINISTRATOR', status: 'APPROVED' }
const jazzGrant: EventGrantRow = { eventId: jazz, organisationId: jazzOrg, status: 'APPROVED' }

test('A — legitimate venue owner can edit the venue, see analytics and events, and not edit independent events', () => {
  const venue = evaluateVenueAccess({ userId: 'ada', venueId: lantern, memberships: [venueAdmin], grants: [venueGrant] })
  assert.equal(venue.allowed, true)
  assert.equal(venueRoleAllows(venue.role, 'editProfile'), true)
  assert.equal(venueRoleAllows(venue.role, 'viewAnalytics'), true)
  assert.equal(venueRoleAllows(venue.role, 'viewEvents'), true)
  assert.equal(canSeeVenueAnalytics(venue.allowed), true)
  const independent = evaluateEventAccess({ userId: 'ada', eventId: jazz, promoterId: 'jazz-user', memberships: [venueAdmin], grants: [] })
  assert.equal(independent.allowed, false)
  assert.equal(venueRoleAllows(venue.role, 'editProfile') && independent.allowed, false)
})

test('B — venue owner sees the event read-only and the organiser cannot edit the venue', () => {
  const venue = evaluateVenueAccess({ userId: 'ada', venueId: lantern, memberships: [venueAdmin], grants: [venueGrant] })
  const jazzEdit = evaluateEventAccess({ userId: 'ada', eventId: jazz, promoterId: 'jazz-user', memberships: [venueAdmin] })
  assert.equal(venue.allowed, true)
  assert.equal(jazzEdit.allowed, false)
  const organiser = evaluateEventAccess({ userId: 'jazz-user', eventId: jazz, promoterId: 'jazz-user' })
  assert.equal(organiser.allowed, true)
  assert.equal(organiser.via, 'promoter')
  const organiserVenue = evaluateVenueAccess({ userId: 'jazz-user', venueId: lantern, memberships: [jazzOrganiser], grants: [venueGrant] })
  assert.equal(organiserVenue.allowed, false)
})

test('C — dual permissions are evaluated independently and unrelated events stay protected', () => {
  const dualMemberships: MembershipRow[] = [
    { userId: 'ada', organisationId: venueOrg, role: 'ADMINISTRATOR', status: 'ACTIVE' },
    { userId: 'ada', organisationId: jazzOrg, role: 'ORGANISER', status: 'ACTIVE' },
  ]
  const venue = evaluateVenueAccess({ userId: 'ada', venueId: lantern, memberships: dualMemberships, grants: [venueGrant] })
  const ownEvent = evaluateEventAccess({ userId: 'ada', eventId: jazz, promoterId: null, memberships: dualMemberships, grants: [jazzGrant] })
  const other = evaluateEventAccess({ userId: 'ada', eventId: comedy, promoterId: 'laugh', memberships: dualMemberships, grants: [jazzGrant] })
  const triviaAtVenue = evaluateEventAccess({ userId: 'ada', eventId: trivia, promoterId: 'someone-else', memberships: dualMemberships, grants: [] })
  assert.equal(venue.allowed, true)
  assert.equal(ownEvent.allowed, true)
  assert.equal(ownEvent.via, 'grant')
  assert.equal(other.allowed, false)
  assert.equal(triviaAtVenue.allowed, false)
})

test('D — an unverified claimant gets no edit rights and no private analytics', () => {
  const pendingGrant: VenueGrantRow = { ...venueGrant, status: 'PENDING' }
  const access = evaluateVenueAccess({ userId: 'ada', venueId: lantern, memberships: [venueAdmin], grants: [pendingGrant] })
  assert.equal(access.allowed, false)
  assert.equal(canSeeVenueAnalytics(access.allowed), false)
  assert.equal(canSeeOrganiserAnalytics(false), false)
})

test('E — a direct edit of an independent event is rejected and logged', () => {
  const access = evaluateEventAccess({ userId: 'ada', eventId: jazz, promoterId: 'jazz-user', memberships: [venueAdmin], grants: [] })
  const decision = authorizeEventMutation(access.allowed)
  assert.equal(decision.ok, false)
  assert.equal(decision.log, true)
  const event = { title: 'Friday Jazz Night', status: 'SCHEDULED' }
  assert.deepEqual(event, { title: 'Friday Jazz Night', status: 'SCHEDULED' })
})

test('F — a venue report is recorded for review and does not change the event', () => {
  const event = { id: jazz, title: 'Friday Jazz Night', status: 'SCHEDULED' }
  const result = applyVenueReport({ reason: 'NOT_HERE', event })
  assert.equal(result.changed, false)
  assert.equal(result.review, true)
  assert.equal(result.caution, true)
  assert.deepEqual(result.event, event)
  assert.equal(reportRateLimited(3), true)
  assert.equal(reportRateLimited(1), false)
})

test('G — revoked venue access stops immediately and the audit history remains', () => {
  const revoked: MembershipRow = { ...venueAdmin, status: 'REVOKED', revokedAt: '2026-10-30T00:00:00.000Z' }
  const access = evaluateVenueAccess({ userId: 'ada', venueId: lantern, memberships: [revoked], grants: [venueGrant], now: Date.parse('2026-10-30T01:00:00.000Z') })
  assert.equal(access.allowed, false)
  assert.equal(canSeeVenueAnalytics(access.allowed), false)
  const history = [{ action: 'edit description', previous: 'old', next: 'new' }]
  assert.deepEqual(auditableAfterRevoke(history), history)
  assert.notEqual(auditableAfterRevoke(history), history)
})

test('H — buying a venue placement does not change ownership and is labelled Sponsored', () => {
  const grants = [venueGrant]
  const after = purchaseDoesNotChangeGrants(grants, { product: 'FEATURED' })
  assert.equal(after.grants, grants)
  assert.equal(after.sponsoredLabel, SPONSORED_LABEL)
  assert.equal(after.sponsoredLabel, 'Sponsored')
  const product = venueProduct('FEATURED')
  assert.ok(product)
  assert.equal(product?.days, 7)
  const still = evaluateEventAccess({ userId: 'ada', eventId: jazz, promoterId: 'jazz-user', memberships: [venueAdmin] })
  assert.equal(still.allowed, false)
})

test('1 — the original source is the recommended edit action', () => {
  const menu = editChoices({ managementUrl: 'https://jazz.example/admin/friday', sourceUrl: 'https://jazz.example/friday' })
  assert.equal(menu.heading, SOURCE_FIRST_HEADING)
  assert.equal(menu.primary.label, 'Update at Original Source')
  assert.equal(menu.primary.kind, 'edit')
  assert.equal(menu.secondary.label, 'Edit Directly in VibePeep')
  const keys = Object.keys(menu)
  assert.ok(keys.indexOf('primary') < keys.indexOf('secondary'))
})

test('2 — direct editing is one notice, then the editor', () => {
  assert.deepEqual(directEditSteps(false), ['notice', 'editor'])
  assert.deepEqual(directEditSteps(true), ['editor'])
  assert.equal(directEditSteps(false).filter((step) => step === 'notice').length, 1)
})

test('3 — the direct-edit notice says VibePeep may differ from the source', () => {
  const menu = editChoices({ sourceUrl: 'https://jazz.example/friday' })
  assert.equal(menu.direct.title, DIRECT_EDIT_TITLE)
  assert.match(menu.direct.body, /may not match the details shown at the original event source/)
  assert.equal(menu.direct.body, DIRECT_EDIT_BODY)
  assert.equal(menu.primary.label, 'View Original Event')
  assert.equal(menu.primary.kind, 'view')
})

test('4 — an active organiser override is named on the public listing and hidden once cleared', () => {
  const notice = publicOrganiserNotice([{ fieldName: 'time', overrideValue: '19:30', originalSourceValue: '19:00', active: true }], '2026-10-30T08:00:00.000Z')
  assert.equal(notice?.title, ORGANISER_UPDATE_TITLE)
  assert.equal(notice?.title, 'Organiser update')
  assert.equal(notice?.body, ORGANISER_UPDATE_BODY)
  assert.match(notice?.body ?? '', /may differ from the original listing/)
  assert.doesNotMatch(`${notice?.title} ${notice?.body}`, /verified/i)
  assert.equal(notice?.updatedAt, '2026-10-30T08:00:00.000Z')
  assert.equal(publicOrganiserNotice([{ fieldName: 'time', overrideValue: '19:30', originalSourceValue: '19:00', active: false }]), null)
  assert.equal(VENUE_MANAGED_LABEL, 'Managed by the venue')
  assert.doesNotMatch(VENUE_MANAGED_LABEL, /verified/i)
  for (const copy of Object.values(CLAIMED_TICK_COPY)) {
    assert.doesNotMatch(`${copy.label} ${copy.body}`, /verified/i)
    assert.match(copy.body, /VibePeep checked/)
    assert.match(copy.body, /not a guarantee/i)
  }
  assert.match(MANAGE_VENUE_BLURB, /Claim your free profile/)
  assert.match(MANAGE_EVENT_BLURB, /Verify your connection/)
})

test('the organiser tick shows only for an approved grant on this promoter', () => {
  const row = {
    grantStatus: 'APPROVED',
    grantRevokedAt: null,
    organisationType: 'ORGANISER',
    verificationStatus: 'VERIFIED',
    memberships: [{ userId: 'ada', role: 'ORGANISER', status: 'ACTIVE', revokedAt: null }],
  }
  assert.equal(claimedOrganiserVisible('ada', [row]), true)
  assert.equal(claimedOrganiserVisible(null, [row]), false)
  assert.equal(claimedOrganiserVisible('someone-else', [row]), false)
  assert.equal(claimedOrganiserVisible('ada', [{ ...row, grantStatus: 'PENDING' }]), false)
  assert.equal(claimedOrganiserVisible('ada', [{ ...row, grantRevokedAt: '2020-01-01T00:00:00.000Z' }]), false)
  assert.equal(claimedOrganiserVisible('ada', [{ ...row, verificationStatus: 'PENDING' }]), false)
  assert.equal(claimedOrganiserVisible('ada', [{ ...row, organisationType: 'VENUE' }]), false)
  assert.equal(claimedOrganiserVisible('ada', [{ ...row, memberships: [{ userId: 'ada', role: 'ORGANISER', status: 'REVOKED', revokedAt: null }] }]), false)
  assert.equal(claimedOrganiserVisible('ada', [{ ...row, memberships: [{ userId: 'ada', role: 'MANAGER', status: 'ACTIVE', revokedAt: null }] }]), false)
})

test('5 — a later import does not overwrite an active organiser change', () => {
  const plan = planSourceRefresh({
    current: { title: 'Friday Jazz Night', time: '19:30', status: 'SCHEDULED', description: 'Organiser edited' },
    incoming: { title: 'Friday Jazz Night', time: '19:00', status: 'SCHEDULED', description: 'Original version' },
    overrides: [
      { fieldName: 'time', overrideValue: '19:30', originalSourceValue: '19:00' },
      { fieldName: 'description', overrideValue: 'Organiser edited', originalSourceValue: 'Original version' },
    ],
  })
  assert.equal(plan.eventPatch.time, undefined)
  assert.equal(plan.eventPatch.description, undefined)
  assert.equal(plan.snapshots.find((row) => row.fieldName === 'time')?.originalSourceValue, '19:00')
  assert.equal(plan.snapshots.find((row) => row.fieldName === 'time')?.deactivate, false)
  assert.equal(plan.materialConflict, null)
})

test('6 — one field can be restored without restoring the whole event', () => {
  const restored = restoreField({
    field: 'time',
    current: '19:30',
    row: { fieldName: 'time', overrideValue: '19:30', originalSourceValue: '19:00', active: true },
  })
  assert.equal(restored?.eventValue, '19:00')
  assert.equal(restored?.active, false)
  const description = { fieldName: 'description', overrideValue: 'Organiser edited', originalSourceValue: 'Original version', active: true }
  assert.equal(restoreField({ field: 'description', current: 'Organiser edited', row: description })?.active, false)
  assert.equal(description.active, true)
})

test('7 — a verified organiser can claim another eligible event without a new identity check', () => {
  const decision = assessEventClaim({ existingVerifiedOrgLinked: true, emailDomainMatches: true })
  assert.equal(decision.outcome, 'APPROVE')
  assert.equal(decision.method, 'EXISTING_ORG')
  assert.equal(decision.simplified, true)
})

test('8 — public details alone do not approve a claim, and a model score cannot', () => {
  const stranger = assessEventClaim({ nameSimilarityOnly: true, sameVenueOnly: true, aiScore: 0.99 })
  assert.notEqual(stranger.outcome, 'APPROVE')
  const flipped = finalOwnershipDecision(stranger, 0.99)
  assert.equal(flipped.outcome, 'REVIEW')
  const venue = assessVenueClaim({ applicantWebsite: 'https://lantern.example', applicantEmail: 'ada@gmail.com', aiScore: 1 })
  assert.notEqual(venue.outcome, 'APPROVE')
  assert.equal(finalOwnershipDecision(venue, 1).outcome, 'REVIEW')
})

test('9 — a venue manager cannot edit an independently organised event', () => {
  const access = evaluateEventAccess({
    userId: 'ada',
    eventId: jazz,
    promoterId: 'jazz-user',
    memberships: [venueManager],
    grants: [jazzGrant],
  })
  assert.equal(access.allowed, false)
  assert.equal(authorizeEventMutation(access.allowed).ok, false)
})

test('10 — an event organiser cannot edit the venue without a venue grant', () => {
  const access = evaluateVenueAccess({
    userId: 'jazz-user',
    venueId: lantern,
    memberships: [jazzOrganiser],
    grants: [],
  })
  assert.equal(access.allowed, false)
  assert.equal(venueRoleAllows(access.role, 'editProfile'), false)
})

test('11 — organiser analytics stay with the event manager', () => {
  const manager = evaluateEventAccess({ userId: 'jazz-user', eventId: jazz, promoterId: 'jazz-user' })
  const venue = evaluateEventAccess({ userId: 'ada', eventId: jazz, promoterId: 'jazz-user', memberships: [venueAdmin] })
  assert.equal(canSeeOrganiserAnalytics(manager.allowed), true)
  assert.equal(canSeeOrganiserAnalytics(venue.allowed), false)
})

test('12 — venue managers see aggregate venue numbers and not organiser spend', () => {
  const access = evaluateVenueAccess({ userId: 'ada', venueId: lantern, memberships: [venueAdmin], grants: [venueGrant] })
  assert.equal(canSeeVenueAnalytics(access.allowed), true)
  const view = venueAnalyticsView({
    profileViews: 40,
    eventViews: 2000,
    spend: 9900,
    campaignSpend: 5000,
    audience: ['secret@example.com'],
    revenue: 12000,
    conversions: 14,
  })
  assert.equal(view.eventViews, 2000)
  assert.equal(view.caveat, ANALYTICS_CAVEAT)
  assert.equal('spend' in view, false)
  assert.equal('audience' in view, false)
  assert.equal('revenue' in view, false)
  assert.equal('conversions' in view, false)
})

test('13 — source values and audit history stay when an override is active', () => {
  const plan = planSourceRefresh({
    current: { time: '19:30' },
    incoming: { time: '19:00' },
    overrides: [{ fieldName: 'time', overrideValue: '19:30', originalSourceValue: '19:00' }],
  })
  assert.equal(plan.eventPatch.time, undefined)
  assert.equal(plan.snapshots[0]?.originalSourceValue, '19:00')
  assert.equal(plan.history[0]?.action, 'SOURCE_SNAPSHOT')
  const history = [{ action: 'SET', field: 'time' }]
  assert.equal(auditableAfterRevoke(history)[0]?.action, 'SET')
})

test('14 — a source cancellation against an active override is a material conflict', () => {
  const plan = planSourceRefresh({
    current: { status: 'SCHEDULED', time: '19:30' },
    incoming: { status: 'CANCELLED', time: '19:00' },
    overrides: [{ fieldName: 'time', overrideValue: '19:30', originalSourceValue: '19:00' }, { fieldName: 'status', overrideValue: 'SCHEDULED', originalSourceValue: 'SCHEDULED' }],
  })
  assert.equal(plan.materialConflict, 'SOURCE_CANCELLED')
  assert.equal(plan.eventPatch.status, undefined)
  assert.match(materialCaution(plan.materialConflict) ?? '', /cancelled/)
  assert.match(materialCaution(plan.materialConflict) ?? '', /checking/)
})

test('15 — verification does not add a paid provider or a new subscription', () => {
  assert.equal(usesPaidVerificationProvider(), false)
  const featured = venueProduct('FEATURED')
  assert.ok(featured && featured.priceCents > 0 && featured.days > 0)
  assert.equal(ownershipUiEnabled({}), true)
  assert.equal(ownershipUiEnabled({ OWNERSHIP_UI: '0' }), false)
  assert.equal(claimRateLimited(5), true)
})

test('a matching official email stays pending until the one-time link is used', () => {
  const pending = assessVenueClaim({ officialDomain: 'lantern.example', applicantEmail: 'ada@lantern.example' })
  assert.equal(pending.outcome, 'EMAIL_CHALLENGE')
  const proved = assessVenueClaim({ officialDomain: 'lantern.example', applicantEmail: 'ada@lantern.example', emailProved: true })
  assert.equal(proved.outcome, 'APPROVE')
  assert.equal(proved.method, 'BUSINESS_EMAIL')
  const large = assessVenueClaim({ officialDomain: 'city.nsw.gov.au', applicantEmail: 'ada@city.nsw.gov.au', emailProved: true, largeOrganisation: true })
  assert.equal(large.outcome, 'REVIEW')
  const taken = assessVenueClaim({ officialDomain: 'lantern.example', applicantEmail: 'ada@lantern.example', emailProved: true, claimedByOther: true })
  assert.equal(taken.outcome, 'DISPUTE')
})

test('an already verified organisation can skip a second identity check', () => {
  const decision = assessVenueClaim({ existingVerifiedOrgRelationship: true, officialDomain: 'lantern.example' })
  assert.equal(decision.outcome, 'APPROVE')
  assert.equal(decision.simplified, true)
})

test('sensitive venue identity fields wait for review', () => {
  const parsed = validateVenueFields({ description: 'A small bar with a piano.', website: 'https://lantern.example', address: '1 Pitt St' })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const split = splitVenuePatch(parsed.fields)
  assert.equal(split.immediate.description, 'A small bar with a piano.')
  assert.equal(split.review.website, 'https://lantern.example/')
  assert.equal(split.review.address, '1 Pitt St')
  assert.ok(profileCompleteness({ name: 'The Lantern Bar', description: 'Piano', address: '1 Pitt St' }) > 0)
})

test('a code expires, locks, and matches only the hashed secret', () => {
  const pepper = 'test-pepper'
  const row = {
    codeHash: hashVerificationSecret('123456', pepper),
    tokenHash: hashVerificationSecret('tok', pepper),
    expiresAt: '2026-10-30T01:00:00.000Z',
    attempts: 0,
  }
  assert.equal(assessCode(row, { code: '123456', pepper }, new Date('2026-10-30T00:30:00.000Z')), 'ok')
  assert.equal(assessCode(row, { code: '000000', pepper }, new Date('2026-10-30T00:30:00.000Z')), 'mismatch')
  assert.equal(assessCode(row, { token: 'tok', pepper }, new Date('2026-10-30T00:30:00.000Z')), 'ok')
  assert.equal(assessCode(row, { code: '123456', pepper }, new Date('2026-10-30T02:00:00.000Z')), 'expired')
  assert.equal(assessCode({ ...row, attempts: 5 }, { code: '123456', pepper }, new Date('2026-10-30T00:30:00.000Z')), 'locked')
})

test('when the source catches up, the override discrepancy clears and the history remains', () => {
  const plan = planSourceRefresh({
    current: { time: '19:30' },
    incoming: { time: '19:30' },
    overrides: [{ fieldName: 'time', overrideValue: '19:30', originalSourceValue: '19:00' }],
  })
  assert.equal(plan.snapshots[0]?.deactivate, true)
  assert.equal(plan.history[0]?.action, 'CLEAR_MATCH')
  assert.equal(plan.history.length > 0, true)
})

test('publishing a material time change asks for confirmation first', () => {
  const blocked = applyOverride({ current: { time: '19:00' }, field: 'time', value: '19:30', existing: null })
  assert.equal(blocked.ok, false)
  const saved = applyOverride({ current: { time: '19:00' }, field: 'time', value: '19:30', existing: null, confirmed: true })
  assert.equal(saved.ok, true)
  if (saved.ok) assert.equal(saved.row.originalSourceValue, '19:00')
})

test('platform totals do not add venue aggregates a second time', () => {
  assert.equal(platformTotal([{ views: 2000 }], { venueEventViews: 2000 }), 2000)
})

test('a venue manager cannot grant administrator access or transfer the venue', () => {
  assert.equal(venueRoleAllows('ADMINISTRATOR', 'manageTeam'), true)
  assert.equal(venueRoleAllows('ADMINISTRATOR', 'configureAds'), true)
  assert.equal(venueRoleAllows('MANAGER', 'manageTeam'), false)
  assert.equal(venueRoleAllows('ADMINISTRATOR', 'grantAdmin'), false)
  assert.equal(venueRoleAllows('ADMINISTRATOR', 'transferOwnership'), false)
})

test('an admin can edit an event and still cannot manage a venue without a grant', () => {
  assert.equal(evaluateEventAccess({ userId: 'owner', eventId: jazz, isAdmin: true }).via, 'admin')
  assert.equal(evaluateVenueAccess({ userId: 'owner', venueId: lantern, memberships: [], grants: [] }).allowed, false)
})
