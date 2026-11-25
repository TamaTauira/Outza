import assert from 'node:assert/strict'
import { test } from 'node:test'
import { displayClock, formatDate, formatPrice, formatTime, TIME_TBA } from './format'

test('clock times keep the minutes and a space before am or pm', () => {
  assert.equal(formatTime('19:30'), '7:30 pm')
  assert.equal(formatTime('07:00'), '7:00 am')
  assert.equal(formatTime('00:00'), '12:00 am')
  assert.equal(formatTime('12:05'), '12:05 pm')
  assert.equal(formatTime(null), '')
  assert.equal(displayClock('00:00', '01:00'), TIME_TBA)
  assert.equal(displayClock('00:00', '23:59'), 'All day')
  assert.equal(displayClock(null), TIME_TBA)
  assert.equal(displayClock('19:30'), '7:30 pm')
})

test('card dates are short and detail dates spell the day', () => {
  assert.equal(formatDate('2026-11-21', 'card'), 'Sat 21 Nov')
  assert.equal(formatDate('2026-11-21', 'detail'), 'Saturday 21 November')
})

test('a missing price says See website', () => {
  assert.equal(formatPrice(false, null).value, 'See website')
  assert.equal(formatPrice(true, null).value, 'Free')
})
