import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// Poster treatment (owner Option A, 2026-11-28): the whole photo, uncropped,
// centred over a blurred copy of itself, on every EventImage surface. These
// pins keep the sharp layer from regressing to a cover crop and keep the
// --vp-ratio hook wired at both ends.

test('the sharp layer is contained and only the blur copy covers', () => {
  const tsx = read('../components/event-image.tsx')
  const stage = tsx.slice(tsx.indexOf('function StageImage'), tsx.indexOf('function HoldingImage'))
  assert.match(stage, /blur \? 'vp-photo-blur-img object-cover' : 'object-contain'/)
  assert.equal(stage.includes(": 'object-cover'"), false)
})

test('globals.css sizes the fit layer from --vp-ratio, with the full frame as the open state', () => {
  const css = read('../app/globals.css')
  assert.ok(css.includes('.vp-photo-fit:not(.is-open)'))
  assert.ok(css.includes('aspect-ratio: var(--vp-ratio)'))
  assert.ok(css.includes('calc(100cqh * var(--vp-ratio))'))
  const base = css.slice(css.indexOf('.vp-photo-fit,'), css.indexOf('.vp-photo-feather'))
  assert.ok(base.includes('.vp-photo-fit.is-open'))
  assert.ok(base.includes('width: 100%'))
  assert.ok(base.includes('height: 100%'))
})

test('EventImage still publishes the measured ratio and the is-open state', () => {
  const tsx = read('../components/event-image.tsx')
  assert.ok(tsx.includes("['--vp-ratio' as string]: String(ratio)"))
  assert.ok(tsx.includes("!ratio && 'is-open'"))
})

test('a missing picture still falls back to the covering holding art', () => {
  const tsx = read('../components/event-image.tsx')
  const holding = tsx.slice(tsx.indexOf('function HoldingImage'))
  assert.ok(holding.includes('object-cover'))
})
