import assert from 'node:assert/strict'
import test from 'node:test'
import { MOSHTIX_LOOKBACK_MS, moshtixNoteEvent, moshtixNotePage, moshtixResume } from './moshtix-refresh'

const NOW = Date.parse('2026-11-04T17:10:00.000Z')
const FLOOR = NOW - MOSHTIX_LOOKBACK_MS

test('a missing or stale cursor starts at the lookback floor', () => {
  assert.deepEqual(moshtixResume(NOW, null, 0), { fromMs: FLOOR, page: 0 })
  assert.deepEqual(moshtixResume(NOW, FLOOR - 60_000, 4), { fromMs: FLOOR, page: 0 })
  assert.deepEqual(moshtixResume(NOW, 0, 3), { fromMs: FLOOR, page: 0 })
})

test('a cursor inside the window resumes, including a later page of one timestamp', () => {
  const from = Date.parse('2026-11-20T01:00:00.000Z')
  assert.deepEqual(moshtixResume(NOW, from, 0), { fromMs: from, page: 0 })
  assert.deepEqual(moshtixResume(NOW, from, 2), { fromMs: from, page: 2 })
})

test('a later event moves the resume point and a full page of one time steps forward', () => {
  const start = { fromMs: FLOOR, page: 0 }
  const later = Date.parse('2026-11-05T01:30:00.000Z')
  const moved = moshtixNoteEvent(start, later)
  assert.deepEqual(moved, { fromMs: later, page: 0 })
  assert.equal(moshtixNoteEvent(moved, later), moved)

  const mixed = moshtixNotePage(start, moved, FLOOR, later)
  assert.deepEqual(mixed, moved)

  const sameTime = Date.parse('2026-11-05T01:30:00.000Z')
  const stuck = moshtixNotePage(
    { fromMs: sameTime, page: 1 },
    { fromMs: sameTime, page: 1 },
    sameTime,
    sameTime,
  )
  assert.deepEqual(stuck, { fromMs: sameTime, page: 2 })
})
