import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LOCAL_PAGE_HERO, isGenuineLocalType, listingPhotoIsScene, pickCornerPhoto, type CornerListing } from './corner-photo'

const bingo: CornerListing = {
  title: 'BINGO BOTANICA [Thu 12 Nov]',
  category: 'Community',
  venueName: 'Universal Sydney',
  venueAddress: '85-91 Oxford St, Darlinghurst NSW 2010',
  imageUrl: 'https://images.humanitix.com/i/dad5feb7-8a8a-44fb-8e9e-b499147d1f9e.jpeg@original',
}

const christmas: CornerListing = {
  title: 'Wundrful World of Christmas',
  category: 'Family',
  venueName: '31 Market Street',
  venueAddress: '31 Market Street, Sydney NSW 2000',
  imageUrl: 'https://cdn.example/christmas.webp',
}

test('plant bingo is not a garage sale, market or fete, so the corner uses the Local hero', () => {
  assert.equal(isGenuineLocalType(bingo), false)
  assert.equal(listingPhotoIsScene(bingo), false)
  assert.equal(pickCornerPhoto([bingo]), LOCAL_PAGE_HERO)
})

test('a street named Market is not a market', () => {
  assert.equal(isGenuineLocalType(christmas), false)
  assert.equal(pickCornerPhoto([christmas, bingo]), LOCAL_PAGE_HERO)
})

test('a genuine Local listing still uses the hero when the picture might be a flyer', () => {
  const market: CornerListing = {
    title: 'Saturday produce',
    category: 'Food & Drink',
    communityKey: 'farmers-markets',
    imageUrl: 'https://cdn.example/produce.webp',
  }
  const sale: CornerListing = { title: 'Driveway sale', communityKey: 'garage-sales', imageUrl: 'https://cdn.example/sale.webp' }
  const fete: CornerListing = { title: 'School fair', communityKey: 'school-fundraisers', imageUrl: 'https://cdn.example/fete.webp' }
  const fundraiser: CornerListing = { title: 'Sausage sizzle', communityKey: 'charity-events', imageUrl: 'https://cdn.example/fund.webp' }
  const popup: CornerListing = { title: 'Weekend stall', communityKey: 'neighbourhood-popups', imageUrl: 'https://cdn.example/popup.webp' }
  const sport: CornerListing = { title: 'Park footy', communityKey: 'community-sport', imageUrl: 'https://cdn.example/footy.webp' }
  for (const ev of [market, sale, fete, fundraiser, popup, sport]) {
    assert.equal(isGenuineLocalType(ev), true, ev.title)
    assert.equal(listingPhotoIsScene(ev), false, ev.title)
    assert.equal(pickCornerPhoto([ev, bingo]), LOCAL_PAGE_HERO, ev.title)
  }
  assert.equal(isGenuineLocalType({ title: 'Friday Foodie Market', category: 'Food & Drink', subTags: ['Market'] }), false)
  assert.equal(LOCAL_PAGE_HERO, '/placeholders/community/hero.webp')
})
