import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MASCOT_DESKTOP_WIDTH, MASCOT_PHONE_WIDTH } from './mascot-size'

test('every page shares one desktop size and one phone size', () => {
  assert.equal(MASCOT_DESKTOP_WIDTH, '3.69rem')
  assert.equal(MASCOT_PHONE_WIDTH, '3.27rem')
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../components/vibepeep-roam.css', import.meta.url), 'utf8')
  assert.match(layout, /MASCOT_DESKTOP_WIDTH/)
  assert.match(layout, /MASCOT_PHONE_WIDTH/)
  assert.match(css, /var\(--vp-size-desktop\)/)
  assert.match(css, /var\(--vp-size-phone\)/)
  assert.equal(css.includes('width: 5.5rem'), false)
  assert.equal(css.includes('width: 4.8rem'), false)
  assert.equal(css.includes('width: 3.27rem'), false)
})
