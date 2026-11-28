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

test('event detail price leads with the paid amount when free classes are pooled', () => {
  assert.equal(eventDetailPrice({ isFree: false, price: 'Free – $25' }).label, 'From $25')
  assert.equal(eventDetailPrice({ isFree: false, price: null, priceMin: 0, priceMax: 25 }).label, 'From $25')
  assert.equal(eventDetailPrice({ isFree: false, price: 'Free – $2,400' }).label, 'From $2400')
  assert.equal(eventDetailPrice({ isFree: false, range: 'From $25' }).label, 'From $25')
})

test('event detail price suppresses out-of-bound prices', () => {
  assert.equal(eventDetailPrice({ isFree: false, price: '$79,900' }).label, PRICE_TBA)
  assert.equal(eventDetailPrice({ isFree: false, price: null, priceMin: 899, priceMax: 79900 }).label, PRICE_TBA)
  assert.equal(eventDetailPrice({ isFree: false, price: '$2,500' }).label, '$2500')
})

test('event detail price refuses a stale out-of-bound range', () => {
  // The Leadership Excellence row (priceMin 899, priceMax 79,900) with the
  // range a pre-bound summary baked for it: "$899 – $79900". Neither the
  // fields nor the stale range may put the out-of-bound price on the page.
  assert.equal(eventDetailPrice({ isFree: false, price: '$899 – $79,900', priceMin: 899, priceMax: 79900, range: '$899 – $79900' }).label, PRICE_TBA)
  assert.equal(eventDetailPrice({ isFree: false, range: '$899 – $79900' }).label, PRICE_TBA)
})
