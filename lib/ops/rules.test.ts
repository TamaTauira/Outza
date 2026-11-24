import assert from 'node:assert/strict'
import test from 'node:test'
import { undoAllowed } from './undo'
import { shouldResolveExisting, ruleClaim, ruleDuplicateFlagged, ruleDuplicateReview, ruleEventReport, ruleExpiredHidden, ruleHeldEvent, ruleMissingCoords, ruleTimeConflict, ruleVenueProfile, sourceFromUrl } from './rules'
import { DEFAULT_THRESHOLDS } from './types'

const day = 24 * 60 * 60 * 1000

test('expired listings close and upcoming ones wait', () => {
  assert.equal(ruleExpiredHidden({ past: true }).outcome, 'act')
  assert.equal(ruleExpiredHidden({ past: false }).outcome, 'skip')
})

test('missing coordinates geocode, then a suburb centroid after three failures', () => {
  const placed = ruleMissingCoords({ hasPin: false, geocoded: { lat: -33.87, lng: 151.2 }, failures: 0, centroid: null })
  assert.equal(placed.outcome, 'act')
  if (placed.outcome === 'act') assert.equal(placed.action, 'set-coords')
  const again = ruleMissingCoords({ hasPin: false, geocoded: null, failures: 1, centroid: { lat: 1, lng: 1 } })
  assert.equal(again.outcome, 'skip')
  const centroid = ruleMissingCoords({ hasPin: false, geocoded: null, failures: 3, centroid: { lat: -33.88, lng: 151.18 } })
  assert.equal(centroid.outcome, 'act')
  if (centroid.outcome === 'act') {
    assert.equal(centroid.action, 'set-centroid')
    assert.match(centroid.reason, /centroid/)
  }
  const stuck = ruleMissingCoords({ hasPin: false, geocoded: null, failures: 3, centroid: null })
  assert.equal(stuck.outcome, 'digest')
})

test('time conflicts prefer the ticket host, then the newer source', () => {
  assert.equal(sourceFromUrl('https://events.humanitix.com/trivia'), 'humanitix')
  const host = ruleTimeConflict({
    kind: 'sources',
    ticketUrl: 'https://www.moshtix.com.au/v2/event/abc',
    sources: [{ source: 'moshtix', refreshedAt: '2026-11-01T00:00:00.000Z' }, { source: 'eventbrite', refreshedAt: '2026-11-20T00:00:00.000Z' }],
  })
  assert.equal(host.outcome, 'act')
  if (host.outcome === 'act') assert.match(host.reason, /moshtix/)
  const newer = ruleTimeConflict({
    kind: 'sources',
    sources: [
      { source: 'oztix', refreshedAt: '2026-11-01T00:00:00.000Z' },
      { source: 'humanitix', refreshedAt: '2026-11-20T00:00:00.000Z' },
    ],
  })
  assert.equal(newer.outcome, 'act')
  if (newer.outcome === 'act') assert.ok(newer.confidence >= DEFAULT_THRESHOLDS.timeConflict)
  const close = ruleTimeConflict({
    kind: 'sources',
    sources: [
      { source: 'oztix', refreshedAt: '2026-11-20T00:00:00.000Z' },
      { source: 'humanitix', refreshedAt: '2026-11-20T01:00:00.000Z' },
    ],
  })
  assert.equal(close.outcome, 'digest')
  assert.equal(ruleTimeConflict({ kind: 'hours', sources: [] }).outcome, 'digest')
})

test('owner-protected duplicates stay separate unless both are promoted', () => {
  const kept = ruleDuplicateFlagged({ primaryPromoted: true, otherPromoted: false })
  assert.equal(kept.outcome, 'act')
  if (kept.outcome === 'act') assert.equal(kept.action, 'keep-both')
  const both = ruleDuplicateFlagged({ primaryPromoted: true, otherPromoted: true })
  assert.equal(both.outcome, 'digest')
})

test('duplicate review uses the confidence thresholds', () => {
  const link = ruleDuplicateReview({ score: 0.93 })
  assert.equal(link.outcome, 'act')
  if (link.outcome === 'act') assert.equal(link.action, 'link-duplicate')
  const dismiss = ruleDuplicateReview({ score: 0.1 })
  assert.equal(dismiss.outcome, 'act')
  if (dismiss.outcome === 'act') assert.equal(dismiss.action, 'dismiss-duplicate')
  assert.equal(ruleDuplicateReview({ score: 0.5 }).outcome, 'digest')
  assert.equal(ruleDuplicateReview({ score: null }).outcome, 'digest')
})

test('held listings: rallies stay hidden, ordinary classes publish, harm is high risk', () => {
  const rally = ruleHeldEvent({ title: 'Genocide Protest Every Single Day', past: false })
  assert.equal(rally.outcome, 'act')
  if (rally.outcome === 'act') {
    assert.equal(rally.action, 'keep-hidden')
    assert.equal(rally.highRisk, undefined)
  }
  const pottery = ruleHeldEvent({ title: 'Kids pottery wheel classes', description: 'Two hours at the wheel with clay and a kiln firing later.', past: false })
  assert.equal(pottery.outcome, 'act')
  if (pottery.outcome === 'act') assert.equal(pottery.action, 'publish')
  const trivia = ruleHeldEvent({ title: 'Tavern Trivia', description: 'Teams of four from seven, with the kitchen open the whole night.', past: false })
  if (trivia.outcome === 'act') assert.equal(trivia.action, 'publish')
  const harm = ruleHeldEvent({ title: 'Town hall', description: 'Bring nylon cable ties to restrain and arrest people.', past: false })
  assert.equal(harm.outcome, 'act')
  if (harm.outcome === 'act') assert.equal(harm.highRisk, true)
  const past = ruleHeldEvent({ title: 'Genocide Protest Every Single Day', past: true })
  if (past.outcome === 'act') assert.equal(past.action, 'close-past')
  const unsure = ruleHeldEvent({ title: 'Something odd', description: 'A long enough description that is not junk and not a class.', past: false, ai: { label: 'unsure', confidence: 0.4 } })
  assert.equal(unsure.outcome, 'digest')
})

test('reports follow the source page', () => {
  const cancelled = ruleEventReport({ reason: 'CANCELLED', source: { ok: true, cancelled: true } })
  assert.equal(cancelled.outcome, 'act')
  if (cancelled.outcome === 'act') assert.equal(cancelled.patch?.status, 'CANCELLED')
  const still = ruleEventReport({ reason: 'CANCELLED', source: { ok: true, cancelled: false } })
  if (still.outcome === 'act') assert.match(still.reason, /original/)
  const moved = ruleEventReport({ reason: 'WRONG_DATE', source: { ok: true, date: '2026-12-01' } })
  if (moved.outcome === 'act') assert.equal(moved.action, 'set-date')
  const broken = ruleEventReport({ reason: 'BROKEN_LINK', source: { ok: true, missing: true } })
  if (broken.outcome === 'act') assert.equal(broken.action, 'close-report-resolved')
  assert.equal(ruleEventReport({ reason: 'OTHER', source: null, summary: 'The price looks wrong.' }).outcome, 'digest')
  const dup = ruleEventReport({ reason: 'DUPLICATE', source: null, score: 0.95 })
  if (dup.outcome === 'act') assert.equal(dup.action, 'link-duplicate')
})

test('claims auto-approve a matching domain and ask free-mail for evidence', () => {
  const match = ruleClaim({
    email: 'ada@pottery.example',
    organiserUrls: ['https://pottery.example/classes'],
    emailVerified: false,
    hasEvidence: false,
    dispute: false,
    promoted: false,
    domainMatches: true,
  })
  if (match.outcome === 'act') assert.equal(match.action, 'approve-claim')
  const code = ruleClaim({
    email: 'ada@gmail.com',
    organiserUrls: [],
    emailVerified: true,
    hasEvidence: false,
    dispute: false,
    promoted: false,
    domainMatches: false,
  })
  if (code.outcome === 'act') assert.equal(code.action, 'approve-claim')
  const free = ruleClaim({
    email: 'ada@gmail.com',
    organiserUrls: [],
    emailVerified: false,
    hasEvidence: false,
    dispute: false,
    promoted: false,
    domainMatches: false,
  })
  if (free.outcome === 'act') assert.equal(free.action, 'request-evidence')
  assert.equal(ruleClaim({
    email: 'ada@pottery.example', organiserUrls: [], emailVerified: true, hasEvidence: true, dispute: true, promoted: false, domainMatches: true,
  }).outcome, 'digest')
  assert.equal(ruleClaim({
    email: 'ada@pottery.example', organiserUrls: [], emailVerified: true, hasEvidence: true, dispute: false, promoted: true, domainMatches: true,
  }).outcome, 'digest')
})

test('venue profile applies safe fields and holds name changes', () => {
  const hours = ruleVenueProfile({ field: 'hoursNote', verifiedManager: true, imageSuspect: false })
  if (hours.outcome === 'act') assert.equal(hours.action, 'apply-venue-field')
  const name = ruleVenueProfile({ field: 'name', verifiedManager: true, imageSuspect: false })
  assert.equal(name.outcome, 'digest')
  const image = ruleVenueProfile({ field: 'logoUrl', verifiedManager: true, imageSuspect: true })
  assert.equal(image.outcome, 'digest')
})

test('the live resolver leaves the backlog alone until it is explicitly allowed', () => {
  const live = new Date('2026-11-25T00:00:00.000Z')
  assert.equal(shouldResolveExisting(new Date(live.getTime() - day), live, false), false)
  assert.equal(shouldResolveExisting(live, live, false), true)
  assert.equal(shouldResolveExisting(new Date(live.getTime() - day), live, true), true)
})

test('undo is open for 30 days and then closed', () => {
  const created = new Date('2026-11-01T00:00:00.000Z')
  assert.equal(undoAllowed(created, null, new Date(created.getTime() + 29 * day)).ok, true)
  assert.equal(undoAllowed(created, null, new Date(created.getTime() + 31 * day)).ok, false)
  assert.equal(undoAllowed(created, created, new Date(created.getTime() + day)).ok, false)
})
