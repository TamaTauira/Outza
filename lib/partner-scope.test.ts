import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ctrLabel,
  eventMatchesScope,
  hostMatches,
  listingBadges,
  normaliseHost,
  parseHostList,
  parsePartnerFilters,
  partnerCsv,
  partnerScopeWhere,
  pastWhere,
  priceKind,
  priceLabel,
  titleHeldBack,
  upcomingWhere,
} from './partner-scope'

const ticketmaster = [{ sourceKey: 'ticketmaster', hostPatterns: ['ticketmaster.com', 'ticketmaster.com.au'] }]

test('a partner source matches its key, a source record, or its ticket host', () => {
  assert.equal(eventMatchesScope({ source: 'ticketmaster' }, ticketmaster), true)
  assert.equal(eventMatchesScope({ source: 'moshtix', sources: ['ticketmaster'] }, ticketmaster), true)
  assert.equal(eventMatchesScope({ source: 'curated', recordSources: ['ticketmaster'] }, ticketmaster), true)
  assert.equal(eventMatchesScope({
    source: 'curated',
    ticketUrl: 'https://www.ticketmaster.com.au/event/1',
  }, ticketmaster), true)
  assert.equal(eventMatchesScope({
    source: 'moshtix',
    ticketUrl: 'https://www.moshtix.com.au/v2/event/1',
    sourceUrl: 'https://www.moshtix.com.au/v2/event/1',
  }, ticketmaster), false)
  assert.equal(eventMatchesScope({ source: 'eventbrite' }, []), false)
})

test('host patterns ignore scheme, www and a trailing path', () => {
  assert.equal(normaliseHost('https://www.Ticketmaster.com.au/events'), 'ticketmaster.com.au')
  assert.equal(normaliseHost('com'), null)
  assert.equal(hostMatches('https://www.ticketmaster.com.au/e/1', 'ticketmaster.com.au'), true)
  assert.equal(hostMatches('https://not-ticketmaster.com.au/e/1', 'ticketmaster.com'), false)
  assert.deepEqual(parseHostList('ticketmaster.com, www.ticketmaster.com.au'), ['ticketmaster.com', 'ticketmaster.com.au'])
})

test('an empty scope matches no rows', () => {
  assert.deepEqual(partnerScopeWhere([]), { id: { in: [] } })
  const where = partnerScopeWhere(ticketmaster)
  assert.equal(JSON.stringify(where).includes('moshtix'), false)
  assert.equal(JSON.stringify(where).includes('ticketmaster'), true)
})

test('listing status names hidden, past, cancelled and a live board row', () => {
  const live = listingBadges({ title: 'Jazz', date: '2099-01-01T00:00:00.000Z', city: 'Sydney', status: 'SCHEDULED' })
  assert.deepEqual(live.map((badge) => badge.label), ['On the board'])
  const past = listingBadges({ title: 'Jazz', date: '2020-01-01T00:00:00.000Z', city: 'Sydney', status: 'CANCELLED' })
  assert.deepEqual(past.map((badge) => badge.label), ['Past', 'Cancelled'])
  const hidden = listingBadges({ title: 'Jazz', date: '2099-01-01T00:00:00.000Z', city: 'Sydney', hidden: true, status: 'SOLD_OUT' })
  assert.deepEqual(hidden.map((badge) => badge.label), ['Hidden', 'Sold out'])
  const review = listingBadges({ title: 'Rally night', date: '2099-01-01T00:00:00.000Z', moderationStatus: 'review' })
  assert.equal(review[0].label, 'In review')
  const removed = listingBadges({ title: 'Jazz', date: '2099-01-01T00:00:00.000Z', deletedAt: '2026-01-01T00:00:00.000Z' })
  assert.equal(removed[0].label, 'Removed')
  const duplicate = listingBadges({ title: 'Jazz', date: '2099-01-01T00:00:00.000Z', city: 'Sydney', duplicateOfId: 'abc' })
  assert.equal(duplicate[0].label, 'Duplicate')
})

test('past and upcoming are both positive date matches', () => {
  const past = JSON.stringify(pastWhere(new Date('2026-11-18T00:00:00.000Z')))
  const upcoming = JSON.stringify(upcomingWhere(new Date('2026-11-18T00:00:00.000Z')))
  assert.match(past, /"lt"/)
  assert.equal(past.includes('"gte"'), false)
  assert.match(upcoming, /"gte"/)
  assert.equal(upcoming.includes('Sydney'), true)
})

test('a test title is held back and a real title is not', () => {
  assert.equal(titleHeldBack('test gig'), true)
  assert.equal(titleHeldBack('[Test] Weekend'), true)
  assert.equal(titleHeldBack('Jazz at the Enmore'), false)
})

test('price TBA stays TBA and a dollar amount stays priced', () => {
  assert.equal(priceKind({ isFree: false, price: 'TBA', priceMin: null }), 'tba')
  assert.equal(priceLabel({ isFree: false, price: null, priceMin: null }), 'Price TBA')
  assert.equal(priceKind({ isFree: true, price: null }), 'free')
  assert.equal(priceKind({ isFree: false, price: '$42', priceMin: 42 }), 'priced')
})

test('click-through is blank when there are no views', () => {
  assert.equal(ctrLabel(3, 0), null)
  assert.equal(ctrLabel(1, 4), '25.0%')
})

test('filters ignore unknown values and the csv escapes formulas', () => {
  const filters = parsePartnerFilters({ status: 'nope', price: 'tba', page: '2', engagement: '7', sort: 'clicks' })
  assert.equal(filters.status, 'any')
  assert.equal(filters.price, 'tba')
  assert.equal(filters.page, 2)
  assert.equal(filters.engagement, '7')
  assert.equal(filters.sort, 'clicks')
  const csv = partnerCsv(['Title', 'Views'], [['=cmd', 3]])
  assert.match(csv, /'=cmd/)
  assert.match(csv, /Title,Views/)
})
