import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addressBesideVenue, collapseRepeatedWords, formatAddress, formatVenueLine, placeLine } from './place'

test('venue and suburb are not repeated', () => {
  assert.equal(formatVenueLine({ venueName: 'The Rocks', suburb: 'The Rocks', city: 'Sydney' }), 'The Rocks')
  assert.equal(formatVenueLine({ venueName: 'Martin Place', suburb: 'Martin Place', city: 'Sydney' }), 'Martin Place')
  assert.equal(formatVenueLine({ venueName: 'The Rocks', suburb: 'Dawes Point', city: 'Sydney' }), 'The Rocks · Dawes Point')
})

test('an address that already starts with the venue drops the copy', () => {
  assert.equal(
    formatAddress({
      venueName: 'Martin Place',
      venueAddress: 'Martin Place, Sydney NSW 2000',
      suburb: 'CBD',
      city: 'Sydney',
    }),
    'Martin Place, Sydney NSW 2000, CBD',
  )
  assert.equal(
    placeLine({
      venueName: 'The Rocks',
      venueAddress: 'The Rocks, 1 Hickson Rd, Dawes Point NSW 2000, The Rocks',
      suburb: 'The Rocks',
      city: 'Sydney',
    }),
    'The Rocks, 1 Hickson Rd, Dawes Point NSW 2000, Sydney',
  )
})

test('a detail address does not repeat the venue already shown', () => {
  assert.equal(addressBesideVenue('57 Denison St, Camperdown NSW 2050, Australia', '57 Denison St'), 'Camperdown NSW 2050, Australia')
  assert.equal(addressBesideVenue("St Joseph's College, Mark Street, Hunters Hill, 2110, NSW", "St Joseph's College, Mark Street"), 'Hunters Hill, 2110, NSW')
  assert.equal(addressBesideVenue('2/10 Brompton St, Marrickville NSW 2042', 'Heaps Normal Health Club'), '2/10 Brompton St, Marrickville NSW 2042')
  assert.equal(addressBesideVenue('Heaps Normal Health Club', 'Heaps Normal Health Club'), '')
})

test('a doubled city token in a venue name collapses', () => {
  assert.equal(collapseRepeatedWords('Hobart Hobart City High School'), 'Hobart City High School')
})
