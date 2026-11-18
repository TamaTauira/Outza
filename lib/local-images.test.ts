import assert from 'node:assert/strict'
import test from 'node:test'
import { imageWillExpire, listingPicture, usableSourceImage } from './local-images'

test('a source picture is a real url, not stock or a holding image', () => {
  assert.equal(usableSourceImage('https://images.humanitix.com/i/abc.png@seo-500.jpg'), 'https://images.humanitix.com/i/abc.png@original')
  assert.equal(usableSourceImage('https://picsum.photos/seed/x/800'), null)
  assert.equal(usableSourceImage('/placeholders/community/hero.webp'), null)
  assert.equal(usableSourceImage(null), null)
})

test('presigned object-store links are not stored', () => {
  assert.equal(imageWillExpire('https://files.example/banner.jpg?X-Amz-Signature=abc'), true)
  assert.equal(imageWillExpire('https://images.humanitix.com/i/abc.png@original'), false)
})

test('an organiser upload wins over the source picture', () => {
  const pub = (path: string) => `https://cdn.example/${path}`
  assert.equal(listingPicture('local-images/a.webp', 'https://images.humanitix.com/i/abc.png@original', pub), 'https://cdn.example/local-images/a.webp')
  assert.equal(listingPicture(null, 'https://images.humanitix.com/i/abc.png@original', pub), 'https://images.humanitix.com/i/abc.png@original')
  assert.equal(listingPicture(null, null, pub), null)
})
