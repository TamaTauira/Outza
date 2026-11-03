import assert from 'node:assert/strict'
import test from 'node:test'
import { duplicateSpikeAlert, emptyFeedAlert, parseFailureAlert, retireOnEmpty, venueGapAlert, volumeAlert } from './source-health'
import { SOURCE_REGISTER, registerByStatus } from './sources/register'
import { parseBccRecord, parseBccRecords, brisbaneWall, bccExternalId, type BccRecord } from './sources/brisbane-council'

test('an empty or shrinking source alerts and never retires listings', () => {
  assert.equal(volumeAlert(120, 0, {}), 'zero')
  assert.equal(volumeAlert(120, 40, {}), 'drop')
  assert.equal(volumeAlert(120, 0, { timedOut: true }), null)
  assert.equal(volumeAlert(120, 0, { failed: true }), null)
  assert.equal(volumeAlert(0, 0, {}), null)
  assert.equal(emptyFeedAlert(0), true)
  assert.equal(retireOnEmpty(0), false)
  assert.equal(parseFailureAlert(8, 12), true)
  assert.equal(parseFailureAlert(100, 3), false)
  assert.equal(duplicateSpikeAlert(400, 120), true)
  assert.equal(duplicateSpikeAlert(40, 30), false)
  assert.equal(venueGapAlert(10, 40), true)
})

test('the register keeps current connectors and does not invent unmeasured counts', () => {
  const ids = SOURCE_REGISTER.map((row) => row.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of ['ticketmaster', 'frontier', 'cityofsydney', 'humanitix', 'moshtix', 'oztix', 'ticketek', 'eventbrite', 'curated']) {
    assert.ok(ids.includes(id), id)
  }
  assert.equal(registerByStatus('integrated').some((row) => row.id === 'brisbanecouncil'), true)
  assert.equal(registerByStatus('permission').some((row) => row.id === 'sydney-opera-house'), true)
  assert.equal(registerByStatus('permission').some((row) => row.id === 'afterpay-arena'), true)
  assert.equal(registerByStatus('permission').some((row) => row.id === 'tiktok-entertainment-centre'), true)
  for (const row of SOURCE_REGISTER) {
    if (row.measuredFeedRows == null) assert.equal(row.measuredOn, null)
  }
  const brisbane = SOURCE_REGISTER.find((row) => row.id === 'brisbanecouncil')
  assert.equal(brisbane?.measuredFeedRows, 2000)
  assert.equal(brisbane?.measuredOn, '2026-11-03')
})

const parkrun: BccRecord = {
  subject: 'parkrun',
  web_link: 'https://www.brisbane.qld.gov.au/trumba?trumbaEmbed=view%3Devent%26eventid%3D212118402',
  location: 'Wishart Community Park, Wishart',
  start_datetime: '2026-11-13T21:00:00+00:00',
  end_datetime: '2026-11-13T22:30:00+00:00',
  description: 'parkrun is a free, community event.',
  event_type: ['Fitness & well-being', 'Free'],
  venue: 'Wishart Community Park, Wishart',
  venueaddress: 'Wishart Community Park, 106A Kavanagh Road, Wishart',
  cost: 'Free',
  age: '4 years and over.',
  status: null,
  geolocation: { lon: 153.1008, lat: -27.5664 },
}

const noAddress: BccRecord = {
  subject: 'Air fryer fun',
  web_link: 'https://www.brisbane.qld.gov.au/trumba?trumbaEmbed=view%3Devent%26eventid%3D210630782',
  location: 'Wynnum Manly & Districts Mens Shed, 59 Granada St, Wynnum',
  start_datetime: '2026-11-14T04:00:00+00:00',
  end_datetime: '2026-11-14T06:00:00+00:00',
  description: 'Cooking session.',
  venue: null,
  venueaddress: null,
  cost: 'Free',
  bookings: 'Bookings essential. <a href="https://pennybenjamin.com.au/classes">Book</a>.',
  geolocation: null,
}

test('Brisbane open-data rows keep the published address and local time', () => {
  assert.deepEqual(brisbaneWall('2026-11-13T21:00:00+00:00'), { date: '2026-11-14', time: '07:00' })
  assert.equal(bccExternalId(parkrun.web_link), '212118402')
  const parsed = parseBccRecord(parkrun)
  assert.ok(parsed)
  assert.equal(parsed?.date, '2026-11-14')
  assert.equal(parsed?.time, '07:00')
  assert.equal(parsed?.venueAddress, 'Wishart Community Park, 106A Kavanagh Road, Wishart')
  assert.equal(parsed?.isFree, true)
  assert.equal(parsed?.latitude, -27.5664)
  assert.equal(parsed?.source, 'brisbanecouncil')
  assert.equal(parsed?.city, 'Brisbane')
  const shed = parseBccRecord(noAddress)
  assert.equal(shed?.venueAddress, null)
  assert.equal(shed?.venueName, 'Wynnum Manly & Districts Mens Shed, 59 Granada St, Wynnum')
  assert.equal(shed?.ticketUrl, 'https://pennybenjamin.com.au/classes')
  const batch = parseBccRecords([parkrun, { subject: 'Broken', start_datetime: 'not-a-date' }, noAddress])
  assert.equal(batch.parsed, 2)
  assert.equal(batch.failed, 1)
})

test('a cancelled council row is marked and photos are not copied', () => {
  const parsed = parseBccRecord({ ...parkrun, status: 'Cancelled by the organiser', eventimage: 'https://www.trumba.com/i/photo.jpg' } as BccRecord & { eventimage?: string })
  assert.equal(parsed?.status, 'CANCELLED')
  assert.equal('imageUrl' in (parsed ?? {}), false)
})
