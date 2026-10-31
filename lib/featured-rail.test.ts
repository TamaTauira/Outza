import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dateKeyOf, rankBoard } from './listing-window'
import {
  CROWD_FLOOR,
  CROWD_TARGET,
  buildFeaturedRail,
  orderPaidPlacements,
  type CrowdCard,
  type FeaturedRailInput,
} from './featured-rail'

const day = '2026-10-31'
const city = 'Sydney'

function card(over: Partial<CrowdCard> & { id: string }): CrowdCard {
  return {
    title: over.title ?? over.id,
    date: `${day}T00:00:00.000Z`,
    time: '20:00',
    endTime: '22:00',
    city,
    status: 'SCHEDULED',
    duplicateOfId: null,
    venueName: 'Venue',
    saves: 0,
    attendees: 0,
    views: 0,
    imageUrl: null,
    tier: 'HOT',
    sponsored: false,
    ...over,
  }
}

function paid(over: Partial<CrowdCard> & { id: string }): CrowdCard {
  return card({ sponsored: true, tier: 'GOLD', time: '19:00', endTime: '22:00', ...over })
}

function rail(over: Partial<FeaturedRailInput<CrowdCard>> & { nowMinutes: number }): CrowdCard[] {
  return buildFeaturedRail({
    today: [],
    upcoming: [],
    imaged: [],
    sponsored: [],
    day,
    city,
    ...over,
  })
}

function ids(rows: { id?: string }[]) {
  return rows.map((row) => row.id)
}

test('an empty now-window still returns popular upcoming events and paid placements', () => {
  const nowMinutes = 10 * 60
  const today = [
    card({ id: 'ended', time: '08:00', endTime: '09:00', saves: 500 }),
    card({ id: 'called-off', time: '19:00', endTime: '22:00', status: 'CANCELLED', saves: 500 }),
    card({ id: 'copy', time: '19:00', endTime: '22:00', duplicateOfId: 'ended', saves: 500 }),
  ]
  const upcoming = [
    card({ id: 'week-pop', date: '2026-11-06T00:00:00.000Z', time: '19:00', saves: 12, attendees: 3, views: 40 }),
    card({ id: 'later-pop', date: '2026-11-12T00:00:00.000Z', time: '19:00', saves: 80, attendees: 10, views: 90 }),
    card({ id: 'week-cancel', date: '2026-11-04T00:00:00.000Z', status: 'CANCELLED', saves: 200 }),
    card({ id: 'week-dup', date: '2026-11-05T00:00:00.000Z', duplicateOfId: 'week-pop', saves: 200 }),
  ]
  const sponsored = [
    paid({ id: 'paid-nov', date: '2026-11-07T00:00:00.000Z', tier: 'GOLD' }),
    paid({ id: 'paid-feb', date: '2027-02-14T00:00:00.000Z', tier: 'SILVER' }),
    paid({ id: 'paid-off', date: '2026-11-08T00:00:00.000Z', status: 'CANCELLED', tier: 'GOLD' }),
    paid({ id: 'paid-copy', date: '2026-11-09T00:00:00.000Z', duplicateOfId: 'paid-nov', tier: 'GOLD' }),
  ]
  const windowRows = [...today, ...upcoming, ...sponsored]
  const ranked = rankBoard(windowRows, { window: 'now', day, nowMinutes, dropEnded: true })
  const nowWindow = [...ranked.lead, ...ranked.soon, ...ranked.still, ...ranked.allday, ...ranked.possibly]
  assert.deepEqual(ids(nowWindow), [])

  const keptPaid = orderPaidPlacements(sponsored, { day, city, nowMinutes })
  assert.deepEqual(ids(keptPaid), ['paid-nov', 'paid-feb'])

  const items = rail({ today, upcoming, sponsored, nowMinutes })
  assert.equal(items[0]?.id, 'week-pop')
  assert.ok(items.some((row) => row.id === 'week-pop'))
  assert.ok(items.some((row) => row.id === 'later-pop'))
  assert.ok(items.findIndex((row) => row.id === 'week-pop') < items.findIndex((row) => row.id === 'later-pop'))
  const paidRows = items.filter((row) => row.sponsored)
  assert.ok(paidRows.length > 0)
  assert.equal(paidRows[0]?.id, 'paid-nov')
  assert.equal(paidRows[0]?.tier, 'GOLD')
  assert.ok(paidRows.length / items.length <= 1 / 3 + 1e-9)
  assert.equal(items.some((row) => ['ended', 'called-off', 'copy', 'week-cancel', 'week-dup', 'paid-off', 'paid-copy'].includes(row.id)), false)
})

test('crowd favourites fill on now, then today by saves, then the next week soonest', () => {
  const nowMinutes = 14 * 60
  const today = [
    card({ id: 'still-on', time: '09:00', endTime: '18:00', saves: 0 }),
    card({ id: 'soon', time: '16:30', endTime: '18:00', saves: 0 }),
    card({ id: 'going', time: '19:00', endTime: '21:00', saves: 5, attendees: 4, views: 1 }),
    card({ id: 'views', time: '18:00', endTime: '20:00', saves: 5, attendees: 0, views: 50 }),
    card({ id: 'tonight', time: '21:00', endTime: '23:00', saves: 2, attendees: 0, views: 0 }),
    card({ id: 'ended', time: '08:00', endTime: '09:00', saves: 100 }),
    card({ id: 'moved', time: '16:00', endTime: '18:00', status: 'RESCHEDULED', saves: 1 }),
  ]
  const upcoming = [
    card({ id: 'in-ten', date: '2026-11-10T00:00:00.000Z', saves: 100 }),
    card({ id: 'tomorrow-quiet', date: '2026-11-01T00:00:00.000Z', saves: 1 }),
    card({ id: 'tomorrow-loud', date: '2026-11-01T00:00:00.000Z', time: '21:00', saves: 30 }),
    card({ id: 'saturday', date: '2026-11-07T00:00:00.000Z', saves: 20 }),
  ]
  const organic = rail({ today, upcoming, nowMinutes }).filter((row) => !row.sponsored)
  assert.deepEqual(ids(organic), [
    'moved', 'soon', 'still-on',
    'going', 'views', 'tonight',
    'tomorrow-loud', 'saturday',
  ])
  assert.equal(organic.some((row) => row.id === 'ended' || row.id === 'tomorrow-quiet' || row.id === 'in-ten'), false)
  assert.equal(organic.length, CROWD_TARGET)
})

test('a thin rail fills to the floor with upcoming events that have images', () => {
  assert.equal(CROWD_FLOOR, 4)
  assert.equal(CROWD_TARGET, 8)
  const upcoming = [card({ id: 'only', date: '2026-11-06T00:00:00.000Z', saves: 4, imageUrl: null })]
  const imaged = [
    card({ id: 'pic-late', date: '2026-11-20T00:00:00.000Z', imageUrl: 'https://cdn.example/late.jpg' }),
    card({ id: 'pic-soon', date: '2026-11-02T00:00:00.000Z', imageUrl: 'https://cdn.example/soon.jpg' }),
    card({ id: 'pic-mid', date: '2026-11-04T00:00:00.000Z', imageAsset: { status: 'OK' }, imageUrl: null }),
    card({ id: 'blank', date: '2026-11-01T00:00:00.000Z', imageUrl: '   ' }),
    card({ id: 'failed', date: '2026-11-01T00:00:00.000Z', imageUrl: null, imageAsset: { status: 'FAILED' } }),
    card({ id: 'pic-extra', date: '2026-11-03T00:00:00.000Z', imageUrl: 'https://cdn.example/extra.jpg' }),
    card({ id: 'pic-fifth', date: '2026-11-05T00:00:00.000Z', imageUrl: 'https://cdn.example/fifth.jpg' }),
  ]
  const sponsored = [paid({ id: 'paid-nov', date: '2026-11-07T00:00:00.000Z' })]
  const items = rail({ upcoming, imaged, sponsored, nowMinutes: 10 * 60 })
  const organic = items.filter((row) => !row.sponsored)
  assert.deepEqual(ids(organic), ['only', 'pic-soon', 'pic-extra', 'pic-mid'])
  assert.equal(organic.length, CROWD_FLOOR)
  assert.ok(items.some((row) => row.id === 'paid-nov' && row.sponsored && row.tier === 'GOLD'))
  assert.equal(items.some((row) => ['blank', 'failed', 'pic-late', 'pic-fifth'].includes(row.id)), false)
})

test('paid placements on now lead, and later paid placements stay in package order', () => {
  const nowMinutes = 10 * 60
  const sponsored = [
    paid({ id: 'later-gold', date: `${day}T00:00:00.000Z`, time: '21:00', endTime: '23:00', tier: 'GOLD' }),
    paid({ id: 'future-gold', date: '2026-11-07T00:00:00.000Z', tier: 'GOLD' }),
    paid({ id: 'now-silver', time: '09:30', endTime: '12:00', tier: 'SILVER' }),
    paid({ id: 'ended-gold', time: '08:00', endTime: '09:00', tier: 'GOLD' }),
  ]
  const ordered = orderPaidPlacements(sponsored, { day, city, nowMinutes })
  assert.deepEqual(ids(ordered), ['now-silver', 'later-gold', 'future-gold'])
  const items = rail({ sponsored, nowMinutes })
  assert.deepEqual(ids(items), ['now-silver', 'later-gold', 'future-gold'])
  assert.ok(items.every((row) => row.sponsored))
})

test('an overnight listing that finished this morning is not still hot', () => {
  const nowMinutes = 23 * 60 + 4
  const today = [
    card({
      id: 'ended-overnight',
      date: '2026-10-30T00:00:00.000Z',
      endDate: `${day}T00:00:00.000Z`,
      time: '20:30',
      endTime: '03:00',
      saves: 80,
    }),
    card({
      id: 'ended-late',
      date: '2026-10-30T00:00:00.000Z',
      endDate: `${day}T00:00:00.000Z`,
      time: '21:00',
      endTime: '04:00',
      saves: 40,
    }),
    card({
      id: 'still-today',
      date: '2026-10-30T00:00:00.000Z',
      endDate: `${day}T00:00:00.000Z`,
      time: '10:00',
      endTime: '23:30',
      saves: 2,
    }),
    card({ id: 'on-now', time: '20:30', endTime: '23:30', saves: 1 }),
  ]
  const items = rail({ today, nowMinutes })
  assert.deepEqual(ids(items), ['on-now', 'still-today'])
})

test('eight events on now leave no room for a later crowd favourite', () => {
  const today = Array.from({ length: 8 }, (_, i) => card({
    id: `live-${i}`,
    time: '09:00',
    endTime: '12:30',
    title: `Live ${i}`,
    saves: i,
  }))
  const upcoming = [card({ id: 'blockbuster', date: '2026-11-06T00:00:00.000Z', saves: 1000 })]
  const organic = rail({ today, upcoming, nowMinutes: 10 * 60 }).filter((row) => !row.sponsored)
  assert.equal(organic.length, CROWD_TARGET)
  assert.equal(organic.some((row) => row.id === 'blockbuster'), false)
})

test('duplicate occurrences collapse to the current one and past dates drop', () => {
  const showDay = '2026-11-01'
  const nowMinutes = 6 * 60 + 40
  const sculpture = (id: string, date: string, over: Partial<CrowdCard> = {}) => card({
    id,
    title: 'Sculpture by the Sea, Bondi',
    venueName: 'Bondi to Tamarama Coastal Walk',
    city: 'Sydney',
    date: `${date}T00:00:00.000Z`,
    endDate: '2026-11-02T00:00:00.000Z',
    time: '06:00',
    endTime: '18:00',
    imageUrl: null,
    ...over,
  })
  const items = rail({
    day: showDay,
    nowMinutes,
    today: [
      sculpture('oct-29', '2026-10-29'),
      sculpture('oct-30', '2026-10-30'),
      sculpture('oct-31', '2026-10-31'),
      sculpture('nov-1', '2026-11-01'),
    ],
    sponsored: [
      paid({
        id: 'paid-past',
        title: 'Sculpture by the Sea, Bondi',
        venueName: 'Bondi to Tamarama Coastal Walk',
        date: '2026-10-29T00:00:00.000Z',
        endDate: '2026-11-02T00:00:00.000Z',
        time: '06:00',
        endTime: '18:00',
        seriesKey: 'sculpture-bondi',
      }),
    ],
  })
  assert.deepEqual(ids(items), ['nov-1'])
  assert.equal(dateKeyOf(items[0]?.date), showDay)
  assert.equal(items[0]?.sponsored, false)

  const pastOnly = rail({
    day: showDay,
    nowMinutes,
    today: [
      sculpture('old-start', '2026-10-29', { seriesKey: 'sculpture-bondi' }),
      sculpture('later-start', '2026-10-30', { seriesKey: 'sculpture-bondi', title: 'Sculpture by the Sea' }),
    ],
  })
  assert.deepEqual(ids(pastOnly), ['later-start'])
  assert.equal(dateKeyOf(pastOnly[0]?.date), showDay)

  const finished = rail({
    day: showDay,
    nowMinutes,
    today: [
      card({
        id: 'yesterday',
        title: 'Finished gig',
        date: '2026-10-30T00:00:00.000Z',
        endDate: '2026-10-30T00:00:00.000Z',
        time: '06:00',
        endTime: '18:00',
      }),
      card({
        id: 'next-week',
        title: 'Finished gig',
        venueName: 'Other Room',
        date: '2026-11-06T00:00:00.000Z',
        time: '19:00',
        endTime: '21:00',
      }),
    ],
  })
  assert.deepEqual(ids(finished), ['next-week'])
  assert.equal(dateKeyOf(finished[0]?.date), '2026-11-06')
})

test('a city rail drops other cities’ paid cards and fills the gap with organic', () => {
  const upcoming = Array.from({ length: 12 }, (_, i) => card({
    id: `org-${i}`,
    title: `Gig ${i}`,
    date: '2026-11-06T00:00:00.000Z',
    time: '19:00',
    endTime: '22:00',
    saves: 20 - i,
  }))
  const sponsored = [
    paid({ id: 'syd-paid', title: 'Harbour Hoopla Boat Party 2026!', city: 'Sydney', date: '2026-11-07T00:00:00.000Z', tier: 'GOLD' }),
    paid({ id: 'mel-paid', title: 'Carlton Food Week Festival', city: 'Melbourne', date: '2027-01-15T00:00:00.000Z', tier: 'SILVER' }),
  ]
  const sydney = rail({ upcoming, sponsored, nowMinutes: 10 * 60, placeCity: 'Sydney' })
  const paidRows = sydney.filter((row) => row.sponsored)
  const organicRows = sydney.filter((row) => !row.sponsored)
  assert.deepEqual(paidRows.map((row) => row.id), ['syd-paid'])
  assert.equal(paidRows[0]?.tier, 'GOLD')
  assert.equal(organicRows.length, 11)
  assert.ok(paidRows.length / sydney.length <= 1 / 3 + 1e-9)
  assert.equal(sydney[0]?.sponsored, false)

  const open = rail({ upcoming, sponsored, nowMinutes: 10 * 60 })
  assert.ok(open.some((row) => row.id === 'mel-paid' && row.sponsored))
  assert.ok(open.some((row) => row.id === 'syd-paid' && row.sponsored))
  assert.equal(open.filter((row) => !row.sponsored).length, 8)
})
