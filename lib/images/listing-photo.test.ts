import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MIN_LISTING_PHOTO_HEIGHT,
  MIN_LISTING_PHOTO_WIDTH,
  bitmapIsLowQuality,
  declaredPhotoIsLowQuality,
  hasStoredPhotoSize,
  storedPhotoIsLowQuality,
} from './listing-photo'

test('stored pixels under 600 wide or 400 tall are too small to show', () => {
  assert.equal(MIN_LISTING_PHOTO_WIDTH, 600)
  assert.equal(MIN_LISTING_PHOTO_HEIGHT, 400)
  assert.equal(storedPhotoIsLowQuality(140, 140), true)
  assert.equal(storedPhotoIsLowQuality(472, 315), true)
  assert.equal(storedPhotoIsLowQuality(500, 800), true)
  assert.equal(storedPhotoIsLowQuality(800, 300), true)
  assert.equal(storedPhotoIsLowQuality(1088, 544), false)
  assert.equal(storedPhotoIsLowQuality(1920, 1080), false)
  assert.equal(storedPhotoIsLowQuality(null, null), false)
  assert.equal(storedPhotoIsLowQuality(1088, 544, true), true)
  assert.equal(hasStoredPhotoSize(1088, 544), true)
  assert.equal(hasStoredPhotoSize(1088, null), false)
})

test('a named thumbnail URL is low quality and a full original is not', () => {
  assert.equal(
    declaredPhotoIsLowQuality('https://static.moshtix.com.au/uploads/f0ae7c19-5a77-4d05-a30f-c413ae7facfex140x140'),
    true,
  )
  assert.equal(declaredPhotoIsLowQuality('https://images.humanitix.com/i/abc.jpeg@seo-200'), true)
  assert.equal(declaredPhotoIsLowQuality('https://assets.oztix.com.au/image/abc.png?width=2400&height=1350'), false)
  assert.equal(declaredPhotoIsLowQuality('https://images.humanitix.com/i/abc.jpeg@original'), false)
  assert.equal(declaredPhotoIsLowQuality(null), false)
})

test('a resized next/image file is not treated as the source size', () => {
  const resized = 'https://outza-outza.vercel.app/_next/image?url=https%3A%2F%2Fcdn.example%2Fa.jpg&w=640&q=75'
  assert.equal(bitmapIsLowQuality({ naturalWidth: 640, naturalHeight: 360, currentSrc: resized }), false)
  // A phone slot asks for 480 and the decoded file is a little under that. The master is still large.
  assert.equal(bitmapIsLowQuality({ naturalWidth: 400, naturalHeight: 200, currentSrc: 'https://x/_next/image?url=a&w=480&q=75' }), false)
  assert.equal(bitmapIsLowQuality({ naturalWidth: 358, naturalHeight: 179, currentSrc: 'https://x/_next/image?url=a&w=384&q=75' }), false)
  const tiny = 'https://outza-outza.vercel.app/_next/image?url=https%3A%2F%2Fstatic.moshtix.com.au%2Fa&w=640&q=75'
  assert.equal(bitmapIsLowQuality({ naturalWidth: 140, naturalHeight: 140, currentSrc: tiny }), true)
  assert.equal(bitmapIsLowQuality({ naturalWidth: 472, naturalHeight: 315, currentSrc: 'https://x/_next/image?url=a&w=828&q=75' }), true)
  assert.equal(bitmapIsLowQuality({ naturalWidth: 1088, naturalHeight: 544, src: 'https://images.humanitix.com/i/a.jpeg@original' }), false)
  assert.equal(bitmapIsLowQuality({ naturalWidth: 140, naturalHeight: 140, src: 'https://static.moshtix.com.au/a' }), true)
})
