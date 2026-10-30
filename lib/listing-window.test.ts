import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderedDayParts } from './board'
import {
  fieldConflicts,
  formatBoardRange,
  formatUpdated,
  listingBucket,
  liveStatus,
  nearStartPlan,
  orderedWindow,
  rankBoard,
  rankWindow,
  refreshSuccessRate,
  repeatedSourceFailures,
  reportsPerThousand,
  resolveSchedule,
  sameRealWorldEvent,
  scheduleFields,
  sourceUpdatedLine,
  venueHoursFit,
} from './listing-window'

const day = '2026-10-30'
const base = {
  date: `${day}T00:00:00.000Z`,
  city: 'Sydney',
  status: 'SCHEDULED',
  venueName: 'Enmore Theatre',
  duplicateOfId: null as string | null,
}

test('tonight does not lead with morning-only, cancelled, sold-out or expired events', () => {
  const rows = [
    { ...base, id: 'morn', title: 'Morning market', time: '09:00', endTime: '12:00' },
    { ...base, id: 'span', title: 'Day fair', time: '10:00', endTime: '21:00' },
    { ...base, id: 'gig', title: 'Late show', time: '19:30', endTime: '22:00' },
    { ...base, id: 'all', title: 'Exhibition', time: null },
    { ...base, id: 'old', title: 'Yesterday', date: '2026-10-28T00:00:00.000Z', time: '19:00' },
    { ...base, id: 'cancel', title: 'Called off', time: '20:00', status: 'CANCELLED' },
    { ...base, id: 'sold', title: 'Sold out show', time: '18:00', status: 'SOLD_OUT' },
    { ...base, id: 'dup', title: 'Copy', time: '19:00', duplicateOfId: 'gig' },
    { ...base, id: 'ended', title: 'Early set', time: '17:00', endTime: '18:00' },
    { ...base, id: 'later', title: 'Headline', time: '21:00', endTime: '23:00' },
  ]
  const opts = { window: 'tonight' as const, day, nowMinutes: 20 * 60, dropEnded: true }
  const ranked = rankWindow(rows, opts)
  assert.deepEqual(ranked.confirmed.map((row) => row.id), ['gig', 'later'])
  assert.deepEqual(ranked.possibly.map((row) => row.id), ['all'])
  assert.deepEqual(ranked.soon, [])
  const ordered = orderedWindow(rows, opts)
  assert.equal(ordered[0].id, 'gig')
  assert.equal(ordered.at(-1)?.id, 'all')
  assert.equal(ordered.some((row) => ['morn', 'span', 'old', 'cancel', 'sold', 'dup', 'ended'].includes(row.id!)), false)
  assert.equal(listingBucket(rows[3], opts), 'possibly')
  assert.equal(listingBucket(rows[5], opts), 'exclude')
})

test('happening now keeps a real overlap ahead of an untimed listing', () => {
  const rows = [
    { ...base, id: 'morn', title: 'Morning only', time: '09:00', endTime: '12:00' },
    { ...base, id: 'live', title: 'On now', time: '18:00', endTime: '22:00' },
    { ...base, id: 'soon', title: 'Up next', time: '21:30', endTime: '23:00' },
    { ...base, id: 'maybe', title: 'No finish', time: '19:30' },
    { ...base, id: 'sold', title: 'Gone', time: '18:30', endTime: '21:00', status: 'SOLD_OUT' },
  ]
  const opts = { window: 'now' as const, day, nowMinutes: 20 * 60, dropEnded: true }
  const ranked = rankWindow(rows, opts)
  assert.deepEqual(ranked.confirmed.map((row) => row.id), ['live'])
  assert.deepEqual(ranked.soon.map((row) => row.id), ['soon'])
  assert.deepEqual(ranked.possibly.map((row) => row.id), ['maybe'])
  assert.equal(orderedWindow(rows, opts)[0].id, 'live')
  assert.equal(listingBucket(rows[0], opts), 'exclude')
  assert.equal(listingBucket(rows[4], opts), 'exclude')
})

test('venue hours outside the listing start are not treated as a confirmed window', () => {
  assert.equal(venueHoursFit(19 * 60, '09:00', '17:00'), 'outside')
  assert.equal(venueHoursFit(19 * 60, null, null), 'unknown')
  const row = { ...base, id: 'late', title: 'After close', time: '19:00', endTime: '21:00', venueOpen: '09:00', venueClose: '17:00' }
  assert.equal(listingBucket(row, { window: 'tonight', day, nowMinutes: 18 * 60, dropEnded: true }), 'possibly')
})

test('duplicates keep provenance conflicts and disagreeing organisers stay apart', () => {
  const a = { title: 'Jazz night', venueName: 'Enmore Theatre', time: '19:30', source: 'ticketmaster', organiserName: 'Frontier Touring' }
  const b = { title: 'Jazz night live', venueName: 'The Enmore Theatre', time: '20:00', source: 'moshtix', organiserName: 'Frontier' }
  assert.equal(sameRealWorldEvent(a, b), true)
  assert.deepEqual(fieldConflicts(
    { time: '19:30', endTime: '22:00', status: 'SCHEDULED', venueName: 'Enmore Theatre' },
    { time: '20:00', endTime: '22:30', status: 'CANCELLED', venueName: 'Enmore Theatre' },
  ), ['time 19:30 vs 20:00', 'end 22:00 vs 22:30', 'status SCHEDULED vs CANCELLED'])
  assert.equal(sameRealWorldEvent(a, { ...b, organiserName: 'Secret Sounds' }), false)
})

test('an untimed listing is not a confirmed window, and the public line has no score', () => {
  const sched = scheduleFields({
    ...base,
    title: 'Exhibition',
    time: null,
    source: 'ticketmaster',
    isFree: false,
    price: '$20',
    lastVerifiedAt: '2026-10-28T02:00:00.000Z',
  }, Date.parse('2026-10-30T08:00:00.000Z'))
  assert.equal(sched.allDay, true)
  assert.equal(typeof sched.confidenceScore, 'number')
  assert.equal(sched.timezone, 'Australia/Sydney')
  const line = sourceUpdatedLine('ticketmaster', '2026-10-28T02:00:00.000Z', new Date('2026-10-30T00:00:00.000Z'))
  assert.match(line, /^Source: Ticketmaster · Updated 28 Oct$/)
  assert.doesNotMatch(line, /verified|confidence|score/i)
  assert.equal(formatUpdated('2025-10-28T02:00:00.000Z', new Date('2026-10-30T00:00:00.000Z'))?.includes('2025'), true)
  const timed = scheduleFields({
    ...base,
    time: '19:30',
    source: 'ticketmaster',
    isFree: false,
    price: '$20',
  }, Date.parse('2026-10-30T00:00:00.000Z'))
  assert.equal(timed.allDay, false)
  assert.equal(timed.startsAt?.toISOString(), '2026-10-30T08:30:00.000Z')
})

test('near-start recheck is due only inside the window when the last check is stale', () => {
  const now = Date.parse('2026-10-30T00:00:00.000Z')
  const soon = new Date(now + 6 * 60 * 60 * 1000).toISOString()
  const later = new Date(now + 48 * 60 * 60 * 1000).toISOString()
  const fresh = new Date(now - 2 * 60 * 60 * 1000).toISOString()
  const stale = new Date(now - 20 * 60 * 60 * 1000).toISOString()
  assert.equal(nearStartPlan(stale, soon, now), 'due')
  assert.equal(nearStartPlan(fresh, soon, now), 'ok')
  assert.equal(nearStartPlan(stale, later, now), 'skip')
  assert.equal(nearStartPlan(null, soon, now), 'due')
})

test('at 8pm, now leads with evening overlap and parks all-day, ended and morning-only', () => {
  const eightPm = 20 * 60
  const rows = [
    { ...base, id: 'exhibit', title: 'Ai Weiwei', time: '00:00', endTime: '22:59' },
    { ...base, id: 'yoga', title: 'Outdoor Yoga Flow', time: '06:15', endTime: '06:00' },
    { ...base, id: 'morn', title: 'Morning only', time: '09:00', endTime: '12:00' },
    { ...base, id: 'sculpture', title: 'Sculpture by the Sea', time: '06:00', endTime: '18:00', endDate: '2026-11-02T00:00:00.000Z' },
    { ...base, id: 'look', title: 'The Infinite Look', time: '07:00', endTime: '21:00' },
    { ...base, id: 'hunt', title: 'Adventure clues', time: '17:00', endTime: '16:59' },
    { ...base, id: 'jazz', title: 'Curtains Jazz', time: '17:00', endTime: '02:00' },
    { ...base, id: 'gig', title: 'Late show', time: '19:30', endTime: '22:00' },
    { ...base, id: 'soon', title: 'Headline', time: '21:30', endTime: '23:30' },
    { ...base, id: 'maybe', title: 'No finish', time: '19:40' },
  ]
  const opts = { window: 'now' as const, day, nowMinutes: eightPm, dropEnded: true }
  const ranked = rankBoard(rows, opts)
  assert.deepEqual(ranked.lead.map((row) => row.id), ['hunt', 'jazz', 'gig'])
  assert.deepEqual(ranked.soon.map((row) => row.id), ['soon'])
  assert.deepEqual(ranked.still.map((row) => row.id), ['look'])
  assert.deepEqual(ranked.allday.map((row) => row.id), ['exhibit'])
  assert.deepEqual(ranked.possibly.map((row) => row.id), ['maybe'])
  for (const id of ['yoga', 'morn', 'sculpture']) {
    assert.equal(listingBucket(rows.find((row) => row.id === id)!, opts), 'exclude')
  }
  assert.equal(liveStatus(rows[1], day, day, eightPm).label, 'Ended')
  assert.equal(liveStatus(rows[3], day, day, eightPm).label, 'Ended')
  assert.equal(liveStatus(rows[4], day, day, eightPm).label, 'On now')
  assert.equal(liveStatus(rows[0], day, day, eightPm).label, 'All day')
  const order = [...ranked.lead, ...ranked.soon, ...ranked.still, ...ranked.allday, ...ranked.possibly].map((row) => row.id)
  assert.equal(order[0], 'hunt')
  assert.ok(order.indexOf('look') > order.indexOf('gig'))
  assert.ok(order.indexOf('exhibit') > order.indexOf('look'))
  assert.ok(order.indexOf('maybe') > order.indexOf('exhibit'))
})

test('overnight finishes keep a later date, and a backwards morning clock is not a finish', () => {
  const hunt = formatBoardRange({ ...base, time: '17:00', endTime: '16:59' })
  assert.equal(hunt.label, '5:00 pm – 4:59 pm, 31 Oct')
  assert.equal(hunt.endLine?.includes('31 Oct'), true)
  const jazz = formatBoardRange({ ...base, time: '17:00', endTime: '02:00' })
  assert.equal(jazz.label, '5:00 pm – 2:00 am, 31 Oct')
  const yoga = formatBoardRange({ ...base, time: '06:15', endTime: '06:00' })
  assert.equal(yoga.endLine, null)
  assert.equal(yoga.label, '6:15 am')
  const show = formatBoardRange({ ...base, time: '19:30', endTime: '22:00' })
  assert.equal(show.label, '7:30 pm – 10:00 pm')
  const sculpture = formatBoardRange({ ...base, time: '06:00', endTime: '18:00', endDate: '2026-11-02T00:00:00.000Z' })
  assert.equal(sculpture.label, '6:00 am – 6:00 pm · until 2 Nov')
  const noEnd = formatBoardRange({ ...base, time: '20:00', endTime: null })
  assert.equal(noEnd.endLine, null)
  assert.equal(resolveSchedule({ ...base, time: '17:00', endTime: '16:59' }, day).overnight, true)
  assert.equal(resolveSchedule({ ...base, time: '06:15', endTime: '06:00' }, day).bogusEnd, true)
})

test('stored instants follow the same overnight rule and do not invent a next-day yoga finish', () => {
  const yoga = scheduleFields({ ...base, time: '06:15', endTime: '06:00', source: 'cityofsydney', isFree: true }, Date.parse('2026-10-30T09:00:00.000Z'))
  assert.equal(yoga.endsAt, null)
  assert.equal(yoga.allDay, false)
  const hunt = scheduleFields({ ...base, time: '17:00', endTime: '16:59', source: 'cityofsydney', isFree: false, price: '$25' }, Date.parse('2026-10-30T09:00:00.000Z'))
  assert.equal(hunt.endsAt?.toISOString(), '2026-10-31T05:59:00.000Z')
  const jazz = scheduleFields({ ...base, time: '17:00', endTime: '02:00', source: 'cityofsydney', isFree: false, price: '$20' }, Date.parse('2026-10-30T09:00:00.000Z'))
  assert.equal(jazz.endsAt?.toISOString(), '2026-10-30T15:00:00.000Z')
  const show = scheduleFields({ ...base, time: '19:30', endTime: '22:00', source: 'ticketmaster', isFree: false, price: '$20' }, Date.parse('2026-10-30T00:00:00.000Z'))
  assert.equal(show.endsAt?.toISOString(), '2026-10-30T11:00:00.000Z')
})

test('full day at 8pm leads with the evening part, not morning', () => {
  assert.deepEqual(orderedDayParts(20 * 60).map((part) => part.key), ['evening', 'late', 'morning', 'afternoon'])
  assert.equal(orderedDayParts(9 * 60)[0].key, 'morning')
  assert.equal(orderedDayParts(null)[0].key, 'morning')
})

test('health rates and repeated source failures stay numeric and skip budget stops', () => {
  assert.equal(reportsPerThousand(4, 2000), 2)
  assert.equal(reportsPerThousand(1, 0), null)
  assert.equal(refreshSuccessRate(9, 1), 90)
  assert.equal(refreshSuccessRate(0, 0), null)
  const name = repeatedSourceFailures([
    { status: 'source:Moshtix', errors: 'Moshtix: HTTP 500', startedAt: '2026-10-30T00:00:00.000Z' },
    { status: 'source:Moshtix', errors: 'Moshtix: HTTP 500', startedAt: '2026-10-29T00:00:00.000Z' },
    { status: 'source:Oztix', errors: 'Oztix: time budget reached', startedAt: '2026-10-30T00:00:00.000Z' },
    { status: 'source:Oztix', errors: 'Oztix: time budget reached', startedAt: '2026-10-29T00:00:00.000Z' },
  ])
  assert.deepEqual(name, ['Moshtix'])
})
