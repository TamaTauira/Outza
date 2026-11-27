import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CITIES } from './cities'
import { CITY_TRANSIT } from './city-transit'
import { MARKETS } from './intel/markets'
import { areasForCity } from './categories'
import { FOOTER_CITY_LINKS } from './site-links'

test('catalogue city lists are the one CITIES array', () => {
  assert.equal(new Set(CITIES.map((city) => city.name)).size, CITIES.length)
  assert.equal(Object.keys(CITY_TRANSIT).length, CITIES.length)
  assert.equal(FOOTER_CITY_LINKS.length, CITIES.length)
  for (const city of CITIES) {
    assert.ok(CITY_TRANSIT[city.name], city.name)
    assert.ok(areasForCity(city.name).length > 0, city.name)
    assert.ok(MARKETS.some((market) => market.catalogueCity === city.name), city.name)
  }
})
