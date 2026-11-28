import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_NEAR_ME_RADIUS_KM,
  NEAR_ME_RADII_KM,
  areaJumpTarget,
  filterPinsWithinRadius,
  pinDistanceKm,
  shouldAutoLocate,
} from './map-near-me'

// Sydney CBD, the centre the Sydney board opens on.
const CBD = { lat: -33.8688, lng: 151.2093 }
const BONDI = { latitude: -33.8915, longitude: 151.2769 } // ~6.5 km from the CBD
const PARRAMATTA = { latitude: -33.815, longitude: 151.0011 } // ~20 km from the CBD
const NO_COORDS = { latitude: null, longitude: null }

test('the default radius is one of the offered radii', () => {
  assert.ok((NEAR_ME_RADII_KM as readonly number[]).includes(DEFAULT_NEAR_ME_RADIUS_KM))
})

test('pin distance is null without usable coordinates', () => {
  assert.equal(pinDistanceKm(NO_COORDS, CBD), null)
  assert.equal(pinDistanceKm({ latitude: Number.NaN, longitude: 151.2 }, CBD), null)
  const km = pinDistanceKm(BONDI, CBD)
  assert.ok(km != null && km > 5 && km < 8, `Bondi should be ~6.5 km from the CBD, got ${km}`)
})

test('pins are filtered by radius and ordered nearest first', () => {
  const pins = [
    { id: 'parramatta', ...PARRAMATTA },
    { id: 'bondi', ...BONDI },
    { id: 'cbd', latitude: CBD.lat, longitude: CBD.lng },
    { id: 'pinless', ...NO_COORDS },
  ]
  assert.deepEqual(filterPinsWithinRadius(pins, CBD, 2).map((p) => p.id), ['cbd'])
  assert.deepEqual(filterPinsWithinRadius(pins, CBD, 10).map((p) => p.id), ['cbd', 'bondi'])
  assert.deepEqual(filterPinsWithinRadius(pins, CBD, 25).map((p) => p.id), ['cbd', 'bondi', 'parramatta'])
})

test('auto-locate follows the browser permission where it can be read', () => {
  assert.equal(shouldAutoLocate({ storedConsent: null, permission: 'granted' }), true)
  assert.equal(shouldAutoLocate({ storedConsent: 'declined', permission: 'granted' }), true)
  assert.equal(shouldAutoLocate({ storedConsent: 'granted', permission: 'prompt' }), false)
  assert.equal(shouldAutoLocate({ storedConsent: 'granted', permission: 'denied' }), false)
  assert.equal(shouldAutoLocate({ storedConsent: null, permission: 'prompt' }), false)
  assert.equal(shouldAutoLocate({ storedConsent: null, permission: 'denied' }), false)
})

test('auto-locate falls back to the stored consent when permission cannot be read', () => {
  assert.equal(shouldAutoLocate({ storedConsent: 'granted', permission: null }), true)
  assert.equal(shouldAutoLocate({ storedConsent: 'declined', permission: null }), false)
  assert.equal(shouldAutoLocate({ storedConsent: null, permission: null }), false)
})

test('an area group value jumps to its centre; a plain suburb does not', () => {
  assert.deepEqual(areaJumpTarget('Sydney', 'Newcastle & the Hunter'), { lat: -32.9283, lng: 151.7817 })
  assert.deepEqual(areaJumpTarget('Sydney', 'Wollongong & the Illawarra'), { lat: -34.4278, lng: 150.8931 })
  assert.equal(areaJumpTarget('Sydney', 'Bondi'), null)
  assert.equal(areaJumpTarget('Melbourne', 'Newcastle & the Hunter'), null)
  assert.equal(areaJumpTarget('Sydney', ''), null)
  assert.equal(areaJumpTarget('Sydney', null), null)
})
