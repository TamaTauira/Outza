import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TINY_PHOTO_EDGE,
  bitmapIsLowQuality,
  declaredPhotoIsLowQuality,
  hasStoredPhotoSize,
  storedPhotoIsLowQuality,
} from './listing-photo'

test('only a source whose long edge is under 300px is too small to show', () => {
  assert.equal(TINY_PHOTO_EDGE, 300)
  assert.equal(storedPhotoIsLowQuality(140, 140), true)
  assert.equal(storedPhotoIsLowQuality(200, 250), true)
  assert.equal(storedPhotoIsLowQuality(472, 315), false)
  assert.equal(storedPhotoIsLowQuality(500, 800), false)
  assert.equal(storedPhotoIsLowQuality(800, 300), false)
  assert.equal(storedPhotoIsLowQuality(1088, 544), false)
  assert.equal(storedPhotoIsLowQuality(1920, 1080), false)
  assert.equal(storedPhotoIsLowQuality(null, null), false)
  assert.equal(hasStoredPhotoSize(1088, 544), true)
  assert.equal(hasStoredPhotoSize(1088, null), false)
})

test('a named thumbnail URL is low quality and a normal photo URL is not', () => {
  assert.equal(
    declaredPhotoIsLowQuality('https://static.moshtix.com.au/uploads/f0ae7c19-5a77-4d05-a30f-c413ae7facfex140x140'),
    true,
  )
  assert.equal(declaredPhotoIsLowQuality('https://static.moshtix.com.au/uploads/abcx200x180'), true)
  assert.equal(declaredPhotoIsLowQuality('https://static.moshtix.com.au/uploads/abcx600x600'), false)
  assert.equal(declaredPhotoIsLowQuality('https://images.humanitix.com/i/abc.jpeg@seo-200'), true)
  assert.equal(declaredPhotoIsLowQuality('https://images.humanitix.com/i/abc.jpeg@seo-500'), false)
  assert.equal(declaredPhotoIsLowQuality('https://cdn.example/a.jpg?width=200&height=180'), true)
  assert.equal(declaredPhotoIsLowQuality('https://assets.oztix.com.au/image/abc.png?width=2400&height=1350'), false)
  assert.equal(declaredPhotoIsLowQuality('https://images.humanitix.com/i/abc.jpeg@original'), false)
  assert.equal(declaredPhotoIsLowQuality('https://whatson.cityofsydney.nsw.gov.au/api/v1/events/events/5796/images/tile-9ykkgs.webp'), false)
  assert.equal(declaredPhotoIsLowQuality(null), false)
})

test('the browser only swaps an original file under 300px wide', () => {
  const resized = 'https://outza-outza.vercel.app/_next/image?url=https%3A%2F%2Fcdn.example%2Fa.jpg&w=640&q=75'
  assert.equal(bitmapIsLowQuality({ naturalWidth: 140, naturalHeight: 140, currentSrc: resized }), false)
  assert.equal(bitmapIsLowQuality({ naturalWidth: 472, naturalHeight: 315, currentSrc: 'https://x/_next/image?url=a&w=828&q=75' }), false)
  assert.equal(bitmapIsLowQuality({ naturalWidth: 220, naturalHeight: 146, currentSrc: 'https://x/_next/image?url=a&w=256&q=75' }), false)
  assert.equal(bitmapIsLowQuality({ naturalWidth: 140, naturalHeight: 140, src: 'https://static.moshtix.com.au/a' }), true)
  assert.equal(bitmapIsLowQuality({ naturalWidth: 472, naturalHeight: 315, src: 'https://whatson.cityofsydney.nsw.gov.au/tile.webp' }), false)
  assert.equal(bitmapIsLowQuality({ naturalWidth: 1088, naturalHeight: 544, src: 'https://images.humanitix.com/i/a.jpeg@original' }), false)
})
