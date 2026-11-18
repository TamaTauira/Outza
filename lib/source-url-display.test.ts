import assert from 'node:assert/strict'
import test from 'node:test'
import { canOptimizeImage, displaySourceUrl } from './images/source-url-client'

test('cards ask Humanitix and Ticketmaster for a smaller file', () => {
  assert.equal(
    displaySourceUrl('https://images.humanitix.com/i/abc.png@original', 480),
    'https://images.humanitix.com/i/abc.png@seo-500.jpg',
  )
  assert.equal(
    displaySourceUrl('https://s1.ticketm.net/dam/a_TABLET_LANDSCAPE_LARGE_16_9.jpg', 96),
    'https://s1.ticketm.net/dam/a_RETINA_PORTRAIT_16_9.jpg',
  )
})

test('presigned links are not sent through the image optimiser', () => {
  assert.equal(canOptimizeImage('https://images.humanitix.com/i/abc.png@seo-500.jpg'), true)
  assert.equal(canOptimizeImage('https://bucket.s3.amazonaws.com/a.jpg?X-Amz-Signature=abc'), false)
})
