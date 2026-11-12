import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseFeedPin, dedupeFeed, feedBlurb, feedPhoto, filterFeed, refineStoredSection, sectionCounts, sectionForLocal, type FeedItem } from './local-feed'

const row = (extra: Partial<FeedItem>): FeedItem => ({
  id: '1', title: 'Saturday garage sale', section: 'garage-sales', suburb: 'Newtown', city: 'Sydney',
  date: '2026-11-07', time: '08:00', isFree: true, price: 'Free', href: '/local/x', kind: 'local', ...extra,
})

test('a local sale and a community submission for the same day show once', () => {
  const merged = dedupeFeed([
    row({ id: 'local-1', kind: 'local', href: '/local/sale' }),
    row({ id: 'event-1', kind: 'community', href: '/events/sale', title: 'Saturday garage sale' }),
  ])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].kind, 'community')
  assert.equal(merged[0].href, '/events/sale')
})

test('different suburbs and sections stay separate', () => {
  const merged = dedupeFeed([
    row({ id: 'a', suburb: 'Newtown' }),
    row({ id: 'b', suburb: 'Glebe' }),
    row({ id: 'c', section: 'warehouse-sales', title: 'Sample sale' }),
  ])
  assert.equal(merged.length, 3)
})

test('local categories land in one neighbourhood section', () => {
  assert.equal(sectionForLocal({ category: 'GARAGE', title: 'Moving sale' }), 'garage-sales')
  assert.equal(sectionForLocal({ category: 'WAREHOUSE', title: 'Label sample sale' }), 'warehouse-sales')
  assert.equal(sectionForLocal({ category: 'MARKET', title: 'Eveleigh Farmers Market' }), 'farmers-markets')
  assert.equal(sectionForLocal({ category: 'MARKET', title: 'Oxford Street farmers market', description: 'A Saturday market with a dog-friendly policy.' }), 'farmers-markets')
  assert.equal(sectionForLocal({ category: 'MARKET', title: 'Le Marché-French market', description: 'Dog friendly. Live jazz.' }), 'farmers-markets')
  assert.equal(sectionForLocal({ category: 'MARKET', title: 'Night market' }), 'farmers-markets')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'School fete', description: 'Sausage sizzle' }), 'school-fundraisers')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'Park run club' }), 'community-sport')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'Community Birding Group' }), 'community-events')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'Dog walk picnic' }), 'dog-friendly')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'Gallery open studio' }), 'local-art')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'Christmas Pop-Up Photo Studio' }), 'neighbourhood-popups')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'Charity appeal night' }), 'charity-events')
})

test('a stored pop-up tag gives way when the title is a market or a nature group', () => {
  assert.equal(refineStoredSection('neighbourhood-popups', 'Carriageworks Farmers Market', 'Produce every Saturday'), 'farmers-markets')
  assert.equal(refineStoredSection('neighbourhood-popups', 'Community Birding Group', 'A walk looking for birds'), 'community-events')
  assert.equal(refineStoredSection('neighbourhood-popups', 'Run Club for Her', 'Beginner run'), 'community-sport')
  assert.equal(refineStoredSection('community-events', 'Carriageworks Farmers Market', ''), 'farmers-markets')
  assert.equal(refineStoredSection('neighbourhood-popups', 'Saturday garage sale', ''), 'garage-sales')
  assert.equal(refineStoredSection('dog-friendly', 'Sunday pup picnic', ''), 'dog-friendly')
})

test('card blurbs use the listing text and stay short', () => {
  assert.equal(feedBlurb(''), null)
  assert.equal(feedBlurb('Too short'), null)
  assert.equal(feedBlurb('Saturday market on the corner.'), 'Saturday market on the corner.')
  const long = 'Fresh produce from local growers, plus coffee and flowers, every week beside the station while the weather holds and the growers still have boxes left to unpack.'
  const blurbed = feedBlurb(long)
  assert.ok(blurbed && blurbed.length <= 161)
  assert.match(blurbed!, /…$/)
})

test('only a real picture URL is a listing photo', () => {
  assert.equal(feedPhoto([null, '', '/placeholders/community/card.webp']), null)
  assert.equal(feedPhoto([null, 'https://cdn.example/photo.webp']), 'https://cdn.example/photo.webp')
})

test('school listings stay on the suburb pin', () => {
  const street = { lat: -33.87, lng: 151.21 }
  const suburb = { lat: -33.89, lng: 151.18 }
  assert.deepEqual(chooseFeedPin('school-fundraisers', street, suburb), suburb)
  assert.deepEqual(chooseFeedPin('garage-sales', street, suburb), street)
  assert.deepEqual(chooseFeedPin('garage-sales', { lat: 0, lng: 0 }, suburb), suburb)
  assert.equal(chooseFeedPin('dog-friendly', null, { lat: null, lng: null }), null)
})

test('filters and counts use the merged list', () => {
  const items = dedupeFeed([
    row({ id: 'a' }),
    row({ id: 'b', section: 'dog-friendly', title: 'Pup picnic', suburb: 'Glebe' }),
  ])
  assert.equal(filterFeed(items, { section: 'dog-friendly' }).length, 1)
  assert.equal(filterFeed(items, { suburb: 'newtown' }).length, 1)
  assert.equal(filterFeed(items, { suburb: 'New' }).length, 0)
  assert.deepEqual(sectionCounts(items), { 'garage-sales': 1, 'dog-friendly': 1 })
})
