import assert from 'node:assert/strict'
import test from 'node:test'
import { fullPageNavigation } from './full-page-nav'

test('opening the full page reloads when the peek is already on that event', () => {
  const path = '/events/jazz-night-abc'
  assert.equal(fullPageNavigation(path, path), 'reload')
  assert.equal(fullPageNavigation(path, `https://outza-outza.vercel.app${path}`), 'reload')
})

test('a different event address is a fresh navigation', () => {
  assert.equal(fullPageNavigation('/events/jazz-night-abc', '/events/other-def'), 'assign')
})
