import assert from 'node:assert/strict'
import test from 'node:test'
import { displayFileUrl, displayMasterUrl, displayWidths, estimateDisplayStorage, eventPictureFrom } from './display-spec'

test('display widths never grow past the source', () => {
  assert.deepEqual(displayWidths(2400), [480, 960, 1440])
  assert.deepEqual(displayWidths(960), [480, 960])
  assert.deepEqual(displayWidths(300), [300])
  assert.deepEqual(displayWidths(16), [])
})

test('a pending manifest is not a picture, and a stored one keeps its own files', () => {
  assert.equal(eventPictureFrom({ imageDisplay: { v: 1, pending: true } }), null)
  assert.equal(eventPictureFrom({ imageDisplay: null }), null)
  const picture = eventPictureFrom({
    imageWidth: 800,
    imageHeight: 600,
    imageColor: '#112233',
    imageBlur: 'data:image/webp;base64,abc',
    imageDisplay: { v: 1, base: 'https://cdn.example/event-display/abc/', widths: [480] },
  })
  assert.equal(picture?.width, 800)
  assert.equal(picture?.lowQuality, false)
  assert.equal(displayMasterUrl(picture!), 'https://cdn.example/event-display/abc/w480.webp')
  assert.equal(displayFileUrl(picture!.base, 480, 'avif'), 'https://cdn.example/event-display/abc/w480.avif')
})

test('a narrow or short source is marked low quality without changing the file list', () => {
  const small = eventPictureFrom({
    imageWidth: 140,
    imageHeight: 140,
    imageDisplay: { v: 1, base: 'https://cdn.example/event-display/tiny/', widths: [140] },
  })
  assert.equal(small?.lowQuality, true)
  assert.equal(small?.base, 'https://cdn.example/event-display/tiny')
  const flagged = eventPictureFrom({
    imageWidth: 1440,
    imageHeight: 960,
    imageDisplay: { v: 1, lowQuality: true, base: 'https://cdn.example/event-display/flag/', widths: [480, 960, 1440] },
  })
  assert.equal(flagged?.lowQuality, true)
})

test('storage estimate counts both formats at each width', () => {
  const estimate = estimateDisplayStorage(10)
  assert.equal(estimate.files, 60)
  assert.equal(estimate.bytes, 60 * 24 * 1024)
  assert.deepEqual(estimateDisplayStorage(0), { files: 0, bytes: 0 })
})
