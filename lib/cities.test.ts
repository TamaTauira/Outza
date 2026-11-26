import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CITIES, cityDef, custodiansLine, isGenericPlaceName, isGenericSuburbName } from './cities'
import { CITY_TRANSIT } from './city-transit'
import { MARKETS } from './intel/markets'
import { areasForCity } from './categories'
import { FOOTER_CITY_LINKS } from './site-links'

test('Wollongong is one catalogue city, with feeds and custodians checked', () => {
  const city = CITIES.find((row) => row.name === 'Wollongong')
  assert.ok(city)
  assert.equal(city.state, 'NSW')
  assert.equal(city.tz, 'Australia/Sydney')
  assert.equal(city.radiusKm, 20)
  assert.equal(city.lat, -34.4278)
  assert.equal(city.lng, 150.8931)
  assert.equal(city.eventbrite, 'australia--wollongong')
  assert.equal(city.humanitix, 'au--nsw--wollongong')
  assert.match(city.custodians, /Dharawal/)
  assert.match(custodiansLine('Wollongong'), /Dharawal/)
  assert.equal(cityDef('Wollongong').name, 'Wollongong')
  assert.equal(isGenericPlaceName('Wollongong'), true)
  assert.equal(isGenericSuburbName('Wollongong'), true)
  assert.equal(isGenericPlaceName('Figtree'), false)
})

test('catalogue city lists are the one CITIES array', () => {
  assert.equal(new Set(CITIES.map((city) => city.name)).size, CITIES.length)
  assert.equal(Object.keys(CITY_TRANSIT).length, CITIES.length)
  assert.equal(CITY_TRANSIT.Wollongong.name, 'Transport NSW')
  assert.equal(FOOTER_CITY_LINKS.length, CITIES.length)
  assert.equal(FOOTER_CITY_LINKS.some((link) => link.href === '/wollongong/events' && link.label === 'Wollongong'), true)
  for (const city of CITIES) {
    assert.ok(CITY_TRANSIT[city.name], city.name)
    assert.ok(areasForCity(city.name).length > 0, city.name)
    assert.ok(MARKETS.some((market) => market.catalogueCity === city.name), city.name)
  }
})
