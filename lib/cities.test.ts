import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boardCityForPlace, boardDisplayName, CITIES, CITY_LABELS, INGEST_CITIES, INGEST_ONLY_CITIES, boardCitiesFor } from './cities'
import { CITY_TRANSIT } from './city-transit'
import { MARKETS } from './intel/markets'
import { areaGroupFor, areaGroupForPlace, areaGroupLabels, areasForCity, filterAreasForCity, matchesAreaGroup } from './categories'
import { cityFromSlug, cityPath } from './seo'
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

test('picker labels carry the approved eyebrow, label and coverage wording', () => {
  assert.deepEqual(Object.keys(CITY_LABELS).sort(), CITIES.map((c) => c.name).sort())
  assert.deepEqual(CITY_LABELS.Sydney, {
    eyebrow: 'NSW · THE HARBOUR STATE',
    label: 'Sydney & the NSW Coast',
    coverage: 'Includes Wollongong, the Illawarra, Newcastle & the Hunter',
  })
  const eyebrows: Record<string, string> = {
    Melbourne: 'VIC · THE GARDEN STATE',
    Brisbane: 'QLD · THE SUNSHINE STATE',
    'Gold Coast': 'QLD · THE SUNSHINE STATE',
    Perth: 'WA · THE WILDFLOWER STATE',
    Adelaide: 'SA · THE FESTIVAL STATE',
    Canberra: 'ACT · THE BUSH CAPITAL',
    Hobart: 'TAS · THE APPLE ISLE',
    Darwin: 'NT · THE TOP END',
  }
  for (const city of CITIES) {
    if (city.name === 'Sydney') continue
    assert.equal(CITY_LABELS[city.name].eyebrow, eyebrows[city.name], city.name)
    assert.equal(CITY_LABELS[city.name].label, city.name, city.name)
    assert.equal(CITY_LABELS[city.name].coverage, undefined, city.name)
  }
})

test('board display name is the region label for Sydney and the plain name elsewhere', () => {
  assert.equal(boardDisplayName('Sydney'), 'Sydney & the NSW Coast')
  for (const city of CITIES) {
    if (city.name !== 'Sydney') assert.equal(boardDisplayName(city.name), city.name, city.name)
  }
  // Places without a picker label fall back to the name they were given.
  assert.equal(boardDisplayName('Newcastle'), 'Newcastle')
})

test('footer city links carry the display label over the plain-name path', () => {
  for (const city of CITIES) {
    const link = FOOTER_CITY_LINKS.find((l) => l.href === cityPath(city))
    assert.ok(link, city.name)
    assert.equal(link!.label, boardDisplayName(city.name), city.name)
  }
  assert.equal(FOOTER_CITY_LINKS.find((l) => l.href === '/sydney/events')?.label, 'Sydney & the NSW Coast')
})

test('Newcastle is ingest-only: collected and on the Sydney board, but never selectable', () => {
  assert.deepEqual(INGEST_ONLY_CITIES.map((c) => c.name), ['Newcastle'])
  assert.equal(CITIES.some((c) => c.name === 'Newcastle'), false)
  assert.ok(INGEST_CITIES.some((c) => c.name === 'Newcastle'))
  // No route of its own: the slug resolves to nothing, so /newcastle keeps 404ing.
  assert.equal(cityFromSlug('newcastle'), undefined)
  assert.equal(cityFromSlug('wollongong'), undefined)
  // The Sydney board covers both stored cities; every other board is single-city.
  assert.deepEqual(boardCitiesFor('Sydney'), ['Sydney', 'Newcastle'])
  for (const city of CITIES) {
    if (city.name !== 'Sydney') assert.deepEqual(boardCitiesFor(city.name), [city.name], city.name)
  }
})

test('the NSW Coast board area filter groups Sydney, the Illawarra and the Hunter', () => {
  assert.deepEqual(areaGroupLabels('Sydney'), ['Sydney', 'Wollongong & the Illawarra', 'Newcastle & the Hunter'])
  assert.deepEqual(areaGroupLabels('Melbourne'), [])
  const areas = filterAreasForCity('Sydney')
  // The folded-in areas' suburbs are selectable on the Sydney board.
  for (const s of ['Hamilton', 'Merewether', 'Maitland', 'Wollongong', 'Thirroul', 'Kiama']) assert.ok(areas.includes(s), s)
  // Other boards keep exactly their own suburb list.
  assert.deepEqual(filterAreasForCity('Melbourne'), areasForCity('Melbourne'))

  const hunter = areaGroupFor('Sydney', 'Newcastle & the Hunter')!
  const illawarra = areaGroupFor('Sydney', 'Wollongong & the Illawarra')!
  const sydney = areaGroupFor('Sydney', 'Sydney')!
  const newcastleEvent = { city: 'Newcastle', suburb: 'Hamilton', latitude: -32.9267, longitude: 151.7789 }
  assert.equal(matchesAreaGroup(newcastleEvent, 'Sydney', hunter), true)
  assert.equal(matchesAreaGroup(newcastleEvent, 'Sydney', sydney), false)
  assert.equal(matchesAreaGroup(newcastleEvent, 'Sydney', illawarra), false)
  // A Sydney-filed event physically in the Illawarra belongs to that area, not Sydney.
  const thirroulEvent = { city: 'Sydney', suburb: 'Thirroul', latitude: -34.3157, longitude: 150.9285 }
  assert.equal(matchesAreaGroup(thirroulEvent, 'Sydney', illawarra), true)
  assert.equal(matchesAreaGroup(thirroulEvent, 'Sydney', sydney), false)
  const cbdEvent = { city: 'Sydney', suburb: 'Sydney', latitude: -33.8688, longitude: 151.2093 }
  assert.equal(matchesAreaGroup(cbdEvent, 'Sydney', sydney), true)
  assert.equal(matchesAreaGroup(cbdEvent, 'Sydney', hunter), false)
})

test('a known place resolves to the board it belongs to', () => {
  for (const city of CITIES) assert.equal(boardCityForPlace(city.name), city.name, city.name)
  // The folded-in places ride the Sydney board: Newcastle as a region member,
  // Wollongong as an area whose listings file to Sydney.
  assert.equal(boardCityForPlace('Newcastle'), 'Sydney')
  assert.equal(boardCityForPlace('Wollongong'), 'Sydney')
  // Unknown names stay unknown, so a caller can tell "not a place" apart.
  assert.equal(boardCityForPlace('Auckland'), null)
  assert.equal(boardCityForPlace(''), null)
  assert.equal(boardCityForPlace(null), null)
  assert.equal(boardCityForPlace(undefined), null)
})

test('a folded-in place names its area group on the board it belongs to', () => {
  assert.equal(areaGroupForPlace('Sydney', 'Newcastle')?.label, 'Newcastle & the Hunter')
  assert.equal(areaGroupForPlace('Sydney', 'Wollongong')?.label, 'Wollongong & the Illawarra')
  // A place is only an area on its own board, and plain suburbs are not areas.
  assert.equal(areaGroupForPlace('Melbourne', 'Newcastle'), undefined)
  assert.equal(areaGroupForPlace('Sydney', 'Hamilton'), undefined)
  assert.equal(areaGroupForPlace('Sydney', ''), undefined)
})
