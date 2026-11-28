import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPastEvent } from './seo'

const lateEvening = new Date('2026-11-25T12:47:00.000Z')
const justAfterMidnight = new Date('2026-11-25T13:15:00.000Z')

test('a Sydney event stays up through the evening and ends at midnight when it has no finish', () => {
  const gig = { date: '2026-11-25T00:00:00.000Z', time: '17:00', city: 'Sydney' }
  assert.equal(isPastEvent(gig, lateEvening), false)
  assert.equal(isPastEvent(gig, justAfterMidnight), true)
})

test('a finish after midnight keeps the page live until that finish', () => {
  const overnight = { date: '2026-11-25T00:00:00.000Z', time: '21:00', endTime: '01:00', city: 'Sydney' }
  assert.equal(isPastEvent(overnight, justAfterMidnight), false)
  assert.equal(isPastEvent(overnight, new Date('2026-11-25T14:05:00.000Z')), true)
})

test('endsAt is the finish, in the city zone', () => {
  const stillOn = { date: '2026-11-25T00:00:00.000Z', time: '17:00', endsAt: '2026-11-25T14:00:00.000Z', city: 'Sydney' }
  assert.equal(isPastEvent(stillOn, justAfterMidnight), false)
  const finished = { date: '2026-11-25T00:00:00.000Z', time: '17:00', endTime: '18:00', city: 'Sydney' }
  assert.equal(isPastEvent(finished, new Date('2026-11-25T06:30:00.000Z')), false)
  assert.equal(isPastEvent(finished, new Date('2026-11-25T08:30:00.000Z')), true)
})

test('Sydney midnight is not Perth midnight', () => {
  const day = { date: '2026-11-25', city: 'Sydney' }
  assert.equal(isPastEvent(day, justAfterMidnight), true)
  assert.equal(isPastEvent({ date: '2026-11-25', city: 'Perth' }, justAfterMidnight), false)
})

test('a future endsAt cannot resurrect an event whose own dates are over', () => {
  const phantom = {
    date: '2026-11-14T00:00:00.000Z', endDate: '2026-11-14T00:00:00.000Z',
    time: '17:00', endTime: '18:00', endsAt: '2026-11-28T07:00:00.000Z', city: 'Sydney',
  }
  assert.equal(isPastEvent(phantom, new Date('2026-11-28T00:00:00.000Z')), true)
  const noEndDate = {
    date: '2026-11-14T00:00:00.000Z',
    time: '17:00', endTime: '18:00', endsAt: '2026-11-28T07:00:00.000Z', city: 'Sydney',
  }
  assert.equal(isPastEvent(noEndDate, new Date('2026-11-28T00:00:00.000Z')), true)
})

test('a multi-day event stays live until its own end date and finish', () => {
  const festival = {
    date: '2026-11-25T00:00:00.000Z', endDate: '2026-11-30T00:00:00.000Z',
    time: '10:00', endTime: '18:00', endsAt: '2026-11-30T07:00:00.000Z', city: 'Sydney',
  }
  assert.equal(isPastEvent(festival, new Date('2026-11-28T00:00:00.000Z')), false)
  // On the final day it ends at its own finish, not at an endsAt pushed past it.
  const lastDay = { ...festival, endsAt: '2026-12-01T07:00:00.000Z' }
  assert.equal(isPastEvent(lastDay, new Date('2026-11-30T01:00:00.000Z')), false)
  assert.equal(isPastEvent(lastDay, new Date('2026-11-30T09:00:00.000Z')), true)
})

test('a future event is not past, and an after-midnight endsAt still counts', () => {
  const future = { date: '2026-12-05T00:00:00.000Z', time: '19:00', city: 'Sydney' }
  assert.equal(isPastEvent(future, new Date('2026-11-28T00:00:00.000Z')), false)
  const lateFinish = { date: '2026-11-25T00:00:00.000Z', time: '17:00', endsAt: '2026-11-25T14:00:00.000Z', city: 'Sydney' }
  assert.equal(isPastEvent(lateFinish, justAfterMidnight), false)
  assert.equal(isPastEvent(lateFinish, new Date('2026-11-25T15:30:00.000Z')), true)
})

test('a finish instant already past is past even while the span is still running', () => {
  // The listing-visibility suite's case, in isPastEvent terms: an overnight
  // session whose stored finish instant has already gone is over, even
  // though its after-midnight span has not run out.
  const session = {
    date: '2026-11-21', time: '21:00', endTime: '03:00',
    endsAt: '2026-11-20T16:00:00.000Z', city: 'Sydney',
  }
  assert.equal(isPastEvent(session, new Date('2026-11-20T22:00:00.000Z')), true)
  const laterFinish = { ...session, endsAt: '2026-11-21T16:00:00.000Z' }
  assert.equal(isPastEvent(laterFinish, new Date('2026-11-20T22:00:00.000Z')), false)
})

test('an endsAt already past is past even when a future endDate says the span is still running', () => {
  // Pinning the producer audit: every writer of Event.endsAt routes through
  // scheduleFields (lib/listing-window.ts), which anchors the finish on the
  // span's final day, so a stored endsAt is the event's own final finish —
  // never a per-session end. With endDate still in the future, a past endsAt
  // therefore means the finish itself has gone, and the listing is past.
  // This is the same rule the listing-visibility suite pins ("a finish
  // instant already past is hidden"), stated here for the multi-day shape.
  const festival = {
    date: '2026-11-25T00:00:00.000Z', endDate: '2026-11-30T00:00:00.000Z',
    time: '10:00', endTime: '18:00', endsAt: '2026-11-27T07:00:00.000Z', city: 'Sydney',
  }
  assert.equal(isPastEvent(festival, new Date('2026-11-28T00:00:00.000Z')), true)
  // The same span with its real final finish still ahead stays live mid-span.
  const stillRunning = { ...festival, endsAt: '2026-11-30T07:00:00.000Z' }
  assert.equal(isPastEvent(stillRunning, new Date('2026-11-28T00:00:00.000Z')), false)
})

test('a future endsAt two days out does not extend a single-day event (the ~48-hour shape)', () => {
  // No endDate of its own, date yesterday, endsAt tomorrow: the endsAt
  // extension only reaches the start day or the morning after, so this
  // recomputed instant does not keep the event live and isPastEvent says
  // past. The board SQL still fetches the row (its second branch admits
  // date >= yesterday with a future endsAt) and shapeBoard then drops it
  // via isPastEvent — the SQL over-fetches and the filter decides, which
  // is the safe direction: over-fetching costs a row read, never a
  // wrongly-shown listing.
  const stale = {
    date: '2026-11-27T00:00:00.000Z',
    time: '17:00', endTime: '18:00', endsAt: '2026-11-29T07:00:00.000Z', city: 'Sydney',
  }
  assert.equal(isPastEvent(stale, new Date('2026-11-28T00:00:00.000Z')), true)
})

test('the endsAt extension is measured in the event city zone (Perth)', () => {
  // 17:00Z is 01:00 the next day in Perth (the morning after the start
  // day), so it extends the event into 26 Nov Perth time: still live at
  // 00:30 Perth on the 26th, past once that finish itself has gone.
  const perth = { date: '2026-11-25', time: '17:00', endsAt: '2026-11-25T17:00:00.000Z', city: 'Perth' }
  assert.equal(isPastEvent(perth, new Date('2026-11-25T16:30:00.000Z')), false)
  assert.equal(isPastEvent(perth, new Date('2026-11-25T17:30:00.000Z')), true)
  // An endsAt landing on start + 2 in Perth (01:00 on 27 Nov Perth) is
  // outside the extension window: no extension, and the event is past on
  // the 26th even though that instant is still in the future.
  const twoDaysOut = { ...perth, endsAt: '2026-11-26T17:00:00.000Z' }
  assert.equal(isPastEvent(twoDaysOut, new Date('2026-11-25T16:30:00.000Z')), true)
})
