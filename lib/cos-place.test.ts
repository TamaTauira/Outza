import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cityOfSydneyPlace } from './cos-place'
import { suburbFromAddress } from './cities'
import { geocodeNameFits } from './geocode'

test('Central Station keeps the Haymarket venue address, not the Glebe event tag', () => {
  const got = cityOfSydneyPlace({
    listedAddress: 'Central, Haymarket NSW 2000',
    listedLat: -33.883581,
    listedLng: 151.206008,
    suburbName: 'Glebe',
  })
  assert.equal(got.venueAddress, 'Central, Haymarket NSW 2000')
  assert.equal(suburbFromAddress(got.venueAddress), 'Haymarket')
  assert.equal(got.lat, -33.883581)
  assert.equal(got.lng, 151.206008)
})

test('a Haymarket street beats a Glebe event tag', () => {
  const got = cityOfSydneyPlace({
    listedAddress: '181-187 Hay Street, Haymarket NSW 2000',
    listedLat: -33.879983,
    listedLng: 151.205837,
    suburbName: 'Glebe',
  })
  assert.equal(got.venueAddress, '181-187 Hay Street, Haymarket NSW 2000')
  assert.equal(suburbFromAddress(got.venueAddress), 'Haymarket')
  assert.equal(got.lat, -33.879983)
})

test('a real Glebe street stays in Glebe', () => {
  const got = cityOfSydneyPlace({
    listedAddress: '160 St Johns Road, Glebe NSW 2037',
    listedLat: -33.882523,
    listedLng: 151.185004,
    suburbName: 'Glebe',
  })
  assert.equal(got.venueAddress, '160 St Johns Road, Glebe NSW 2037')
  assert.equal(suburbFromAddress(got.venueAddress), 'Glebe')
  assert.equal(got.lat, -33.882523)
  assert.equal(got.lng, 151.185004)
})

test('a generic Sydney line still falls back to the suburb tag', () => {
  const got = cityOfSydneyPlace({
    listedAddress: 'Sydney, NSW',
    listedLat: null,
    listedLng: null,
    suburbName: 'Newtown',
  })
  assert.equal(got.venueAddress, 'Newtown, NSW')
  assert.equal(suburbFromAddress(got.venueAddress), 'Newtown')
  assert.equal(got.lat, null)
})

test('a station query does not accept a different station in the tagged suburb', () => {
  assert.equal(geocodeNameFits('Central Station, Glebe, NSW, Sydney', 'Glebe Fire Station'), false)
  assert.equal(geocodeNameFits('Central Station, Glebe, NSW, Sydney', 'Glebe Police Station'), false)
  assert.equal(geocodeNameFits('Central Station, Haymarket NSW 2000', 'Central railway station'), true)
  assert.equal(geocodeNameFits('Glebe Town Hall, Glebe NSW 2037', 'Glebe Town Hall'), true)
  assert.equal(geocodeNameFits('160 St Johns Road, Glebe NSW 2037', '160 St Johns Road'), true)
})
