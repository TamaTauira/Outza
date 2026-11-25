import assert from 'node:assert/strict'
import test from 'node:test'
import { canOptimizeImage, displaySourceUrl } from './images/source-url-client'

test('Humanitix heroes use the original, never the rejected 1200 variant', () => {
  const stored = 'https://images.humanitix.com/i/abc.png@seo-1200.jpg'
  assert.equal(displaySourceUrl(stored, 1200), 'https://images.humanitix.com/i/abc.png@original')
  assert.equal(displaySourceUrl(stored, 800), 'https://images.humanitix.com/i/abc.png@original')
  assert.equal(displaySourceUrl(stored, 200), 'https://images.humanitix.com/i/abc.png@seo-500.jpg')
  assert.equal(displaySourceUrl('https://images.humanitix.com/i/abc.png', 1200), 'https://images.humanitix.com/i/abc.png@original')
  assert.doesNotMatch(displaySourceUrl(stored, 1200) ?? '', /seo-1200|seo-200/)
})

test('cards keep the largest Ticketmaster file, and only a tiny marker steps down', () => {
  assert.equal(
    displaySourceUrl('https://s1.ticketm.net/dam/a_TABLET_LANDSCAPE_LARGE_16_9.jpg', 640),
    'https://s1.ticketm.net/dam/a_TABLET_LANDSCAPE_LARGE_16_9.jpg',
  )
  assert.equal(
    displaySourceUrl('https://s1.ticketm.net/dam/a_RETINA_PORTRAIT_16_9.jpg', 1200),
    'https://s1.ticketm.net/dam/a_TABLET_LANDSCAPE_LARGE_16_9.jpg',
  )
  assert.equal(
    displaySourceUrl('https://s1.ticketm.net/dam/a_TABLET_LANDSCAPE_LARGE_16_9.jpg', 96),
    'https://s1.ticketm.net/dam/a_RETINA_PORTRAIT_16_9.jpg',
  )
})

test('Oztix drops the resize query so the full file is used', () => {
  assert.equal(
    displaySourceUrl('https://assets.oztix.com.au/image/abc.png?width=1200&height=600', 1200),
    'https://assets.oztix.com.au/image/abc.png',
  )
})

test('presigned links are not sent through the image optimiser', () => {
  assert.equal(canOptimizeImage('https://images.humanitix.com/i/abc.png@seo-500.jpg'), true)
  assert.equal(canOptimizeImage('https://bucket.s3.amazonaws.com/a.jpg?X-Amz-Signature=abc'), false)
  assert.equal(canOptimizeImage('https://s1.ticketm.net/dam/a_TABLET_LANDSCAPE_LARGE_16_9.jpg'), false)
  assert.equal(canOptimizeImage('http://images.squarespace-cdn.com/a.jpg'), false)
})

test('http image hosts are loaded over https', () => {
  assert.equal(
    displaySourceUrl('http://images.squarespace-cdn.com/content/v1/abc/photo.jpg', 800),
    'https://images.squarespace-cdn.com/content/v1/abc/photo.jpg',
  )
  assert.equal(canOptimizeImage('https://images.squarespace-cdn.com/content/v1/abc/photo.jpg'), true)
})
