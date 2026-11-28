import assert from 'node:assert/strict'
import test from 'node:test'
import { scanInChunks, shapeLandingEvents, suburbCountsFromRows, type LandingEvent, type SuburbCountRow } from './seo-server'
import { cityDef } from './cities'

const sydney = cityDef('Sydney')

test('scanInChunks walks the whole set in board-sized chunks', async () => {
  const all = Array.from({ length: 650 }, (_, i) => i)
  const calls: number[] = []
  const { rows, truncated } = await scanInChunks(async (skip, take) => {
    calls.push(skip)
    return all.slice(skip, skip + take)
  })
  assert.equal(rows.length, 650)
  assert.equal(truncated, false)
  assert.deepEqual(calls, [0, 300, 600], 'chunks are the board scan size, stopping at the first short chunk')
})

test('scanInChunks flags a capped scan instead of passing a partial count as exact', async () => {
  const { rows, truncated } = await scanInChunks(async (_skip, take) => Array.from({ length: take }, () => 1))
  assert.equal(truncated, true)
  assert.equal(rows.length, 60_000, 'the cap is the board exact-gather cap')
})

const ev = (over: Record<string, unknown> = {}): LandingEvent => ({
  id: 'a', title: 'Gig Night', date: new Date('2027-03-05T00:00:00Z'), endDate: null, time: '19:00', endTime: null,
  venueName: 'Enmore Theatre', venueAddress: '118-132 Enmore Rd, Enmore NSW 2042', suburb: 'Enmore',
  category: 'Music', subTags: [], isLGBTI: false, isFree: false, price: null, priceMin: null, priceMax: null,
  imageUrl: null, ticketUrl: null, status: 'SCHEDULED', latitude: null, longitude: null,
  organiserName: null, organiserUrl: null, city: 'Sydney', source: 'ticketmaster', sources: [],
  lastVerifiedAt: null, statusSource: null, duplicateOfId: null,
  ...over,
} as unknown as LandingEvent)

test('the guide total counts shaped rows: duplicates collapse, past, mis-filed and title-mismatched rows drop', () => {
  // landingEvents' total is the length of this shaped sequence and the
  // page is a slice of it, so the printed total can never exceed what
  // the list can show (the guide counterpart of the board's E2E-17 fix).
  const shaped = shapeLandingEvents([
    ev({ id: 'a' }),
    ev({ id: 'b' }),
    ev({ id: 'c', venueName: 'The Vanguard', title: 'Other Gig' }),
    ev({ id: 'd', title: 'Old Gig', date: new Date('2020-01-03T00:00:00Z') }),
    ev({ id: 'e', title: 'Far Away', venueName: 'Forum Melbourne', venueAddress: '154 Flinders St, Melbourne VIC 3000', suburb: 'Melbourne' }),
    ev({ id: 'f', title: 'Gig Night 7 November' }),
  ], sydney)
  assert.deepEqual(shaped.map((e) => e.id), ['a', 'c'], 'one row per showing; the past, other-state and wrong-date rows are not counted')
})

const sub = (over: Record<string, unknown> = {}): SuburbCountRow => ({
  id: 'a', title: 'Gig Night', date: new Date('2027-03-05T00:00:00Z'), endDate: null, time: '19:00', endTime: null,
  endsAt: null, allDay: false, venueName: 'Enmore Theatre', venueAddress: '118-132 Enmore Rd, Enmore NSW 2042',
  suburb: 'Enmore', city: 'Sydney', ticketUrl: null, source: 'ticketmaster', description: null,
  ...over,
} as unknown as SuburbCountRow)

test('suburb counts count showings the suburb page can show, not stored rows', () => {
  const counts = suburbCountsFromRows([
    sub({ id: 'a' }),
    sub({ id: 'b' }),
    sub({ id: 'c', title: 'Other Gig', venueName: 'The Vanguard' }),
    sub({ id: 'f', suburb: 'enmore', title: 'Third Gig', venueName: 'The Warren' }),
    sub({ id: 'd', suburb: 'newtown', title: 'Solo Show', venueName: 'King Street Theatre' }),
    sub({ id: 'e', suburb: 'Newtown', title: 'Past Show', date: new Date('2020-01-03T00:00:00Z') }),
  ], sydney, 1)
  assert.deepEqual(counts, [
    { name: 'Enmore', slug: 'enmore', count: 3 },
    { name: 'newtown', slug: 'newtown', count: 1 },
  ], 'duplicate showings collapse, casing variants share a slug, and the past row is not counted')
  assert.deepEqual(suburbCountsFromRows([sub({ id: 'a' })], sydney, 3), [], 'the minimum still applies to the shaped count')
})
