import assert from 'node:assert/strict'
import test from 'node:test'
import { displayColumnPatch } from './images/display-spec'
import {
  BACKFILL_BATCH,
  HOME_PASSTHROUGH_HANDLE,
  backfillWhere,
  displayIsReady,
  isHomePassthrough,
  parseBackfillArgs,
  shouldBackfill,
} from './images/display-backfill'

const TODAY = new Date('2026-11-25T00:00:00.000Z')
const PAST = new Date('2026-01-01T00:00:00.000Z')
const READY = {
  imageWidth: 1440,
  imageDisplay: { v: 1, pending: false, base: 'https://cdn.example/event-display/abc', widths: [480, 960, 1440] },
}

test('the default run only counts, and a batch is 50', () => {
  assert.deepEqual(parseBackfillArgs(['node', 'script']), { apply: false, batch: BACKFILL_BATCH })
  assert.equal(BACKFILL_BATCH, 50)
  assert.equal(parseBackfillArgs(['--apply']).apply, true)
  assert.equal(parseBackfillArgs(['--apply', '--batch', '25']).batch, 25)
  assert.equal(parseBackfillArgs(['--batch', '0']).batch, 50)
})

test('a finished row is skipped and a failed try is not queued again', () => {
  assert.equal(displayIsReady(READY), true)
  assert.equal(shouldBackfill({ ...READY, imageUrl: 'https://cdn.example/a.jpg', date: TODAY }, TODAY), false)
  assert.equal(shouldBackfill({
    imageUrl: 'https://cdn.example/a.jpg',
    imageWidth: null,
    imageDisplay: { v: 1, failed: true, pending: false },
    date: TODAY,
  }, TODAY), false)
  assert.equal(shouldBackfill({
    imageUrl: 'https://cdn.example/a.jpg',
    imageWidth: null,
    imageDisplay: null,
    date: TODAY,
  }, TODAY), true)
})

test('the home Humanitix PNG stays in the queue even when the listing is old or a duplicate', () => {
  const url = `https://images.humanitix.com/i/${HOME_PASSTHROUGH_HANDLE}.png@original`
  assert.equal(isHomePassthrough(url), true)
  const row = { imageUrl: url, imageWidth: null, imageDisplay: null, duplicateOfId: 'other', date: PAST }
  assert.equal(shouldBackfill(row, TODAY), true)
  assert.equal(shouldBackfill({ ...row, imageUrl: 'https://cdn.example/other.png' }, TODAY), false)
  const where = JSON.stringify(backfillWhere(TODAY))
  assert.match(where, new RegExp(HOME_PASSTHROUGH_HANDLE))
  assert.match(where, /imageWidth/)
})

test('the stored patch fills the derivative columns and leaves the original URL alone', () => {
  const patch = displayColumnPatch({
    width: 1088,
    height: 544,
    color: '#112233',
    blur: 'data:image/webp;base64,abc',
    display: { v: 1, pending: false, base: 'https://cdn.example/event-display/abc', widths: [480, 960] },
  })
  assert.deepEqual(Object.keys(patch).sort(), ['imageBlur', 'imageColor', 'imageDisplay', 'imageHeight', 'imageWidth'])
  assert.equal('imageUrl' in patch, false)
})
