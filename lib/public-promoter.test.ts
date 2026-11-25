import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPublicPromoterProfile } from './public-promoter'

const published = { publishedListings: 2 }

test('the public directory keeps a real organiser and drops tests, drafts and personal names', () => {
  assert.equal(isPublicPromoterProfile({ orgName: 'Harbour Nights', name: 'Ada Lovelace', email: 'ada@harbour.test.invalid', ...published }), false)
  assert.equal(isPublicPromoterProfile({ orgName: 'Harbour Nights', name: 'Ada Lovelace', email: 'bookings@harbournights.com.au', ...published }), true)
  assert.equal(isPublicPromoterProfile({ orgName: 'Harbour Nights', email: 'bookings@harbournights.com.au', publishedListings: 0 }), false)
  assert.equal(isPublicPromoterProfile({ orgName: null, name: 'Ada Lovelace', email: 'ada@harbournights.com.au', ...published }), false)
  assert.equal(isPublicPromoterProfile({ orgName: '  ', name: 'Ada Lovelace', publishedListings: 3 }), false)
  for (const orgName of ['RSP QA Promoter', 'QA Viewport Promoter', 'Partner check promoter', 'Legal check', 'Probe Promoter', 'QA test venue North']) {
    assert.equal(isPublicPromoterProfile({ orgName, email: 'crew@example.org', ...published }), false, orgName)
  }
  assert.equal(isPublicPromoterProfile({ orgName: 'Quality Sounds', name: 'QA Viewport Promoter', email: 'hi@qualitysounds.com.au', ...published }), false)
  assert.equal(isPublicPromoterProfile({ orgName: 'Quality Sounds', email: 'qa.promoter@qualitysounds.com.au', ...published }), false)
  assert.equal(isPublicPromoterProfile({ orgName: 'Quality Sounds', email: 'hello@qualitysounds.com.au', ...published }), true)
})
