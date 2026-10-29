import assert from 'node:assert/strict'
import { test } from 'node:test'
import { distanceKm, nearestCity, planLeg } from './travel'

const PERTH = { lat: -31.9523, lng: 115.8613 }
const MELBOURNE = { lat: -37.8136, lng: 144.9631 }
const ROSEMONT = { lat: -31.928, lng: 115.852 }

test('same venue in one city is not an intercity hike, even with a bad pin', () => {
  const km = distanceKm(PERTH, MELBOURNE)
  assert.ok(km > 2500 && km < 2900, `expected Perth–Melbourne around 2700km, got ${km}`)

  const sameVenue = planLeg(
    { venueName: 'Rosemount Hotel', city: 'Perth', suburb: 'North Perth', ...ROSEMONT },
    { venueName: 'The Rosemount Hotel', city: 'Perth', suburb: 'North Perth', ...MELBOURNE },
  )
  assert.equal(sameVenue.kind, 'same')

  const badPin = planLeg(
    { venueName: 'Pure Vibe Sundays', city: 'Perth', suburb: 'North Perth', ...ROSEMONT },
    { venueName: 'Sunday Sesh', city: 'Perth', suburb: 'North Perth', ...MELBOURNE },
  )
  assert.equal(badPin.kind, 'unreliable')
})

test('different cities are not chained into a walking leg', () => {
  const leg = planLeg(
    { venueName: 'Sydney Opera House', city: 'Sydney', lat: -33.8568, lng: 151.2153 },
    { venueName: 'Corner Hotel', city: 'Melbourne', lat: -37.8245, lng: 144.992 },
  )
  assert.equal(leg.kind, 'different-city')
  if (leg.kind === 'different-city') {
    assert.equal(leg.fromCity, 'Sydney')
    assert.equal(leg.toCity, 'Melbourne')
  }
})

test('a short hop in the same city still gets a travel estimate', () => {
  const leg = planLeg(
    { venueName: 'Rosemount Hotel', city: 'Perth', ...ROSEMONT },
    { venueName: 'The Astor', city: 'Perth', lat: -31.937, lng: 115.86 },
  )
  assert.equal(leg.kind, 'trip')
  if (leg.kind === 'trip') {
    assert.ok(leg.leg.km < 5)
    assert.ok(leg.leg.walkMin < 90)
  }
})

test('near me resolves to the closest city and does not guess outside Australia', () => {
  assert.equal(nearestCity(-31.95, 115.86), 'Perth')
  assert.equal(nearestCity(-33.87, 151.21), 'Sydney')
  assert.equal(nearestCity(40.7, -74), null)
})
