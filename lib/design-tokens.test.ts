import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { VP_COLOUR, VP_CONTAINER_MAX, VP_RADIUS, VP_SPACE, VP_TYPE } from './design-tokens'

const css = readFileSync(new URL('../app/design-tokens.css', import.meta.url), 'utf8').toLowerCase()
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

function channel(hex: string, index: number) {
  const n = parseInt(hex.slice(1), 16)
  const value = (n >> (16 - index * 8)) & 255
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function contrast(a: string, b: string) {
  const lum = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2)
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('the dark theme declares every spec colour, radius, space and the fluid shell', () => {
  for (const hex of Object.values(VP_COLOUR)) {
    assert.match(css, new RegExp(hex.toLowerCase().replace('#', '#?')))
  }
  for (const size of Object.values(VP_RADIUS)) assert.match(css, new RegExp(size))
  for (const size of Object.values(VP_SPACE)) assert.match(css, new RegExp(` ${size}`))
  assert.match(css, new RegExp(VP_CONTAINER_MAX))
  assert.match(css, /--vp-page-top:\s*0\.5rem/)
  assert.match(css, /--vp-card-gap:\s*1rem/)
  assert.match(globals, /max-width:\s*var\(--vp-container-max\)/)
  assert.match(globals, /\.vp-page-top\s*\{\s*padding-top:\s*var\(--vp-page-top\)/)
})

test('display and body faces are Manrope and Inter', () => {
  assert.match(layout, /Manrope/)
  assert.match(layout, /Inter/)
  assert.equal(VP_TYPE.display, 'Manrope')
  assert.equal(VP_TYPE.body, 'Inter')
  assert.equal(VP_TYPE.buttonWeight, '600')
  assert.equal(VP_TYPE.minMobilePx, 13)
})

test('brand orange is readable on the dark canvas, and the ink colour is readable on white', () => {
  assert.ok(contrast(VP_COLOUR.brandOrange, VP_COLOUR.bgCanvas) >= 4.5)
  assert.ok(contrast(VP_COLOUR.brandOrangeInk, '#FFFFFF') >= 4.5)
  assert.ok(contrast('#1A1408', VP_COLOUR.brandOrange) >= 4.5)
})
