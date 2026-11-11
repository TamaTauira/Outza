import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CORNER_ARTWORK, cornerMatchScore, pickCornerPhoto, type CornerListing } from './corner-photo'

const christmas: CornerListing = {
  title: 'Wundrful World of Christmas',
  category: 'Family',
  venueName: '31 Market Street',
  venueAddress: '31 Market Street, Sydney NSW 2000',
  imageUrl: 'https://cdn.example/christmas.webp',
}

test('a street named Market is not a market', () => {
  assert.equal(cornerMatchScore(christmas), 0)
  assert.equal(pickCornerPhoto([christmas]), CORNER_ARTWORK)
  const market: CornerListing = {
    title: 'Saturday produce',
    category: 'Food & Drink',
    communityKey: 'farmers-markets',
    venueName: 'Town Hall',
    imageUrl: 'https://cdn.example/produce.webp',
  }
  assert.equal(pickCornerPhoto([christmas, market]), market.imageUrl)
})

test('category, type and tags outrank a title, and the title is only a word-boundary fallback', () => {
  const titled: CornerListing = { title: 'Friday Foodie Market', category: 'Food & Drink', imageUrl: 'https://cdn.example/foodie.webp' }
  const tagged: CornerListing = { title: 'Saturday stall', category: 'Food & Drink', subTags: ['Market'], imageUrl: 'https://cdn.example/stall.webp' }
  const community: CornerListing = { title: 'Neighbourhood meetup', category: 'Community', imageUrl: 'https://cdn.example/meetup.webp' }
  const popup: CornerListing = { title: 'One weekend only', communityKey: 'neighbourhood-popups', imageUrl: 'https://cdn.example/popup.webp' }
  assert.equal(pickCornerPhoto([titled, tagged]), tagged.imageUrl)
  assert.equal(pickCornerPhoto([titled, community]), community.imageUrl)
  assert.equal(pickCornerPhoto([titled, popup]), popup.imageUrl)
  assert.equal(pickCornerPhoto([titled, christmas]), titled.imageUrl)
  assert.equal(cornerMatchScore({ title: 'Marketing breakfast', category: 'Business', venueName: 'The Markets Hotel' }), 0)
})

test('with no matching photo, the Local picture is used, then the community artwork', () => {
  const local = 'https://cdn.example/local-hero.webp'
  assert.equal(pickCornerPhoto([christmas], { localPhoto: local }), local)
  assert.equal(pickCornerPhoto([{ title: 'Garage sale on the lawn', category: 'Community', imageUrl: null }], { localPhoto: 'https://picsum.photos/seed/x/800/450' }), CORNER_ARTWORK)
  assert.equal(pickCornerPhoto([]), CORNER_ARTWORK)
})
