import assert from 'node:assert/strict'
import test from 'node:test'
import { planSourceRefresh, publicOrganiserNotice, publicVenueNotice, venueRoleAllows } from './ownership'
import { listingProvenance } from './listing-provenance'

test('a venue correction is labelled from the venue and is not an organiser update', () => {
  const row = { fieldName: 'price', overrideValue: '$20', originalSourceValue: '$30', active: true, verificationContext: 'venue' }
  const venue = publicVenueNotice([row], '2026-11-19T00:00:00.000Z')
  assert.equal(venue?.title, 'from the venue')
  assert.match(venue?.body ?? '', /venue corrected/)
  assert.equal(publicOrganiserNotice([row]), null)
  const line = listingProvenance({ venueFields: ['price', 'imageUrl'], status: 'SCHEDULED' })
  assert.match(line.venueNote ?? '', /from the venue/)
  assert.match(line.venueNote ?? '', /the image/)
  assert.equal(line.organiserNote, null)
  assert.doesNotMatch(JSON.stringify(line), /Outza|verified/i)
})

test('the next ingest keeps a venue image, price and cancellation', () => {
  const plan = planSourceRefresh({
    current: { price: 'Free', imageUrl: 'https://cdn.example/venue.jpg', status: 'SCHEDULED', time: '19:30' },
    incoming: { price: '$40', imageUrl: 'https://cdn.example/source.jpg', status: 'CANCELLED', time: '20:00' },
    overrides: [
      { fieldName: 'price', overrideValue: 'Free', originalSourceValue: '$40', active: true, verificationContext: 'venue' },
      { fieldName: 'imageUrl', overrideValue: 'https://cdn.example/venue.jpg', originalSourceValue: 'https://cdn.example/source.jpg', active: true, verificationContext: 'venue' },
      { fieldName: 'status', overrideValue: 'SCHEDULED', originalSourceValue: 'SCHEDULED', active: true, verificationContext: 'venue' },
    ],
  })
  assert.equal(plan.eventPatch.price, undefined)
  assert.equal(plan.eventPatch.imageUrl, undefined)
  assert.equal(plan.eventPatch.status, undefined)
  assert.equal(plan.eventPatch.time, '20:00')
  assert.equal(plan.materialConflict, 'SOURCE_CANCELLED')
})

test('staff can correct a listing and cannot buy a placement', () => {
  assert.equal(venueRoleAllows('MANAGER', 'correctEvent'), true)
  assert.equal(venueRoleAllows('MANAGER', 'configureAds'), false)
  assert.equal(venueRoleAllows('ADMINISTRATOR', 'correctEvent'), true)
  assert.equal(venueRoleAllows(null, 'correctEvent'), false)
})
