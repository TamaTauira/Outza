import assert from 'node:assert/strict'
import test from 'node:test'
import { categoryColor, categoryInk } from './categories'
import { BRAND_ORANGE } from './brand'

function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    const channel = (shift: number) => {
      const s = ((n >> shift) & 255) / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('category tiles clear AA, including brand orange', () => {
  assert.equal(categoryInk(BRAND_ORANGE), '#1A1408')
  assert.ok(contrast(categoryInk(BRAND_ORANGE), BRAND_ORANGE) >= 4.5)
  for (const name of ['Music', 'Comedy', 'Sport', 'Festival', 'Theatre', 'Event', 'Markets']) {
    const bg = categoryColor(name)
    assert.ok(contrast(categoryInk(bg), bg) >= 4.5, name)
  }
})
