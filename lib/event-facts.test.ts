import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventDetailPrice, PRICE_TBA } from './event-facts'

test('event detail price is Free, a real amount, or Price TBA', () => {
  assert.deepEqual(eventDetailPrice({ isFree: true }), { label: 'Free', kind: 'free' })
  assert.deepEqual(eventDetailPrice({ isFree: true, price: null, range: 'Price not published' }), { label: 'Free', kind: 'free' })
  assert.equal(eventDetailPrice({ isFree: false, price: '$25' }).label, '$25')
  assert.equal(eventDetailPrice({ isFree: false, price: 'From $40' }).label, 'From $40')
  assert.equal(eventDetailPrice({ isFree: false, price: null, priceMin: 20, priceMax: 40 }).label, '$20–$40')
  assert.equal(eventDetailPrice({ isFree: false, range: '$25 – $40' }).label, '$25 – $40')
  assert.equal(eventDetailPrice({ isFree: false, range: 'Free' }).label, 'Free')
  assert.equal(eventDetailPrice({ isFree: true, price: '$20' }).label, '$20')
  assert.equal(eventDetailPrice({ isFree: false, price: 'Gold coin donation' }).label, 'Gold coin donation')
  assert.equal(eventDetailPrice({ isFree: false, price: null }).label, PRICE_TBA)
  assert.equal(eventDetailPrice({ isFree: false, price: 'Price TBA' }).label, PRICE_TBA)
  assert.equal(eventDetailPrice({ isFree: false, price: 'TBA', range: 'Price not published' }).label, PRICE_TBA)
  assert.equal(eventDetailPrice({ isFree: false, price: 'See website' }).label, PRICE_TBA)
  assert.equal(eventDetailPrice({ isFree: false, price: 'Ask the organiser' }).label, PRICE_TBA)
  assert.equal(eventDetailPrice({ isFree: false, range: 'Tickets at source' }).label, PRICE_TBA)
})
