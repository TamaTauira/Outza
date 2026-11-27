import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CITIES, INGEST_CITIES } from './cities'
import { aliasCities, cityForIngest, cityFromPlace, cityFromPostcode, VENUE_CITY_ALIASES } from './venue-city'

const GENERIC = /^(arena|stadium|theatre|theater|park|hotel|hall|oval|centre|center|pavilion|house|garden|gardens|bowl|civic|star|gov)$/

test('every venue alias maps to one filed city and is not a generic word', () => {
  const seen = new Map<string, string>()
  for (const group of VENUE_CITY_ALIASES) {
    assert.ok(INGEST_CITIES.some((city) => city.name === group.city), group.city)
    for (const name of group.names) {
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
      assert.equal(GENERIC.test(key), false, name)
      assert.equal(seen.get(key), undefined, `${name} is listed twice`)
      seen.set(key, group.city)
      assert.equal(cityFromPlace({ name })?.name, group.city, name)
    }
  }
})

test('Sydney arenas and precincts match without the word Sydney', () => {
  for (const name of [
    'Afterpay Arena, Formerly known as Qudos Bank Arena |',
    'Qudos Bank Arena',
    'Allphones Arena',
    'Acer Arena',
    'SuperDome',
    'Accor Stadium',
    'Stadium Australia',
    'ANZ Stadium',
    'Telstra Stadium',
    'Allianz Stadium',
    'Hordern Pavilion',
    'The Hordern',
    'Enmore',
    'Enmore Theatre',
    'Factory Theatre',
    'ICC',
    'International Convention Centre',
    'Sydney Olympic Park',
    'Homebush',
    'Moore Park',
    'CommBank Stadium',
    'Bankwest Stadium',
    'SCG',
    'TikTok Entertainment Centre',
    'Opera House',
    'Carriageworks',
    'Metro Theatre',
    'Darling Harbour',
    'Barangaroo',
    'Parramatta',
    '19 Edwin Flack Avenue',
  ]) {
    assert.equal(cityFromPlace({ name })?.name, 'Sydney', name)
  }
})

test('Melbourne, Brisbane, Perth and Adelaide venues match without the city', () => {
  const cases: [string, string][] = [
    ['Rod Laver Arena', 'Melbourne'],
    ['John Cain Arena', 'Melbourne'],
    ['Hisense Arena', 'Melbourne'],
    ['Margaret Court Arena', 'Melbourne'],
    ['Marvel Stadium', 'Melbourne'],
    ['Etihad Stadium', 'Melbourne'],
    ['Telstra Dome', 'Melbourne'],
    ['AAMI Park', 'Melbourne'],
    ['MCG', 'Melbourne'],
    ['Hamer Hall', 'Melbourne'],
    ['Palais Theatre', 'Melbourne'],
    ['Sidney Myer Music Bowl', 'Melbourne'],
    ['Forum', 'Melbourne'],
    ['The Forum', 'Melbourne'],
    ['170 Russell', 'Melbourne'],
    ['Corner Hotel', 'Melbourne'],
    ['Riverstage', 'Brisbane'],
    ['Suncorp Stadium', 'Brisbane'],
    ['Lang Park', 'Brisbane'],
    ['The Gabba', 'Brisbane'],
    ['The Tivoli', 'Brisbane'],
    ['The Triffid', 'Brisbane'],
    ['The Fortitude Music Hall', 'Brisbane'],
    ['QPAC', 'Brisbane'],
    ['Optus Stadium', 'Perth'],
    ['RAC Arena', 'Perth'],
    ['HBF Park', 'Perth'],
    ['Red Hill Auditorium', 'Perth'],
    ['Freo.Social', 'Perth'],
    ['Kings Park', 'Perth'],
    ['Thebarton Theatre', 'Adelaide'],
    ['Coopers Stadium', 'Adelaide'],
    ['Hindmarsh Stadium', 'Adelaide'],
    ['AAMI Stadium', 'Adelaide'],
    ['Hindley Street Music Hall', 'Adelaide'],
    ['The Gov', 'Adelaide'],
  ]
  for (const [name, city] of cases) assert.equal(cityFromPlace({ name })?.name, city, name)
})

test('the other capitals match their venues and renamed stadiums', () => {
  const cases: [string, string][] = [
    ['HOTA', 'Gold Coast'],
    ['Home of the Arts', 'Gold Coast'],
    ['Cbus Super Stadium', 'Gold Coast'],
    ['Metricon Stadium', 'Gold Coast'],
    ['GIO Stadium', 'Canberra'],
    ['AIS Arena', 'Canberra'],
    ['The Baso', 'Canberra'],
    ['MyState Bank Arena', 'Hobart'],
    ['Blundstone Arena', 'Hobart'],
    ['Bellerive Oval', 'Hobart'],
    ['Odeon Theatre', 'Hobart'],
    ['TIO Stadium', 'Darwin'],
    ['Marrara Oval', 'Darwin'],
    ['Mindil Beach', 'Darwin'],
  ]
  for (const [name, city] of cases) assert.equal(cityFromPlace({ name })?.name, city, name)
})

test('a stated city beats a venue alias, and two cities are not guessed', () => {
  assert.equal(cityFromPlace({ name: 'Hordern Pavilion, Melbourne' })?.name, 'Melbourne')
  assert.equal(cityFromPlace({ name: 'Show in Sydney then Melbourne' })?.name, 'Melbourne')
  assert.equal(cityFromPlace({ locality: 'Melbourne', name: 'Hordern Pavilion' })?.name, 'Melbourne')
  assert.equal(cityFromPlace({ name: 'Afterpay Arena / Marvel Stadium' }), null)
  assert.equal(aliasCities('ICC World Cup, MCG').length, 2)
  assert.equal(cityFromPlace({ name: 'ICC World Cup, MCG' }), null)
})

test('names that are not one catalogue city stay unresolved', () => {
  for (const name of [
    'Festival Hall',
    'State Theatre',
    'Princess Theatre',
    'Astor Theatre',
    "Max Watt's",
    'Town Hall',
    'Civic Hall',
    'Luna Park',
    'The Star',
    'Spark Arena, Auckland',
    'Powerstation, Auckland',
    'Costa Hall, Geelong',
    'Civic Hall , Ballarat',
    "Anita's Theatre, Thirroul",
    'Queensland Country Bank Stadium, Townsville',
    'Torquay Hotel, Torquay',
    'Barwon Heads Hotel, Barwon Heads',
    'Eden Park, Auckland',
    'Hall',
    'Australia',
  ]) {
    assert.equal(cityFromPlace({ name }), null, name)
  }
  assert.equal(cityFromPlace({ name: 'Town Hall', region: 'NSW' }), null)
  assert.equal(cityFromPlace({ name: 'Town Hall', region: 'VIC' }), null)
  assert.equal(cityFromPlace({ name: 'Benson Boone 2026' }), null)
})

test('address, locality and postcode fields identify the city when the venue name does not', () => {
  assert.equal(cityFromPlace({ name: 'Hall', locality: 'Sydney Olympic Park' })?.name, 'Sydney')
  assert.equal(cityFromPlace({ name: 'Hall', locality: 'Enmore' })?.name, 'Sydney')
  assert.equal(cityFromPlace({ name: 'Arena', address: '19 Edwin Flack Avenue' })?.name, 'Sydney')
  assert.equal(cityFromPlace({ name: 'Hall', address: '19 Edwin Flack Ave, NSW 2127' })?.name, 'Sydney')
  assert.equal(cityFromPlace({ name: 'Hall', postcode: '2127' })?.name, 'Sydney')
  assert.equal(cityFromPlace({ name: 'Hall', postcode: 2127 })?.name, 'Sydney')
  assert.equal(cityFromPlace({ name: 'Hall', postcode: 'NSW 2127' })?.name, 'Sydney')
  assert.equal(cityFromPlace({ name: 'Hall', address: 'St Kilda Rd, VIC 3004' })?.name, 'Melbourne')
  assert.equal(cityFromPostcode('4207')?.name, 'Brisbane')
  assert.equal(cityFromPostcode('4208')?.name, 'Gold Coast')
  assert.equal(cityFromPostcode('4217')?.name, 'Gold Coast')
  assert.equal(cityFromPostcode('2300')?.name, 'Newcastle')
  assert.equal(cityFromPostcode('0800')?.name, 'Darwin')
  assert.equal(cityFromPostcode('800')?.name, 'Darwin')
  assert.equal(cityFromPostcode('6000')?.name, 'Perth')
  assert.equal(cityFromPostcode('5000')?.name, 'Adelaide')
  assert.equal(cityFromPostcode('2600')?.name, 'Canberra')
  assert.equal(cityFromPostcode('7000')?.name, 'Hobart')
  assert.equal(cityFromPostcode('3220'), null)
  assert.equal(cityFromPostcode('3350'), null)
  assert.equal(cityFromPostcode('4810'), null)
  assert.equal(cityFromPostcode('2500')?.name, 'Sydney')
  assert.equal(cityFromPostcode('2515')?.name, 'Sydney')
  assert.equal(cityFromPostcode('2534')?.name, 'Sydney')
  assert.equal(cityFromPostcode('2499'), null)
  assert.equal(cityFromPostcode('2535'), null)
  assert.equal(cityFromPlace({ name: 'Afterpay Arena', postcode: '3000' })?.name, 'Melbourne')
})

test('a pin inside a city radius wins, and a pin outside every city does not', () => {
  assert.equal(cityFromPlace({ name: 'Hall', lat: -33.847, lng: 151.066 })?.name, 'Sydney')
  assert.equal(cityFromPlace({ name: 'Marvel Stadium', lat: -33.847, lng: 151.066 })?.name, 'Sydney')
  assert.equal(cityFromPlace({ name: 'Hall', lat: '-37.82', lng: '144.98' })?.name, 'Melbourne')
  assert.equal(cityFromPlace({ name: 'Costa Hall', lat: -38.15, lng: 144.36 }), null)
  assert.equal(cityFromPlace({ name: 'Spark Arena', lat: -36.85, lng: 174.76 }), null)
  assert.equal(cityFromPlace({ lat: 0, lng: 0 }), null)
})

test('existing city words still match, including traditional names', () => {
  assert.equal(cityFromPlace({ name: 'Rod Laver Arena, Melbourne' })?.name, 'Melbourne')
  assert.equal(cityFromPlace({ name: 'Riverstage , Brisbane' })?.name, 'Brisbane')
  assert.equal(cityFromPlace({ name: 'Metropolis Fremantle' })?.name, 'Perth')
  assert.equal(cityFromPlace({ name: 'The Star Gold Coast' })?.name, 'Gold Coast')
  assert.equal(cityFromPlace({ name: 'Boorloo' })?.name, 'Perth')
  assert.equal(cityFromPlace({ name: 'Naarm' })?.name, 'Melbourne')
  assert.equal(cityFromPlace({ name: 'Meanjin' })?.name, 'Brisbane')
  assert.equal(cityFromPlace({ locality: 'Tarntanya' })?.name, 'Adelaide')
})

test('ticket and Moshtix feeds use the same place matcher and do not scrape Ticketek', () => {
  const src = readFileSync(new URL('./sources/ticketing.ts', import.meta.url), 'utf8')
  assert.match(src, /cityFromPlace\(\{/)
  assert.equal(src.match(/cityFromPlace\(\{/g)?.length, 2)
  assert.doesNotMatch(src, /toLowerCase\(\) === cityName/)
  assert.doesNotMatch(src, /fetch\(\s*[`'"]https?:\/\/[^`'"]*ticketek\.com/i)
  assert.match(src, /no licensed feed configured/)
})

test('Wollongong is not a catalogue city and its listings fold into Sydney', () => {
  assert.equal(CITIES.some((city) => city.name === 'Wollongong'), false)
  assert.equal(CITIES.some((city) => city.name === 'Newcastle'), false)
  // The WIN venues are aliased to Sydney, so a named Wollongong stadium still files.
  assert.equal(cityFromPlace({ name: 'WIN Stadium' })?.name, 'Sydney')
  assert.equal(cityFromPlace({ name: 'WIN Entertainment Centre' })?.name, 'Sydney')
  // The word Wollongong on its own no longer resolves to a city.
  assert.equal(cityFromPlace({ name: 'Hall', locality: 'Wollongong' }), null)
  assert.equal(cityFromPlace({ name: 'Hall', address: '12 Illawarra Rd, Marrickville' }), null)
  assert.equal(cityFromPlace({ name: 'Hall', address: '12 Illawarra Rd, Marrickville NSW 2204' })?.name, 'Sydney')
  // Bulli sits inside Sydney's 60km radius, so the pin alone now files it to Sydney.
  assert.equal(cityFromPlace({ lat: -34.338, lng: 150.922 })?.name, 'Sydney')
  assert.equal(cityForIngest(-34.338, 150.922)?.name, 'Sydney')
  // Helensburgh is inside Sydney's 60km too.
  assert.equal(cityFromPlace({ lat: -34.178, lng: 150.983 })?.name, 'Sydney')
  assert.equal(cityForIngest(-34.178, 150.983)?.name, 'Sydney')
  // The WIN Stadium pin is about 68km from the Sydney centre: outside the strict
  // radius, so the strict matcher leaves it unresolved, but ingest slack files it to Sydney.
  assert.equal(cityFromPlace({ name: 'Somewhere', lat: -34.4254, lng: 150.9015 }), null)
  assert.equal(cityForIngest(-34.4254, 150.9015)?.name, 'Sydney')
  const ranges = Object.values(
    Object.fromEntries(
      // Re-read through the public postcode helper so a shared range fails the test.
      ['2000', '2249', '2500', '2534', '2555'].map((postcode) => [postcode, cityFromPostcode(postcode)?.name ?? '']),
    ),
  )
  assert.deepEqual(ranges, ['Sydney', 'Sydney', 'Sydney', 'Sydney', 'Sydney'])
})

test('Newcastle files again as an ingest-only city, never a catalogue city', () => {
  assert.equal(CITIES.some((city) => city.name === 'Newcastle'), false)
  assert.equal(INGEST_CITIES.some((city) => city.name === 'Newcastle'), true)
  // Its stadiums and rooms file without the word Newcastle.
  for (const name of ['McDonald Jones Stadium', 'Hunter Stadium', 'EnergyAustralia Stadium', 'Ausgrid Stadium', 'King Street Bandroom']) {
    assert.equal(cityFromPlace({ name })?.name, 'Newcastle', name)
  }
  // Its postcode ranges are its own again; the gap between them stays unresolved.
  assert.equal(cityFromPostcode('2280')?.name, 'Newcastle')
  assert.equal(cityFromPostcode('2292')?.name, 'Newcastle')
  assert.equal(cityFromPostcode('2310')?.name, 'Newcastle')
  assert.equal(cityFromPostcode('2311'), null)
  assert.equal(cityFromPostcode('2318')?.name, 'Newcastle')
  assert.equal(cityFromPostcode('2324')?.name, 'Newcastle')
  // The stated word and a CBD pin file it too.
  assert.equal(cityFromPlace({ name: 'Gig', locality: 'Newcastle' })?.name, 'Newcastle')
  assert.equal(cityFromPlace({ name: 'Hall', lat: -32.9267, lng: 151.7789 })?.name, 'Newcastle')
  assert.equal(cityForIngest(-32.9267, 151.7789)?.name, 'Newcastle')
  // A Newcastle pin is far outside Sydney's ingest slack, so it never falls back there.
  assert.notEqual(cityForIngest(-32.9267, 151.7789)?.name, 'Sydney')
})
