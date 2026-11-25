import assert from 'node:assert/strict'
import { test } from 'node:test'
import { footerPaths, FOOTER_CITY_LINKS } from './site-links'
import { SITE_SAME_AS, SITE_SOCIAL } from './site-social'

test('social profiles are one list, in order, and sameAs matches them', () => {
  assert.deepEqual(SITE_SOCIAL.map((item) => item.id), ['instagram', 'tiktok', 'threads', 'youtube', 'x', 'facebook', 'linkedin'])
  assert.deepEqual(SITE_SAME_AS, SITE_SOCIAL.map((item) => item.href))
  for (const href of SITE_SAME_AS) assert.equal(href.startsWith('https://'), true)
  assert.equal(new Set(SITE_SAME_AS).size, SITE_SAME_AS.length)
})

test('footer paths are unique and include the city guides', () => {
  const paths = footerPaths()
  assert.equal(new Set(paths).size, paths.length)
  assert.equal(FOOTER_CITY_LINKS.length, 10)
  assert.ok(paths.includes('/sydney/events'))
  assert.ok(paths.includes('/darwin/events'))
  assert.ok(paths.includes('/local'))
  assert.ok(paths.includes('/attributions'))
})
