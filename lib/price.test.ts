import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BOOKING_FEES_NOTE, formatPrice, isBulkTicketClass, listPriceLabel, moneyNumber, priceFeeNote, priceFromAmounts, priceFromTicketClasses, priceOutlier, readPrice, readPriceRows } from './price'

test('parses common price strings without inventing amounts', () => {
  assert.equal(readPrice('$25').price, '$25')
  assert.equal(readPrice('From $40').price, 'From $40')
  assert.equal(formatPrice(false, 'From $40').prefix, 'From')
  assert.equal(formatPrice(false, 'From $40').value, '$40')
  assert.equal(readPrice('Free').isFree, true)
  assert.equal(readPrice('$25', true).isFree, false)
  assert.equal(readPrice('$25', true).price, '$25')
  assert.equal(readPrice('Free – $25', true).isFree, false)
  assert.equal(readPrice(null, true).isFree, true)
  assert.equal(readPrice('$0').isFree, true)
  assert.equal(readPrice('free entry').isFree, true)
  assert.equal(readPrice('$25 - $80').price, '$25 – $80')
  assert.equal(readPrice('$1,250').min, 1250)
  assert.equal(readPrice('TBA').price, null)
  assert.equal(formatPrice(false, null).value, 'See website')
  assert.equal(listPriceLabel(true, null).text, 'Free')
  assert.equal(listPriceLabel(true, null).kind, 'free')
  assert.equal(listPriceLabel(false, null).text, 'See website')
  assert.equal(listPriceLabel(false, null, 51, 62).text, '$51–$62')
  assert.equal(formatPrice(false, null, 30, 45).value, '$30–$45')
  assert.equal(readPrice({ major_value: '25.00' }).price, '$25')
  const cents = readPrice({ currency: 'AUD', value: 2500 })
  assert.equal(cents.price, '$25')
})

test('sanity bound suppresses out-of-bound prices at read and at display', () => {
  // Read/ingest side: an unbounded range is not a storable price.
  assert.equal(readPrice('$79,900').price, null)
  assert.equal(readPrice('$79,900').min, null)
  assert.equal(readPrice('$79,900').suppressed, true)
  assert.equal(readPrice('$899 – $79,900').suppressed, true)
  assert.equal(readPrice('$2,501').suppressed, true)
  assert.equal(readPrice('$2,500').price, '$2500')
  assert.equal(readPrice('$2,500').min, 2500)
  // Display side: rows stored before the bound existed stop showing the price.
  assert.equal(formatPrice(false, '$79,900').kind, 'unknown')
  assert.equal(formatPrice(false, '$79,900').value, 'See website')
  assert.equal(formatPrice(false, null, 899, 79900).kind, 'unknown')
  assert.equal(listPriceLabel(false, null, 899, 79900).text, 'See website')
  assert.equal(listPriceLabel(false, '$3,959.50').kind, 'unknown')
  // A free hint never resurrects a suppressed read as Free.
  assert.equal(readPrice('$3,000', true).isFree, false)
  assert.equal(readPrice('$3,000', true).suppressed, true)
})

test('prices in the $1,000–$2,500 band are flagged, not suppressed', () => {
  assert.equal(readPrice('$1,250').flagged, true)
  assert.equal(readPrice('$1,000').flagged, true)
  assert.equal(readPrice('$2,500').flagged, true)
  assert.equal(readPrice('$999').flagged, false)
  assert.equal(readPrice('$25').flagged, false)
  assert.equal(readPrice('Free').flagged, false)
  assert.equal(priceOutlier(55, 3959.5), 'suppressed')
  assert.equal(priceOutlier(899, 2500), 'flagged')
  assert.equal(priceOutlier(25, 40), null)
  assert.equal(priceOutlier(null, null), null)
})

test('mixed free and paid classes lead with the cheapest paid amount', () => {
  const mixed = readPrice('Free – $25')
  assert.equal(mixed.price, 'From $25')
  assert.equal(mixed.isFree, false)
  assert.equal(mixed.hasFree, true)
  assert.equal(priceFromAmounts(0, 25).price, 'From $25')
  assert.equal(priceFromAmounts(0, 25).hasFree, true)
  const shown = formatPrice(false, 'Free – $25')
  assert.equal(shown.prefix, 'From')
  assert.equal(shown.value, '$25')
  assert.equal(shown.kind, 'paid')
  assert.equal(shown.hasFree, true)
  assert.equal(formatPrice(false, null, 0, 25).prefix, 'From')
  assert.equal(formatPrice(false, null, 0, 25).value, '$25')
  assert.equal(listPriceLabel(false, 'Free – $25').text, 'From $25')
  assert.equal(listPriceLabel(false, null, 0, 800).text, 'From $800')
  // All-free stays Free, on every surface.
  assert.equal(readPrice('$0').isFree, true)
  assert.equal(priceFromAmounts(0, 0).isFree, true)
  assert.equal(formatPrice(false, null, 0, 0).kind, 'free')
  assert.equal(listPriceLabel(true, null).text, 'Free')
})

test('fee note travels with paid prices only', () => {
  assert.equal(BOOKING_FEES_NOTE, 'Booking fees may apply at checkout')
  assert.equal(priceFeeNote('paid'), BOOKING_FEES_NOTE)
  assert.equal(priceFeeNote('free'), null)
  assert.equal(priceFeeNote('unknown'), null)
})

test('a bare money-object value is minor units, with or without a currency', () => {
  // Eventbrite's contract: `value` is cents, `major_value` is the decimal.
  // The bare shape used to slip through as dollars: 79900 became $79,900.
  assert.equal(moneyNumber({ value: 79900 }), 799)
  assert.equal(moneyNumber({ value: 79900, currency: 'AUD' }), 799)
  assert.equal(moneyNumber({ value: 2500, currency: 'AUD', major_value: '25.00' }), 25)
  assert.equal(moneyNumber({ major_value: '25.00' }), 25)
  assert.equal(readPrice({ value: 79900 }).price, '$799')
})

test('bulk and group classes never set the headline range', () => {
  assert.equal(isBulkTicketClass({ name: 'Group of 10', amount: 4257 }), true)
  assert.equal(isBulkTicketClass({ name: 'Corporate Table', amount: 7990 }), true)
  assert.equal(isBulkTicketClass({ name: 'Table of 8', amount: 800 }), true)
  assert.equal(isBulkTicketClass({ name: 'Family', amount: 120 }), true)
  assert.equal(isBulkTicketClass({ name: 'Adult', amount: 50, quantity: 10 }), true)
  assert.equal(isBulkTicketClass({ name: 'Adult', amount: 50 }), false)
  assert.equal(isBulkTicketClass({ name: 'Concession', amount: 40 }), false)
  assert.equal(isBulkTicketClass({ name: '5 classes at $25 each', amount: 125 }), false)
  const ranged = priceFromTicketClasses([
    { name: 'Adult', amount: 50 },
    { name: 'Concession', amount: 40 },
    { name: 'Group of 30', amount: 4257 },
  ])
  assert.equal(ranged.price, '$40 – $50')
  // A normal class range is untouched.
  assert.equal(priceFromTicketClasses([{ name: 'Adult', amount: 50 }, { name: 'Concession', amount: 40 }]).price, '$40 – $50')
  // Every class bulk: fall back to all of them rather than showing nothing.
  assert.equal(priceFromTicketClasses([{ name: 'Group of 10', amount: 500 }]).price, '$500')
  // Labelled price rows (City of Sydney style) follow the same rule.
  assert.equal(readPriceRows([{ label: 'Adult', price: '$50' }, { label: 'Group booking', price: '$4,257' }]).price, '$50')
  assert.equal(readPriceRows([{ label: 'Adult', price: '$50' }, { label: 'Concession', price: '$40' }]).price, '$40 – $50')
})

test('one stored-price resolution: columns win disagreements, the string keeps agreement nuance', () => {
  // Agreement: the string's "From" survives.
  assert.equal(formatPrice(false, 'From $40', 40, 40).prefix, 'From')
  assert.equal(formatPrice(false, 'From $40', 40, 40).value, '$40')
  // Disagreement: the numeric columns (what the price filters use) win.
  assert.equal(listPriceLabel(false, '$25 – $80', 25, 40).text, '$25–$40')
  // A stale isFree flag does not hide paid columns.
  assert.equal(listPriceLabel(true, null, 25, 80).text, '$25–$80')
  assert.equal(listPriceLabel(true, null, 25, 80).kind, 'paid')
  // Out-of-bound columns suppress even a sane string; sane columns rescue a suppressed string.
  assert.equal(formatPrice(false, '$112.90', 112.9, 3000).kind, 'unknown')
  assert.equal(formatPrice(false, '$79,900', 25, 40).value, '$25–$40')
})
