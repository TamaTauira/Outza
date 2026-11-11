import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  CLOSE_BUTTON,
  PEEK_ANTENNA,
  SCROLL_PEEK_MAX_WIDTH,
  SCROLL_PEEK_SETTLE_MS,
  SCROLL_PEEK_VISIBLE,
  closeButtonBox,
  peekVisibleSpan,
  scrollPeekActive,
  scrollPeekLayout,
} from './mascot-scroll-peek'

const PHONE_W = 3.27 * 16
const PHONE_H = PHONE_W * (1092 / 763)
const LEFT_EYE = { left: 0.25, right: 0.472 }
const RIGHT_EYE = { left: 0.613, right: 0.788 }

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

test('the on-screen half keeps the antenna whole and shows one eye', () => {
  assert.ok(SCROLL_PEEK_VISIBLE > 0.5 && SCROLL_PEEK_VISIBLE < 0.7)
  assert.ok(PEEK_ANTENNA.right <= SCROLL_PEEK_VISIBLE)
  assert.ok(PEEK_ANTENNA.left >= 1 - SCROLL_PEEK_VISIBLE)
  const right = peekVisibleSpan('right')
  const left = peekVisibleSpan('left')
  const inside = (span: { left: number; right: number }, box: { left: number; right: number }) =>
    box.left >= span.left - 0.001 && box.right <= span.right + 0.001
  const overlap = (span: { left: number; right: number }, box: { left: number; right: number }) =>
    Math.min(span.right, box.right) - Math.max(span.left, box.left)
  assert.ok(inside(right, PEEK_ANTENNA))
  assert.ok(inside(left, PEEK_ANTENNA))
  assert.ok(inside(right, LEFT_EYE))
  assert.ok(overlap(right, RIGHT_EYE) < 0.02)
  assert.ok(inside(left, RIGHT_EYE))
  assert.equal(right.right - right.left, SCROLL_PEEK_VISIBLE)
  assert.equal(left.right - left.left, SCROLL_PEEK_VISIBLE)
})

test('he leans out of the nearer edge and sits above the bottom nav', () => {
  const close = closeButtonBox(PHONE_W, PHONE_H)
  assert.equal(close.width, CLOSE_BUTTON.size)
  assert.equal(close.height, CLOSE_BUTTON.size)
  const reserve = 96

  const right = scrollPeekLayout({
    x: 300,
    y: 180,
    width: PHONE_W,
    height: PHONE_H,
    viewportW: 390,
    viewportH: 844,
    close,
    bottomReserve: reserve,
  })
  assert.equal(right.edge, 'right')
  assert.ok(Math.abs(right.visible.right - 390) < 0.6)
  assert.ok(Math.abs(right.visible.left - (390 - PHONE_W * SCROLL_PEEK_VISIBLE)) < 0.6)
  assert.ok(Math.abs(right.visible.bottom - (844 - reserve)) < 0.6)
  assert.ok(Math.abs(right.visible.bottom - right.visible.top - PHONE_H) < 0.01)
  assert.ok(right.close.left >= 390)

  const left = scrollPeekLayout({
    x: 8,
    y: 200,
    width: PHONE_W,
    height: PHONE_H,
    viewportW: 360,
    viewportH: 800,
    close,
    bottomReserve: reserve,
  })
  assert.equal(left.edge, 'left')
  assert.ok(Math.abs(left.visible.left) < 0.6)
  assert.ok(Math.abs(left.visible.right - PHONE_W * SCROLL_PEEK_VISIBLE) < 0.6)
  assert.ok(Math.abs(left.visible.bottom - (800 - reserve)) < 0.6)
  assert.ok(left.close.right <= 0)

  assert.equal(scrollPeekActive({ width: 1440, atBottom: false, revealed: false, msSinceScroll: 10 }), false)
})

test('the tuck is a phone-only slide with no face crop, and reduced motion snaps', () => {
  const css = readFileSync(new URL('../components/vibepeep-roam.css', import.meta.url), 'utf8')
  const block = css.slice(css.indexOf('/* Narrow viewports:'))
  assert.match(block, /@media \(max-width: 767px\)/)
  assert.match(block, /\.vp-roam\[data-scroll-peek='1'\] \.vp-roam-body/)
  assert.equal(block.includes('clip-path'), false)
  assert.match(block, /@media \(max-width: 767px\) and \(prefers-reduced-motion: reduce\)[\s\S]*transition: none;/)
  assert.match(block, /\.vp-roam\[data-scroll-peek='1'\] \.vp-buddy-min \{[^}]*visibility: hidden;/)
  assert.match(block, /\.vp-roam\[data-scroll-peek='1'\] \.vp-buddy-min \{[^}]*pointer-events: none;/)
  assert.match(css, /\.vp-roam \.vp-buddy-min \{[^}]*min-width: 44px;/)
  assert.match(css, /\.vp-roam \.vp-buddy-min \{[^}]*min-height: 44px;/)
})
