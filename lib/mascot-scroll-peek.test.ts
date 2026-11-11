import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { MASCOT_PHONE_WIDTH } from './mascot-size'
import {
  CLOSE_BUTTON,
  CLOSE_CLEARANCE,
  SCROLL_PEEK_MAX_WIDTH,
  SCROLL_PEEK_SETTLE_MS,
  SCROLL_PEEK_WINDOW,
  closeButtonBox,
  peekClearsText,
  scrollPeekActive,
  scrollPeekClip,
  scrollPeekLayout,
} from './mascot-scroll-peek'

const PHONE_W = 3.27 * 16
const PHONE_H = PHONE_W * (1092 / 763)

test('tuck only while a narrow page is scrolling, and pop back at the bottom or after a second', () => {
  assert.equal(SCROLL_PEEK_MAX_WIDTH, 767)
  assert.equal(SCROLL_PEEK_SETTLE_MS, 1000)
  const scrolling = { width: 390, atBottom: false, revealed: false, msSinceScroll: 200 }
  assert.equal(scrollPeekActive(scrolling), true)
  assert.equal(scrollPeekActive({ ...scrolling, width: 360 }), true)
  assert.equal(scrollPeekActive({ ...scrolling, width: 767 }), true)
  assert.equal(scrollPeekActive({ ...scrolling, width: 768 }), false)
  assert.equal(scrollPeekActive({ ...scrolling, width: 1440 }), false)
  assert.equal(scrollPeekActive({ ...scrolling, msSinceScroll: null }), false)
  assert.equal(scrollPeekActive({ ...scrolling, msSinceScroll: 999 }), true)
  assert.equal(scrollPeekActive({ ...scrolling, msSinceScroll: 1000 }), false)
  assert.equal(scrollPeekActive({ ...scrolling, atBottom: true }), false)
  assert.equal(scrollPeekActive({ ...scrolling, revealed: true }), false)
})

test('the peek keeps the antenna attached and both eyes in a slice that fits the page gutter', () => {
  const antenna = { left: 0.4155, right: 0.4155 + 0.1717, top: 0.0037, bottom: 0.0037 + 0.1429 }
  assert.ok(antenna.left >= SCROLL_PEEK_WINDOW.left)
  assert.ok(antenna.right <= SCROLL_PEEK_WINDOW.right)
  assert.ok(antenna.top >= SCROLL_PEEK_WINDOW.top)
  assert.ok(antenna.bottom <= SCROLL_PEEK_WINDOW.bottom)
  // Left eye ends at 0.470, right eye starts at 0.614 (body art, mapped onto the rig).
  assert.ok(SCROLL_PEEK_WINDOW.left < 0.47 && SCROLL_PEEK_WINDOW.right > 0.251)
  assert.ok(SCROLL_PEEK_WINDOW.left < 0.784 && SCROLL_PEEK_WINDOW.right > 0.614)
  assert.ok(SCROLL_PEEK_WINDOW.bottom >= 0.493)
  const slice = SCROLL_PEEK_WINDOW.right - SCROLL_PEEK_WINDOW.left
  const phoneRem = Number.parseFloat(MASCOT_PHONE_WIDTH)
  assert.ok(slice * phoneRem < 1, 'slice must sit inside the 1rem page padding')
  assert.equal(scrollPeekClip(), 'inset(0% 36% 50% 36%)')
})

test('he slides into the gutter and the dismiss control stays on screen, clear of his face', () => {
  const close = closeButtonBox(PHONE_W, PHONE_H)
  assert.equal(close.width, CLOSE_BUTTON.size)
  assert.equal(close.height, CLOSE_BUTTON.size)

  const right = scrollPeekLayout({
    x: 300,
    y: 420,
    width: PHONE_W,
    height: PHONE_H,
    viewportW: 390,
    viewportH: 844,
    close,
  })
  assert.equal(right.edge, 'right')
  assert.equal(peekClearsText(right, 390), true)
  assert.ok(right.close.left >= 4)
  assert.ok(right.close.right <= 390 - 4)
  assert.ok(right.close.top >= 4)
  assert.ok(right.close.bottom <= 844 - 4)
  assert.ok(right.close.bottom + CLOSE_CLEARANCE <= right.window.top || right.close.top >= right.window.bottom + CLOSE_CLEARANCE || right.close.right + CLOSE_CLEARANCE <= right.window.left || right.window.right + CLOSE_CLEARANCE <= right.close.left)

  const left = scrollPeekLayout({
    x: 8,
    y: 360,
    width: PHONE_W,
    height: PHONE_H,
    viewportW: 360,
    viewportH: 740,
    close,
  })
  assert.equal(left.edge, 'left')
  assert.equal(peekClearsText(left, 360), true)
  assert.ok(left.close.left >= 4 && left.close.right <= 356)
  assert.ok(left.close.top >= 4 && left.close.bottom <= 736)

  const desktop = scrollPeekLayout({
    x: 1100,
    y: 400,
    width: 3.69 * 16,
    height: 3.69 * 16 * (1092 / 763),
    viewportW: 1440,
    viewportH: 900,
    close: closeButtonBox(3.69 * 16, 3.69 * 16 * (1092 / 763)),
  })
  assert.equal(scrollPeekActive({ width: 1440, atBottom: false, revealed: false, msSinceScroll: 10 }), false)
  assert.equal(desktop.edge, 'right')
})

test('the tuck is phone-only CSS and reduced motion snaps instead of sliding', () => {
  const css = readFileSync(new URL('../components/vibepeep-roam.css', import.meta.url), 'utf8')
  const clip = scrollPeekClip()
  const at = css.indexOf(clip)
  assert.ok(at > css.indexOf(`@media (max-width: ${SCROLL_PEEK_MAX_WIDTH}px)`))
  const media = css.slice(css.lastIndexOf('@media', at), at)
  assert.match(media, new RegExp(`max-width: ${SCROLL_PEEK_MAX_WIDTH}px`))
  assert.equal(/min-width:\s*768px/.test(media), false)
  assert.match(css, /@media \(max-width: 767px\) and \(prefers-reduced-motion: reduce\)[\s\S]*transition: none;/)
  assert.match(css, /data-scroll-peek='1'/)
  assert.match(css, /\.vp-roam \.vp-buddy-min \{[^}]*min-width: 44px;/)
  assert.match(css, /\.vp-roam \.vp-buddy-min \{[^}]*min-height: 44px;/)
})
