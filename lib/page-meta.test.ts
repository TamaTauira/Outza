import assert from 'node:assert/strict'
import test from 'node:test'
import { pageMeta } from './page-meta'
import { BRAND_OG_IMAGE } from './brand'

test('every pageMeta result carries the default share image', () => {
  const meta = pageMeta({ title: 'About', description: 'A guide', path: '/about' })
  const images = meta.openGraph?.images
  assert.ok(Array.isArray(images) && images.length === 1)
  const image = images[0]
  assert.equal(typeof image === 'object' && image && 'url' in image ? image.url : '', BRAND_OG_IMAGE)
  const twitter = meta.twitter?.images
  assert.ok(Array.isArray(twitter) && twitter.length === 1)
})

test('private pageMeta stays noindex and still has a share image', () => {
  const meta = pageMeta({ title: 'Your account', path: '/account', index: false })
  assert.deepEqual(meta.robots, { index: false, follow: false })
  assert.ok(Array.isArray(meta.openGraph?.images) && meta.openGraph.images.length === 1)
})
