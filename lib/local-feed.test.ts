import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dedupeFeed, filterFeed, sectionCounts, sectionForLocal, type FeedItem } from './local-feed'

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
  assert.equal(sectionForLocal({ category: 'MARKET', title: 'Night market' }), 'neighbourhood-popups')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'School fete', description: 'Sausage sizzle' }), 'school-fundraisers')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'Park run club' }), 'community-sport')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'Dog walk picnic' }), 'dog-friendly')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'Gallery open studio' }), 'local-art')
  assert.equal(sectionForLocal({ category: 'COMMUNITY', title: 'Charity appeal night' }), 'charity-events')
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
