import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cityDataIsStale, resolveBoardCity, searchInheritTarget } from './city-pref'

// The homepage has one city resolution (HomeClient) and every surface —
// heading, picker, board, rails, Coming up next — reads the result. These
// tests pin the precedence that resolution applies, so the surfaces can
// never be handed different cities by different rules (E2E-13).

test('a URL city wins over every other source', () => {
  assert.equal(
    resolveBoardCity({ urlCity: 'Perth', userCity: 'Adelaide', homeCity: 'Brisbane', guestCity: 'Darwin', signedIn: true }),
    'Perth',
  )
  assert.equal(
    resolveBoardCity({ urlCity: 'Perth', userCity: null, homeCity: null, guestCity: 'Darwin', signedIn: false }),
    'Perth',
  )
})

test('a URL All-of-Australia choice is a real choice and wins', () => {
  assert.equal(
    resolveBoardCity({ urlCity: '', userCity: 'Adelaide', homeCity: 'Brisbane', guestCity: null, signedIn: true }),
    '',
  )
})

test('an unknown URL city falls through to the next source', () => {
  assert.equal(
    resolveBoardCity({ urlCity: 'Atlantis', userCity: 'Adelaide', homeCity: 'Brisbane', guestCity: null, signedIn: true }),
    'Adelaide',
  )
})

test("a signed-in person's own pick beats their account home city", () => {
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: 'Adelaide', homeCity: 'Brisbane', guestCity: null, signedIn: true }),
    'Adelaide',
  )
})

test("a signed-in person's All-of-Australia pick beats their home city", () => {
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: '', homeCity: 'Brisbane', guestCity: null, signedIn: true }),
    '',
  )
})

test("a signed-in person's own pick beats the device pick and their home city", () => {
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: 'Adelaide', homeCity: 'Brisbane', guestCity: 'Perth', signedIn: true }),
    'Adelaide',
  )
})

test('a signed-in person adopts the device pick over their account home city', () => {
  // The device pick is the most recent explicit choice on this device —
  // often this same person's, made before signing in or on /local (which
  // writes only the device key). The first version of this resolution
  // never read it for a signed-in person, and the caller wrote a fallback
  // back over it, destroying the pick (E2E-13 fix-up).
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: null, homeCity: 'Brisbane', guestCity: 'Perth', signedIn: true }),
    'Perth',
  )
})

test('a signed-in person adopts the device pick when they have no home city', () => {
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: null, homeCity: null, guestCity: 'Perth', signedIn: true }),
    'Perth',
  )
})

test("a signed-in person's All-of-Australia device pick is adopted too", () => {
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: null, homeCity: 'Brisbane', guestCity: '', signedIn: true }),
    '',
  )
})

test('a signed-in person falls back to their account home city when nothing is stored', () => {
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: null, homeCity: 'Brisbane', guestCity: null, signedIn: true }),
    'Brisbane',
  )
})

test('a submit-time resolution from the stored inputs lands on the stored pick, not the seed', () => {
  // The hero search re-resolves at submit time while the board resolution
  // is still in flight; from the stored inputs alone it must land on the
  // same city the board is about to show, never the Sydney seed.
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: null, homeCity: null, guestCity: 'Adelaide', signedIn: false }),
    'Adelaide',
  )
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: 'Adelaide', homeCity: null, guestCity: 'Sydney', signedIn: true }),
    'Adelaide',
  )
})

test('a guest uses the device pick', () => {
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: null, homeCity: null, guestCity: 'Hobart', signedIn: false }),
    'Hobart',
  )
})

test("a guest's All-of-Australia pick is honoured", () => {
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: null, homeCity: null, guestCity: '', signedIn: false }),
    '',
  )
})

test('a guest with nothing stored lands on the default city', () => {
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: null, homeCity: null, guestCity: null, signedIn: false }),
    'Sydney',
  )
})

test('unknown stored values are ignored', () => {
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: 'Atlantis', homeCity: 'Nowhere', guestCity: null, signedIn: true }),
    'Sydney',
  )
  assert.equal(
    resolveBoardCity({ urlCity: null, userCity: null, homeCity: null, guestCity: 'Atlantis', signedIn: false }),
    'Sydney',
  )
})

// The board surfaces hold data loaded for one city while the selection can
// move to another. Held data may only be presented under the name of the
// city it was loaded for; while the two differ, the surface shows its
// loading state instead of the old city's count or cards (transition leak).

test('held data is stale when it was loaded for a different city', () => {
  assert.equal(cityDataIsStale('Melbourne', 'Adelaide', 113), true)
  assert.equal(cityDataIsStale('Sydney', '', 281), true)
  assert.equal(cityDataIsStale('Sydney', undefined, 281), true)
})

test('held data is not stale for the city it was loaded for', () => {
  assert.equal(cityDataIsStale('Adelaide', 'Adelaide', 34), false)
  assert.equal(cityDataIsStale('', '', 12), false)
})

test('an empty hand is never stale', () => {
  assert.equal(cityDataIsStale('Melbourne', 'Adelaide', 0), false)
  assert.equal(cityDataIsStale(null, 'Adelaide', 0), false)
})

// /search inherits the board's city when its link named none: the server
// seeds DEFAULT_CITY and the client re-requests under the resolved city.
// These pin when that correction fires, so a /search render is never left
// headed with a city its results were not loaded for — and a query that
// named its own city is never dragged onto the stored pick.

test('a /search render seeded with the default moves to the resolved city', () => {
  assert.equal(searchInheritTarget({ seedCity: 'Sydney', queryCity: '', resolvedCity: 'Melbourne' }), 'Melbourne')
  assert.equal(searchInheritTarget({ seedCity: 'Sydney', queryCity: null, resolvedCity: 'Perth' }), 'Perth')
})

test('a /search render already on the resolved city stays', () => {
  assert.equal(searchInheritTarget({ seedCity: 'Sydney', queryCity: '', resolvedCity: 'Sydney' }), null)
})

test('a query that named a city is never corrected onto the stored pick', () => {
  assert.equal(searchInheritTarget({ seedCity: 'Sydney', queryCity: 'Sydney', resolvedCity: 'Melbourne' }), null)
  assert.equal(searchInheritTarget({ seedCity: 'Sydney', queryCity: 'Brisbane', resolvedCity: 'Melbourne' }), null)
})

test('an All-of-Australia resolution has no /search URL form and stays seeded', () => {
  assert.equal(searchInheritTarget({ seedCity: 'Sydney', queryCity: '', resolvedCity: '' }), null)
})

test('an unknown resolved value never becomes a /search city', () => {
  assert.equal(searchInheritTarget({ seedCity: 'Sydney', queryCity: '', resolvedCity: 'Atlantis' }), null)
})
