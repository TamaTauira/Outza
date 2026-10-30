import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isLandingPath, landingAttrFromCookies, landingQuery } from './landing-attribution'

test('landing paths are guides, not private or event URLs', () => {
  assert.equal(isLandingPath('/sydney/free-events'), true)
  assert.equal(isLandingPath('/sydney/newtown/markets/sunday'), true)
  assert.equal(isLandingPath('/guides/family-activities'), true)
  assert.equal(isLandingPath('/events/jazz-night-abc'), false)
  assert.equal(isLandingPath('/admin/seo'), false)
  assert.equal(isLandingPath('/sydney'), false)
  assert.equal(isLandingPath('sydney/events'), false)
  assert.equal(isLandingPath('/sydney/free-events?x=1'), false)
})

test('event links keep the landing path and cookies must be a known source', () => {
  assert.equal(landingQuery('/events/jazz-abc', '/sydney/markets'), '/events/jazz-abc?lp=%2Fsydney%2Fmarkets')
  assert.equal(landingQuery('/events/jazz-abc', '/admin'), '/events/jazz-abc')
  assert.deepEqual(landingAttrFromCookies('SEARCH', '%2Fsydney%2Ffree-events'), { source: 'SEARCH', path: '/sydney/free-events' })
  assert.equal(landingAttrFromCookies('brand', '/sydney/free-events'), null)
  assert.equal(landingAttrFromCookies('SEARCH', '/events/abc'), null)
})
