import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cityDef } from './cities'
import {
  communityPageIndexable, datesForListing, filterCommunityListings, listingCta, moderationResult,
  overRateLimit, parseCommunity, redactCommunityPublic,
} from './community-shared'

const now = new Date('2026-10-30T01:00:00.000Z')

function body(extra: Record<string, unknown> = {}) {
  return {
    communityKey: 'dog-friendly',
    title: 'Sunday pup picnic',
    description: 'A friendly walk around the park for local dogs and their people. Bring water.',
    suburb: 'Newtown',
    city: 'Sydney',
    startDate: '2026-11-01',
    startTime: '09:00',
    endTime: '10:00',
    recurrence: 'NONE',
    organiserName: 'Sam',
    contactEmail: 'sam@example.com',
    isPublic: true,
    isFree: true,
    startedAt: now.getTime() - 60_000,
    ...extra,
  }
}

test('a valid community submission parses and stays suburb-only by default', () => {
  const parsed = parseCommunity(body(), now)
  assert.ok(!('error' in parsed))
  if ('error' in parsed) return
  assert.equal(parsed.input.locationVisibility, 'SUBURB')
  assert.equal(parsed.input.streetAddress, null)
  assert.equal(parsed.review, false)
  assert.equal(parsed.input.boardCategory, 'Community')
})

test('school listings drop street addresses and wait for a person', () => {
  const parsed = parseCommunity(body({
    communityKey: 'school-fundraisers',
    title: 'Newtown public school fete',
    description: 'Sausage sizzle and stalls at 12 Brown Street. Everyone in the suburb is welcome.',
    streetAddress: '12 Brown Street',
    showPrecise: true,
    placeName: '12 Brown Street',
  }), now)
  assert.ok(!('error' in parsed))
  if ('error' in parsed) return
  assert.equal(parsed.input.locationVisibility, 'SUBURB')
  assert.equal(parsed.input.streetAddress, null)
  assert.equal(parsed.droppedSchoolAddress, true)
  assert.equal(parsed.review, true)
  assert.doesNotMatch(parsed.input.description, /Brown Street/)
})

test('a photo of children is held for review and not treated as publishable', () => {
  const parsed = parseCommunity(body({ childrenInImage: true, imageUrl: 'https://example.com/a.webp', imageRights: true }), now)
  assert.ok(!('error' in parsed))
  if ('error' in parsed) return
  assert.ok(parsed.flags.includes('CHILDREN_IMAGE'))
  assert.equal(parsed.review, true)
  const hidden = redactCommunityPublic({ communityKey: 'dog-friendly', childrenInImage: true, imageUrl: 'https://example.com/a.webp', latitude: 1, longitude: 2, venueAddress: '1 King St', locationVisibility: 'PRECISE' })
  assert.equal(hidden.imageUrl, null)
})

test('precise opt-in keeps a street, suburb-only and school pages do not', () => {
  const parsed = parseCommunity(body({ showPrecise: true, streetAddress: '12 King Street', placeName: 'Driveway' }), now)
  assert.ok(!('error' in parsed))
  if ('error' in parsed) return
  assert.equal(parsed.input.locationVisibility, 'PRECISE')
  const shown = redactCommunityPublic({
    communityKey: 'garage-sales',
    locationVisibility: 'PRECISE',
    venueName: 'Driveway',
    venueAddress: '12 King Street',
    suburb: 'Newtown',
    latitude: -33.9,
    longitude: 151.1,
  })
  assert.equal(shown.venueAddress, '12 King Street')
  const school = redactCommunityPublic({
    communityKey: 'school-fundraisers',
    locationVisibility: 'PRECISE',
    venueName: '12 Brown Street',
    venueAddress: '12 Brown Street',
    suburb: 'Newtown',
    latitude: -33.9,
    longitude: 151.1,
    description: 'Meet at 12 Brown Street.',
  })
  assert.equal(school.venueAddress, null)
  assert.equal(school.latitude, null)
  assert.equal(school.longitude, null)
  assert.doesNotMatch(school.description ?? '', /Brown Street/)
})

test('rate limit, honeypot and private events are refused', () => {
  assert.equal(overRateLimit(4), false)
  assert.equal(overRateLimit(5), true)
  const honeypot = parseCommunity(body({ company: 'spam co' }), now)
  assert.ok('error' in honeypot)
  const priv = parseCommunity(body({ title: 'Private birthday party', description: 'Invitation only birthday party for the family, cake in the backyard.' }), now)
  assert.ok('error' in priv)
})

test('removing a listing soft-deletes and names an audit action', () => {
  const removed = moderationResult('remove')
  assert.equal(removed.approvalState, 'REMOVED')
  assert.equal(removed.softDelete, true)
  assert.equal(removed.audit, 'REMOVE')
  assert.equal(moderationResult('approve').softDelete, false)
})

test('suburb, city, free and date filters use real occurrences', () => {
  const sydney = cityDef('Sydney')
  const rows = [
    { id: 'weekly', communityKey: 'farmers-markets', city: 'Sydney', suburb: 'Newtown', date: '2026-10-31', endDate: '2026-12-31', recurrence: 'WEEKLY', time: '08:00', isFree: true, status: 'SCHEDULED' },
    { id: 'once', communityKey: 'farmers-markets', city: 'Sydney', suburb: 'Newton', date: '2026-11-07', endDate: null, recurrence: null, time: '09:00', isFree: false, status: 'SCHEDULED' },
    { id: 'melb', communityKey: 'farmers-markets', city: 'Melbourne', suburb: 'Fitzroy', date: '2026-11-07', endDate: null, recurrence: null, time: '09:00', isFree: true, status: 'SCHEDULED' },
    { id: 'dogs', communityKey: 'dog-friendly', city: 'Sydney', suburb: 'Newtown', date: '2026-11-07', endDate: null, recurrence: null, time: '09:00', isFree: true, status: 'SCHEDULED' },
  ]
  const saturday = filterCommunityListings(rows, { section: 'farmers-markets', city: 'Sydney', from: '2026-11-07', to: '2026-11-07' }, sydney)
  assert.deepEqual(saturday.map((row) => row.id).sort(), ['once', 'weekly'])
  const sunday = filterCommunityListings(rows, { section: 'farmers-markets', city: 'Sydney', from: '2026-11-08', to: '2026-11-08' }, sydney)
  assert.equal(sunday.length, 0)
  const suburb = filterCommunityListings(rows, { section: 'farmers-markets', city: 'Sydney', suburb: 'Newtown', from: '2026-11-01', to: '2026-11-30' }, sydney)
  assert.ok(suburb.every((row) => row.suburb === 'Newtown'))
  assert.equal(filterCommunityListings(rows, { section: 'farmers-markets', city: 'Sydney', suburb: 'New', from: '2026-11-01', to: '2026-11-30' }, sydney).length, 0)
  const free = filterCommunityListings(rows, { section: 'farmers-markets', city: 'Sydney', free: true, from: '2026-11-07', to: '2026-11-07' }, sydney)
  assert.deepEqual(free.map((row) => row.id), ['weekly'])
  const dates = datesForListing(rows[0], '2026-11-07', '2026-11-14')
  assert.deepEqual(dates, ['2026-11-07', '2026-11-14'])
})

test('thin community pages stay out of the index', () => {
  assert.equal(communityPageIndexable(0, 'section'), false)
  assert.equal(communityPageIndexable(4, 'section'), false)
  assert.equal(communityPageIndexable(5, 'city'), true)
  assert.equal(communityPageIndexable(4, 'suburb'), false)
  assert.equal(communityPageIndexable(5, 'suburb', 1), false)
  assert.equal(communityPageIndexable(5, 'suburb', 2), true)
  assert.equal(communityPageIndexable(4, 'date'), false)
  assert.equal(communityPageIndexable(5, 'date'), true)
})

test('community pages keep a More Info link and ticket hosts stay Get Tickets', () => {
  const own = listingCta({ id: 'abc', title: 'Pup picnic', communityKey: 'dog-friendly', source: 'community' })
  assert.equal(own?.label, 'More Info')
  assert.match(own?.href ?? '', /pup-picnic-abc/)
  const tickets = listingCta({ id: 'abc', title: 'Gig', ticketUrl: 'https://www.ticketmaster.com/event/1', source: 'ticketmaster' })
  assert.equal(tickets?.label, 'Get Tickets')
  const site = listingCta({ id: 'abc', title: 'Market', communityKey: 'farmers-markets', organiserUrl: 'https://market.example/info' })
  assert.equal(site?.label, 'More Info')
  assert.equal(site?.external, true)
})
