import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatInvoiceNumber, proDiscountLine } from './invoice'
import { parsePromoterListing } from './promoter-listing'
import { addressInTasmania, perthMisfileToHobart } from './tas-retag'

const NOW = new Date('2026-10-29T01:00:00.000Z')

test('capacity is an optional positive integer', () => {
  const ok = parsePromoterListing({ title: 'Gig', date: '2026-12-01', venueName: 'Hall', city: 'Sydney', capacity: '120' }, NOW)
  assert.equal(ok.ok && ok.listing.capacity, 120)
  const blank = parsePromoterListing({ title: 'Gig', date: '2026-12-01', venueName: 'Hall', city: 'Sydney', capacity: '' }, NOW)
  assert.equal(blank.ok && blank.listing.capacity, null)
  assert.equal(parsePromoterListing({ title: 'Gig', date: '2026-12-01', venueName: 'Hall', city: 'Sydney', capacity: '0' }, NOW).ok, false)
  assert.equal(parsePromoterListing({ title: 'Gig', date: '2026-12-01', venueName: 'Hall', city: 'Sydney', capacity: '-4' }, NOW).ok, false)
  assert.equal(parsePromoterListing({ title: 'Gig', date: '2026-12-01', venueName: 'Hall', city: 'Sydney', capacity: '1.5' }, NOW).ok, false)
})

test('invoice numbers are stable and Pro discounts show list price', () => {
  assert.equal(formatInvoiceNumber(1001), 'VP-001001')
  const hit = proDiscountLine('SILVER', 30, 4165)
  assert.deepEqual(hit, { listCents: 4900, paidCents: 4165, discountCents: 735 })
  assert.equal(proDiscountLine('SILVER', 30, 4900)?.discountCents, 0)
  assert.equal(proDiscountLine('SILVER', 30, 1000), null)
  assert.equal(proDiscountLine('PRO', 30, 2900), null)
})

test('Tasmanian venues leave Perth; a Perth match against Tasmania stays', () => {
  assert.equal(perthMisfileToHobart({
    city: 'Perth', latitude: -42.882, longitude: 147.329, venueAddress: '59 Collins St, Hobart, TAS 7000',
  }), true)
  assert.equal(perthMisfileToHobart({
    city: 'Perth', latitude: -41.436, longitude: 147.137, venueAddress: '71 Civic Square, Launceston, TAS 7250',
  }), true)
  assert.equal(perthMisfileToHobart({
    city: 'Perth', latitude: -41.051, longitude: 145.903, venueAddress: '30 Alexander Street, Burnie, TAS 7320',
  }), true)
  assert.equal(perthMisfileToHobart({
    city: 'Perth', latitude: -31.951, longitude: 115.889, venueAddress: '333 Victoria Park Drive, Burswood',
  }), false)
  assert.equal(addressInTasmania('Optus Stadium, Burswood'), false)
  assert.equal(perthMisfileToHobart({
    city: 'Hobart', latitude: -42.88, longitude: 147.33, venueAddress: 'Hobart TAS 7000',
  }), false)
})
