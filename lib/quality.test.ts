import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FREE_TICKETS_NOTE, priceSummary } from './quality'

test('price summary leads with the paid amount when free classes are pooled', () => {
  const mixed = priceSummary({ isFree: false, price: 'Free – $25', priceMin: 0, priceMax: 25 })
  assert.equal(mixed.range, 'From $25')
  assert.equal(mixed.freeNote, FREE_TICKETS_NOTE)
  assert.equal(mixed.fees, 'Booking fees may apply at checkout')
  const stringOnly = priceSummary({ isFree: false, price: 'Free – $25' })
  assert.equal(stringOnly.range, 'From $25')
  assert.equal(stringOnly.freeNote, FREE_TICKETS_NOTE)
  const columnsOnly = priceSummary({ isFree: false, price: null, priceMin: 0, priceMax: 25 })
  assert.equal(columnsOnly.range, 'From $25')
  assert.equal(columnsOnly.freeNote, FREE_TICKETS_NOTE)
  // A stale isFree flag does not make a mixed listing Free either.
  const flagged = priceSummary({ isFree: true, price: 'Free – $25', priceMin: 0, priceMax: 25 })
  assert.equal(flagged.range, 'From $25')
})

test('price summary keeps all-free events free and plain paid ranges unchanged', () => {
  assert.deepEqual(priceSummary({ isFree: true, price: 'Free', priceMin: 0, priceMax: 0 }), { range: 'Free', fees: null, freeNote: null })
  const paid = priceSummary({ isFree: false, price: '$25 – $40', priceMin: 25, priceMax: 40 })
  assert.equal(paid.range, '$25 – $40')
  assert.equal(paid.fees, 'Booking fees may apply at checkout')
  assert.equal(paid.freeNote, null)
  const incl = priceSummary({ isFree: false, price: '$25', priceMin: 25, priceMax: 25, feesIncluded: true })
  assert.equal(incl.range, '$25')
  assert.equal(incl.fees, 'Includes booking fees')
  assert.equal(priceSummary({ isFree: false, price: null }).range, 'Price not published')
})

test('price summary suppresses out-of-bound prices', () => {
  assert.equal(priceSummary({ isFree: false, price: '$899 – $79,900', priceMin: 899, priceMax: 79900 }).range, 'Price not published')
  assert.equal(priceSummary({ isFree: false, price: 'Free – $79,900', priceMin: 0, priceMax: 79900 }).range, 'Price not published')
  assert.equal(priceSummary({ isFree: false, price: '$79,900' }).range, 'Price not published')
})
