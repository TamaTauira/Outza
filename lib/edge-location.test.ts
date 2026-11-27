import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveEdgeLocation } from './edge-location'
import { resolveBoardCity } from './city-pref'

const NEWCASTLE = { latitude: '-32.9267', longitude: '151.7789' }
const WOLLONGONG = { latitude: '-34.4278', longitude: '150.8931' }
const MELBOURNE = { latitude: '-37.8136', longitude: '144.9631' }
const SYDNEY = { latitude: '-33.8688', longitude: '151.2093' }

test('an IP in Newcastle opens the NSW Coast board narrowed to Newcastle & the Hunter', () => {
  assert.deepEqual(
    resolveEdgeLocation({ city: 'Newcastle', country: 'AU', ...NEWCASTLE }),
    { city: 'Sydney', area: 'Newcastle & the Hunter' },
  )
  // The city name alone is enough; Vercel names the place even when a
  // coordinate is coarse.
  assert.deepEqual(
    resolveEdgeLocation({ city: 'Newcastle', country: 'AU' }),
    { city: 'Sydney', area: 'Newcastle & the Hunter' },
  )
  // And the coordinates alone land in the same area.
  assert.deepEqual(
    resolveEdgeLocation({ country: 'AU', ...NEWCASTLE }),
    { city: 'Sydney', area: 'Newcastle & the Hunter' },
  )
})

test('an IP in Wollongong opens the NSW Coast board narrowed to Wollongong & the Illawarra', () => {
  assert.deepEqual(
    resolveEdgeLocation({ city: 'Wollongong', country: 'AU', ...WOLLONGONG }),
    { city: 'Sydney', area: 'Wollongong & the Illawarra' },
  )
  assert.deepEqual(
    resolveEdgeLocation({ country: 'AU', ...WOLLONGONG }),
    { city: 'Sydney', area: 'Wollongong & the Illawarra' },
  )
})

test('an IP in a catalogue city opens that board, unnarrowed', () => {
  assert.deepEqual(
    resolveEdgeLocation({ city: 'Melbourne', country: 'AU', ...MELBOURNE }),
    { city: 'Melbourne', area: null },
  )
  assert.deepEqual(
    resolveEdgeLocation({ country: 'AU', ...MELBOURNE }),
    { city: 'Melbourne', area: null },
  )
  assert.deepEqual(
    resolveEdgeLocation({ city: 'Sydney', country: 'AU', ...SYDNEY }),
    { city: 'Sydney', area: null },
  )
  // Vercel URL-encodes the city header.
  assert.deepEqual(
    resolveEdgeLocation({ city: 'Gold%20Coast', country: 'AU' }),
    { city: 'Gold Coast', area: null },
  )
})

test('no headers (local dev, non-Vercel) resolves to nothing', () => {
  assert.equal(resolveEdgeLocation({}), null)
  assert.equal(resolveEdgeLocation({ city: null, country: null, latitude: null, longitude: null }), null)
  assert.equal(resolveEdgeLocation({ city: '', country: 'AU', latitude: '', longitude: '' }), null)
})

test('a non-Australian IP resolves to nothing, even with an Australian-looking city', () => {
  assert.equal(resolveEdgeLocation({ city: 'Sydney', country: 'NZ', ...SYDNEY }), null)
  assert.equal(resolveEdgeLocation({ city: 'Newcastle', country: 'US', ...NEWCASTLE }), null)
  assert.equal(resolveEdgeLocation({ country: 'GB', ...MELBOURNE }), null)
})

test('an Australian location that maps to no listed city resolves to nothing', () => {
  // Alice Springs: inside Australia, hundreds of kilometres from every board.
  assert.equal(resolveEdgeLocation({ city: 'Alice Springs', country: 'AU', latitude: '-23.6980', longitude: '133.8807' }), null)
})

test('a stored selection always outranks the IP default', () => {
  // The IP default is only consulted when nothing is stored: the layer above
  // it resolves any stored pick first, so an edge result can never replace
  // one. (The consultation gate itself is the stored-city check in
  // home-client; these pin the precedence it relies on.)
  assert.equal(resolveBoardCity({ guestCity: 'Perth', signedIn: false }), 'Perth')
  assert.equal(resolveBoardCity({ userCity: 'Brisbane', homeCity: 'Sydney', signedIn: true }), 'Brisbane')
  assert.equal(resolveBoardCity({ homeCity: 'Adelaide', signedIn: true }), 'Adelaide')
  assert.equal(resolveBoardCity({ urlCity: 'Darwin', guestCity: 'Perth', signedIn: false }), 'Darwin')
  // With nothing stored anywhere, the resolver reaches the plain default —
  // exactly the gap the IP default fills before this fallback is taken.
  assert.equal(resolveBoardCity({ signedIn: false }), 'Sydney')
  assert.equal(resolveBoardCity({ signedIn: true }), 'Sydney')
})
