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
