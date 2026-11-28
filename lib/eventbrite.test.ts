import assert from 'node:assert/strict'
import test from 'node:test'
import { readPrice } from './price'
import { eventbriteExternalId, freePassMayMarkFree, priceFromAvailability } from './sources/eventbrite'

test('eventbrite events carry their source id as externalId', () => {
  assert.equal(eventbriteExternalId({ id: 123456789 }), '123456789')
  assert.equal(eventbriteExternalId({ id: '98765' }), '98765')
  assert.equal(eventbriteExternalId({ id: '' }), null)
  assert.equal(eventbriteExternalId({}), null)
  assert.equal(eventbriteExternalId(null), null)
  assert.equal(eventbriteExternalId(undefined), null)
})

test('a paid ticket class wins over the is_free flag in the availability price', () => {
  const mixed = priceFromAvailability({
    is_free: true,
    minimum_ticket_price: { major_value: '0' },
    maximum_ticket_price: { major_value: '25' },
  })
  assert.notEqual(mixed, 'Free')
  assert.equal(readPrice(mixed).isFree, false)
  assert.equal(readPrice(mixed).max, 25)
  assert.equal(priceFromAvailability({ is_free: true }), 'Free')
  assert.equal(
    priceFromAvailability({ minimum_ticket_price: { major_value: '20' }, maximum_ticket_price: { major_value: '40' } }),
    '$20 \u2013 $40',
  )
  assert.equal(priceFromAvailability(null), null)
})

test('the free-events pass may mark an event free only when no paid class exists', () => {
  // Some free classes, some paid: not a free event, however the passes land.
  assert.equal(freePassMayMarkFree({ is_free: true, maximum_ticket_price: { major_value: '25' } }, 'Free'), false)
  assert.equal(freePassMayMarkFree(null, '$20'), false)
  // Wholly free, per the availability read or the destination price lookup.
  assert.equal(freePassMayMarkFree({ is_free: true }, null), true)
  assert.equal(freePassMayMarkFree({ maximum_ticket_price: { major_value: '0' } }, null), true)
  assert.equal(freePassMayMarkFree(null, 'Free'), true)
  // No price evidence at all: the free listing alone is not proof.
  assert.equal(freePassMayMarkFree(null, null), false)
  assert.equal(freePassMayMarkFree({}, null), false)
})
