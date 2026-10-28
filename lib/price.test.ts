import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatPrice, readPrice } from './price'

test('parses common price strings without inventing amounts', () => {
  assert.equal(readPrice('$25').price, '$25')
  assert.equal(readPrice('From $40').price, 'From $40')
  assert.equal(formatPrice(false, 'From $40').prefix, 'from')
  assert.equal(formatPrice(false, 'From $40').value, '$40')
  assert.equal(readPrice('Free').isFree, true)
  assert.equal(readPrice('$0').isFree, true)
  assert.equal(readPrice('free entry').isFree, true)
  assert.equal(readPrice('$25 - $80').price, '$25 – $80')
  assert.equal(readPrice('$1,250').min, 1250)
  assert.equal(readPrice('TBA').price, null)
  assert.equal(formatPrice(false, null).value, 'Price TBA')
  assert.equal(formatPrice(false, null, 30, 45).value, '$30–$45')
  assert.equal(readPrice({ major_value: '25.00' }).price, '$25')
  const cents = readPrice({ currency: 'AUD', value: 2500 })
  assert.equal(cents.price, '$25')
})
