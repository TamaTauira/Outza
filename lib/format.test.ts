import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDate, formatPrice, formatTime } from './format'

test('clock times keep the minutes and a space before am or pm', () => {
  assert.equal(formatTime('19:30'), '7:30 pm')
  assert.equal(formatTime('07:00'), '7:00 am')
  assert.equal(formatTime('00:00'), '12:00 am')
  assert.equal(formatTime('12:05'), '12:05 pm')
  assert.equal(formatTime(null), '')
})

test('card dates are short and detail dates spell the day', () => {
  assert.equal(formatDate('2026-11-21', 'card'), 'Sat 21 Nov')
  assert.equal(formatDate('2026-11-21', 'detail'), 'Saturday 21 November')
})

test('a missing price says See website', () => {
  assert.equal(formatPrice(false, null).value, 'See website')
  assert.equal(formatPrice(true, null).value, 'Free')
})
