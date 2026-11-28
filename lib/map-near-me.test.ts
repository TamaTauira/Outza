import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  DEFAULT_NEAR_ME_RADIUS_KM,
  NEAR_ME_RADII_KM,
  areaJumpTarget,
  filterPinsWithinRadius,
  locateStateAfterError,
  locateStateAfterInvalidation,
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

test('featured-style pins go through the same radius cut as fetched pins', () => {
  // GOLD featured items carry the same latitude/longitude shape as events,
  // so the map cuts them with this same filter while Near me is on.
  const featured = [
    { id: 'gold-far', tier: 'GOLD', ...PARRAMATTA },
    { id: 'gold-near', tier: 'GOLD', ...BONDI },
    { id: 'gold-pinless', tier: 'GOLD', ...NO_COORDS },
  ]
  assert.deepEqual(filterPinsWithinRadius(featured, CBD, 10).map((p) => p.id), ['gold-near'])
  assert.deepEqual(filterPinsWithinRadius(featured, CBD, 25).map((p) => p.id), ['gold-near', 'gold-far'])
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

test('an invalidated locate settles back to idle, whatever stage it reached', () => {
  // Still waiting on the browser's answer when the jump lands: the button
  // must become tappable again, never spin disabled forever.
  assert.equal(locateStateAfterInvalidation('locating'), 'idle')
  // Already landed: Near me turns off with the jump, as before.
  assert.equal(locateStateAfterInvalidation('found'), 'idle')
  // States that already carry an outcome (or none) are untouched.
  assert.equal(locateStateAfterInvalidation('idle'), 'idle')
  assert.equal(locateStateAfterInvalidation('denied'), 'denied')
  assert.equal(locateStateAfterInvalidation('unavailable'), 'unavailable')
})

test('a tapped locate reports its error outcome honestly', () => {
  // A deliberate tap the browser refuses lands on the denied card, so the
  // visitor learns location is off and how to turn it on.
  assert.equal(locateStateAfterError({ permissionDenied: true, silent: false }), 'denied')
  // Any other failure on a tap lands on the retry card instead.
  assert.equal(locateStateAfterError({ permissionDenied: false, silent: false }), 'unavailable')
})

test('an unprompted auto-locate never owns an error outcome', () => {
  // The mount auto-locate runs before the visitor asks for anything: a
  // denial settles silently back to idle — the map opens on the board's
  // selected area with Near me merely offered, no card on arrival.
  assert.equal(locateStateAfterError({ permissionDenied: true, silent: true }), 'idle')
  // The same holds for a position failure or a timeout on that call.
  assert.equal(locateStateAfterError({ permissionDenied: false, silent: true }), 'idle')
})

test('a silent auto-locate refusal never persists a stored decline', () => {
  // The silent path must be fully side-effect-free: if the unprompted
  // mount locate is refused, that transient browser answer must not be
  // written to storage as the visitor's consent — otherwise one stray
  // refusal would stand in for a deliberate decline on every later
  // visit (and, where the Permissions API cannot be read, would stop
  // the auto-locate from ever being offered again). Only a tapped
  // denial records 'declined'. The write lives in the component, not
  // in a pure helper, so pin it at source level like the other
  // placement pins in this repo.
  const src = readFileSync(new URL('../components/map-view.tsx', import.meta.url), 'utf8')
  const errCb = src.slice(src.indexOf('(err) => {'), src.indexOf('{ enableHighAccuracy: false'))
  assert.ok(errCb.includes("if (denied && !silent) { try { localStorage.setItem(LOC_KEY, 'declined') }"), 'the declined consent write fires only for a tapped denial')
  assert.equal((src.match(/setItem\(LOC_KEY, 'declined'\)/g) ?? []).length, 1, 'the declined write exists exactly once, in the guarded error callback')
})

test('an area group value jumps to its centre; a plain suburb does not', () => {
  assert.deepEqual(areaJumpTarget('Sydney', 'Newcastle & the Hunter'), { lat: -32.9283, lng: 151.7817 })
  assert.deepEqual(areaJumpTarget('Sydney', 'Wollongong & the Illawarra'), { lat: -34.4278, lng: 150.8931 })
  assert.equal(areaJumpTarget('Sydney', 'Bondi'), null)
  assert.equal(areaJumpTarget('Melbourne', 'Newcastle & the Hunter'), null)
  assert.equal(areaJumpTarget('Sydney', ''), null)
  assert.equal(areaJumpTarget('Sydney', null), null)
})
