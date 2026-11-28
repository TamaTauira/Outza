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
