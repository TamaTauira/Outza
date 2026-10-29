import assert from 'node:assert/strict'
import { test } from 'node:test'
import { interpretQuery, keywordRelaxAllowed } from './ai-search-parse'
import { listSpan } from './board'
import { resolveBoardCity } from './city-pref'
import { itineraryStorageKey, shouldClearGuestItinerary } from './itinerary-scope'
import { classifyCategory, refineStoredCategory } from './categories'

const TODAY = '2026-10-29'

test('board city follows the account, then that person’s own pick', () => {
  assert.equal(resolveBoardCity({ signedIn: true, homeCity: 'Melbourne', guestCity: 'Sydney' }), 'Melbourne')
  assert.equal(resolveBoardCity({ signedIn: true, userCity: 'Brisbane', homeCity: 'Sydney', guestCity: 'Perth' }), 'Brisbane')
  assert.equal(resolveBoardCity({ signedIn: true, urlCity: 'Darwin', userCity: 'Brisbane', homeCity: 'Sydney' }), 'Darwin')
  assert.equal(resolveBoardCity({ signedIn: false, guestCity: 'Darwin', homeCity: 'Sydney' }), 'Darwin')
  assert.equal(resolveBoardCity({ signedIn: false }), 'Sydney')
})

test('a date range is the span the board and search load', () => {
  const range = listSpan('2026-11-07', '2026-11-01', '2026-11-30')
  assert.deepEqual(range, { from: '2026-11-01', to: '2026-11-30', spanning: true })
  const day = listSpan('2026-11-07', '', '')
  assert.deepEqual(day, { from: '2026-11-07', to: '2026-11-07', spanning: false })
})

test('itinerary storage is per account and the guest list clears on sign-out', () => {
  assert.equal(itineraryStorageKey(null), 'outza-itinerary-v1:guest')
  assert.notEqual(itineraryStorageKey('a'), itineraryStorageKey('b'))
  assert.equal(itineraryStorageKey('a').includes('user:a'), true)
  assert.equal(shouldClearGuestItinerary('a', null), true)
  assert.equal(shouldClearGuestItinerary(null, 'a'), false)
  assert.equal(shouldClearGuestItinerary('a', 'b'), false)
})

test('near me is location-aware and gibberish is not relaxed into the board city', () => {
  const near = interpretQuery('free events near me', TODAY)
  assert.equal(near.nearMe, true)
  assert.equal(near.isFree, true)
  assert.equal(near.city, '')
  assert.equal(keywordRelaxAllowed(near), false)

  const junk = interpretQuery('zzzqqqasdf', TODAY)
  assert.equal(junk.nearMe, false)
  assert.ok(junk.keywords.includes('zzzqqqasdf'))
  assert.equal(keywordRelaxAllowed(junk), false)

  const named = interpretQuery('jazz in Melbourne tonight', TODAY)
  assert.equal(named.city, 'Melbourne')
  assert.equal(named.nearMe, false)
})

test('obvious mistags leave Music, Nightlife, Wellness and Film', () => {
  assert.equal(classifyCategory("Disney's The Lion King", 'A musical', ['Music']).category, 'Arts & Culture')
  assert.equal(classifyCategory('Probus Club Morning Tea', 'A social morning for members', []).category, 'Community')
  assert.equal(classifyCategory('Best Seller Book Club', 'Monthly meeting', []).category, 'Community')
  assert.equal(classifyCategory('Melbourne Cup Lunch', 'Watch the race', []).category, 'Sports')

  const rugby = refineStoredCategory({ title: 'RLWC26 Australia v New Zealand', description: 'Rugby league', category: 'Wellness', subTags: ['Health'] })
  assert.equal(rugby?.category, 'Sports')

  const roadshow = refineStoredCategory({ title: 'NAOS Investor Roadshow', description: 'Shareholder briefing', category: 'Community', subTags: ['Market'] })
  assert.equal(roadshow?.category, 'Business')

  const shoot = refineStoredCategory({ title: 'Harbour photo shoot', description: 'Bring your camera', category: 'Arts & Culture', subTags: ['Film'] })
  assert.equal(shoot?.subTags.includes('Film'), false)
  assert.equal(shoot?.subTags.includes('Photography'), true)
})
