import assert from 'node:assert/strict'
import test from 'node:test'
import { frontierExternalId, frontierShowsFromHtml } from './frontier-shows'

const html = `
<script type="application/ld+json">
[{"@type":"MusicEvent","name":"Benson Boone 2026","startDate":"2026-11-14","url":"https://frontiertouringcom.coredna.site/bensonboone","location":{"name":"Rod Laver Arena, Melbourne"}},
{"@type":"MusicEvent","name":"Khalid 2026","startDate":"2026-11-11","url":"https://frontiertouringcom.coredna.site/khalid","location":{"name":"Riverstage , Brisbane"}},
{"@type":"MusicEvent","name":"Benson Boone 2026","startDate":"2026-11-06","url":"https://frontiertouringcom.coredna.site/bensonboone","location":{"name":"Brisbane Entertainment Centre, Brisbane"}}]
</script>`

test('each Frontier date keeps its own venue and source id', () => {
  const shows = frontierShowsFromHtml(html)
  assert.equal(shows.length, 3)
  const melbourne = shows.find((show) => show.date === '2026-11-14')
  assert.equal(melbourne?.venueName, 'Rod Laver Arena')
  assert.equal(melbourne?.city, 'Melbourne')
  assert.equal(melbourne?.externalId, 'bensonboone|2026-11-14')
  const river = shows.find((show) => show.title === 'Khalid')
  assert.equal(river?.venueName, 'Riverstage')
  assert.equal(river?.city, 'Brisbane')
  assert.notEqual(frontierExternalId(shows[0].url, shows[0].date), frontierExternalId(shows[2].url, shows[2].date))
})

const afterpay = (name: string, date: string, path: string) => ({
  '@type': 'MusicEvent',
  name,
  startDate: date,
  url: `https://frontiertouringcom.coredna.site/${path}`,
  location: {
    '@type': 'Place',
    name: 'Afterpay Arena, Formerly known as Qudos Bank Arena |',
    address: {
      '@type': 'PostalAddress',
      streetAddress: null,
      addressLocality: null,
      addressRegion: null,
      postalCode: null,
      addressCountry: 'Australia',
    },
  },
})

test('Afterpay Arena dates are Sydney when the JSON-LD name has no city', () => {
  const body = JSON.stringify([
    afterpay('Benson Boone 2026', '2026-11-17T19:30', 'bensonboone'),
    afterpay('Benson Boone 2026', '2026-11-18', 'bensonboone'),
    afterpay('Benson Boone 2026', '2026-11-19', 'bensonboone'),
    afterpay('Khalid 2026', '2026-11-13', 'khalid'),
    afterpay('Boyz II Men 2026', '2026-12-04', 'boyziimen'),
    afterpay('Bryan Adams 2027', '2027-02-27', 'bryanadams'),
    {
      '@type': 'MusicEvent',
      name: 'Spark Arena Show 2026',
      startDate: '2026-11-20',
      url: 'https://frontiertouringcom.coredna.site/spark',
      location: { name: 'Spark Arena, Auckland' },
    },
  ])
  const shows = frontierShowsFromHtml(`<script type="application/ld+json">${body}</script>`)
  assert.equal(shows.length, 6)
  const benson = shows.filter((show) => show.title === 'Benson Boone')
  assert.deepEqual(benson.map((show) => show.date), ['2026-11-17', '2026-11-18', '2026-11-19'])
  assert.equal(benson[0]?.time, '19:30')
  assert.equal(benson[0]?.city, 'Sydney')
  assert.equal(benson[0]?.venueName, 'Afterpay Arena')
  assert.match(benson[0]?.venueAddress ?? '', /Qudos Bank Arena/)
  assert.equal(benson[0]?.externalId, 'bensonboone|2026-11-17')
  for (const title of ['Khalid', 'Boyz II Men', 'Bryan Adams']) {
    const show = shows.find((row) => row.title === title)
    assert.equal(show?.city, 'Sydney', title)
    assert.equal(show?.venueName, 'Afterpay Arena', title)
  }
  assert.equal(shows.some((show) => /auckland/i.test(show.venueName)), false)
})

test('JSON-LD address, locality, postcode and pin fill the city when the name does not', () => {
  const graph = {
    '@graph': [
      {
        '@type': ['MusicEvent'],
        name: 'Local Hall 2026',
        startDate: '2026-12-01',
        url: 'https://frontiertouringcom.coredna.site/hall',
        location: {
          name: 'Hall',
          address: {
            streetAddress: 'Edwin Flack Ave',
            addressLocality: 'Sydney Olympic Park',
            addressRegion: 'NSW',
            postalCode: '2127',
          },
        },
      },
      {
        '@type': 'MusicEvent',
        name: 'Postcode Only 2026',
        startDate: '2026-12-02',
        url: 'https://frontiertouringcom.coredna.site/postcode',
        location: { name: 'Hall', address: { postalCode: '6000' } },
      },
      {
        '@type': 'MusicEvent',
        name: 'Pinned 2026',
        startDate: '2026-12-03T20:00',
        url: 'https://frontiertouringcom.coredna.site/pinned',
        location: { name: 'Hall', geo: { '@type': 'GeoCoordinates', latitude: -37.82, longitude: 144.98 } },
      },
      {
        '@type': 'MusicEvent',
        name: 'String Address 2026',
        startDate: '2026-12-05',
        url: 'https://frontiertouringcom.coredna.site/string-address',
        location: { name: 'Hall', address: '1 Olympic Blvd, NSW 2127' },
      },
      {
        '@type': 'MusicEvent',
        name: 'Split Cities 2026',
        startDate: '2026-12-04',
        url: 'https://frontiertouringcom.coredna.site/split',
        location: [{ name: 'Afterpay Arena' }, { name: 'Marvel Stadium' }],
      },
    ],
  }
  const shows = frontierShowsFromHtml(`<script type="application/ld+json">${JSON.stringify(graph)}</script>`)
  assert.equal(shows.length, 4)
  const hall = shows.find((show) => show.date === '2026-12-01')
  assert.equal(hall?.city, 'Sydney')
  assert.equal(hall?.venueName, 'Hall')
  assert.match(hall?.venueAddress ?? '', /Sydney Olympic Park/)
  assert.match(hall?.venueAddress ?? '', /2127/)
  assert.equal(shows.find((show) => show.date === '2026-12-02')?.city, 'Perth')
  assert.equal(shows.find((show) => show.date === '2026-12-05')?.city, 'Sydney')
  const pinned = shows.find((show) => show.date === '2026-12-03')
  assert.equal(pinned?.city, 'Melbourne')
  assert.equal(pinned?.time, '20:00')
  assert.equal(shows.some((show) => show.title === 'Split Cities'), false)
})
