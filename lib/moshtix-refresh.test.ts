import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MOSHTIX_LOOKBACK_MS,
  MOSHTIX_PAGE_SIZE,
  MOSHTIX_SMALL_PAGE_SIZE,
  isMoshtixPause,
  moshtixFailureReason,
  moshtixCatalogueExhausted,
  moshtixNoteEvent,
  moshtixNotePage,
  moshtixPauseMessage,
  moshtixPreviousSweepOpen,
  moshtixResume,
  moshtixResumePageSize,
  moshtixRetryDecision,
  moshtixSweepPlan,
  moshtixTransientFailure,
} from './moshtix-refresh'

const NOW = Date.parse('2026-11-04T17:10:00.000Z')
const FLOOR = NOW - MOSHTIX_LOOKBACK_MS
const ROOM = 120_000

test('a missing or stale cursor starts at the lookback floor', () => {
  assert.deepEqual(moshtixResume(NOW, null, 0), { fromMs: FLOOR, page: 0 })
  assert.deepEqual(moshtixResume(NOW, FLOOR - 60_000, 4), { fromMs: FLOOR, page: 0 })
  assert.deepEqual(moshtixResume(NOW, 0, 3), { fromMs: FLOOR, page: 0 })
})

test('a cursor inside the window resumes, including a later page of one timestamp', () => {
  const from = Date.parse('2026-11-20T01:00:00.000Z')
  assert.deepEqual(moshtixResume(NOW, from, 0), { fromMs: from, page: 0 })
  assert.deepEqual(moshtixResume(NOW, from, 2, MOSHTIX_PAGE_SIZE), { fromMs: from, page: 2 })
  assert.deepEqual(moshtixResume(NOW, from, 2, MOSHTIX_SMALL_PAGE_SIZE), { fromMs: from, page: 2 })
  assert.equal(moshtixResumePageSize(MOSHTIX_SMALL_PAGE_SIZE), MOSHTIX_SMALL_PAGE_SIZE)
})

test('a page index from another page size starts again at the same instant', () => {
  const from = Date.parse('2026-12-05T12:00:00.000Z')
  assert.deepEqual(moshtixResume(NOW, from, 3, 200), { fromMs: from, page: 0 })
  assert.deepEqual(moshtixResume(NOW, from, 3, 0), { fromMs: from, page: 0 })
  assert.equal(moshtixResumePageSize(200), MOSHTIX_PAGE_SIZE)
  assert.equal(MOSHTIX_PAGE_SIZE, 50)
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

function http(status: number) {
  return new Error(`Moshtix API ${status}`)
}

test('gateway timeouts and dropped connections are transient, and other statuses are not', () => {
  for (const status of [408, 502, 503, 504]) assert.equal(moshtixTransientFailure(http(status)), true)
  for (const status of [400, 401, 404, 429, 500]) assert.equal(moshtixTransientFailure(http(status)), false)
  const timeout = new Error('The operation was aborted due to timeout')
  timeout.name = 'TimeoutError'
  assert.equal(moshtixTransientFailure(timeout), true)
  assert.equal(moshtixFailureReason(timeout), 'timeout')
  const dropped = new TypeError('fetch failed')
  ;(dropped as { cause?: unknown }).cause = Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' })
  assert.equal(moshtixTransientFailure(dropped), true)
  assert.equal(moshtixFailureReason(http(504)), '504')
  assert.equal(moshtixTransientFailure(new Error('Moshtix API returned no data')), false)
})

test('a transient failure retries, then shrinks the page, then pauses only if this run moved forward', () => {
  const base = { pageSize: MOSHTIX_PAGE_SIZE, page: 4, saved: 0, progressed: false, transient: true, nearBudget: false, remainingMs: ROOM }
  const first = moshtixRetryDecision({ ...base, failures: 1 })
  assert.deepEqual(first, { action: 'retry', delayMs: 1_000, pageSize: MOSHTIX_PAGE_SIZE, page: 4 })

  const second = moshtixRetryDecision({ ...base, failures: 2, saved: 120, progressed: true })
  assert.deepEqual(second, { action: 'retry', delayMs: 2_000, pageSize: MOSHTIX_SMALL_PAGE_SIZE, page: 0 })

  const paused = moshtixRetryDecision({ ...base, failures: 3, saved: 796, progressed: true })
  assert.equal(paused.action, 'pause')
  const duplicates = moshtixRetryDecision({ ...base, failures: 3, saved: 0, progressed: true })
  assert.equal(duplicates.action, 'pause')

  const stuck = moshtixRetryDecision({ ...base, failures: 3 })
  assert.equal(stuck.action, 'fail')
  const refused = moshtixRetryDecision({ ...base, failures: 1, transient: false, saved: 400, progressed: true })
  assert.equal(refused.action, 'fail')
})

test('a transient failure near the end of the budget does not start another request', () => {
  const progressed = moshtixRetryDecision({
    failures: 1,
    pageSize: MOSHTIX_PAGE_SIZE,
    page: 0,
    saved: 294,
    progressed: true,
    transient: true,
    nearBudget: true,
    remainingMs: 4_000,
  })
  assert.equal(progressed.action, 'pause')
  const empty = moshtixRetryDecision({
    failures: 1,
    pageSize: MOSHTIX_PAGE_SIZE,
    page: 0,
    saved: 0,
    progressed: false,
    transient: true,
    nearBudget: false,
    remainingMs: 10_000,
  })
  assert.equal(empty.action, 'fail')
})

test('a pause is not a hard Moshtix failure', () => {
  const message = `Moshtix: ${moshtixPauseMessage(796, '504')}`
  assert.equal(isMoshtixPause(message), true)
  assert.equal(isMoshtixPause('Moshtix: Moshtix API 504'), false)
  assert.equal(isMoshtixPause('Moshtix: Moshtix API 400'), false)
  assert.equal(isMoshtixPause('Moshtix: time budget reached after saving 10 events'), false)
  const src = readFileSync(new URL('./sources/ticketing.ts', import.meta.url), 'utf8')
  assert.match(src, /moshtixRetryDecision/)
  assert.match(src, /moshtixPauseMessage/)
  assert.match(src, /pageSize: \$\{pageSize\}/)
  assert.doesNotMatch(src, /pageSize: 200/)
  assert.match(src, /more: !done/)
  assert.match(src, /attachSweepProgress/)
  assert.match(src, /moshtixSweepPlan/)
  assert.match(src, /moshtixCatalogueExhausted/)
})

test('a short page is the end of the catalogue only when totalCount is covered', () => {
  assert.equal(moshtixCatalogueExhausted({ itemCount: 0, pageSize: 50, page: 0, totalCount: 0 }), true)
  assert.equal(moshtixCatalogueExhausted({ itemCount: 0, pageSize: 50, page: 0, totalCount: 916 }), false)
  assert.equal(moshtixCatalogueExhausted({ itemCount: 30, pageSize: 50, page: 0, totalCount: 916 }), false)
  assert.equal(moshtixCatalogueExhausted({ itemCount: 3, pageSize: 50, page: 0, totalCount: 3 }), true)
  assert.equal(moshtixCatalogueExhausted({ itemCount: 50, pageSize: 50, page: 0, totalCount: 2159 }), false)
  assert.equal(moshtixCatalogueExhausted({ itemCount: 16, pageSize: 50, page: 1, totalCount: 66 }), true)
})

test('a finished sweep ignores a stale cursor and starts again from the lookback floor', () => {
  const now = Date.parse('2026-11-11T05:10:50.246Z')
  const stale = Date.parse('2026-11-12T11:30:00.000Z')
  assert.equal(moshtixPreviousSweepOpen({ more: false, unmarked: false }), false)
  assert.equal(moshtixPreviousSweepOpen({ more: true, unmarked: false }), true)
  assert.equal(moshtixPreviousSweepOpen({ more: false, unmarked: true, partial: true }), true)
  assert.equal(moshtixPreviousSweepOpen(null), false)

  const fresh = moshtixSweepPlan({
    now,
    storedFromMs: stale,
    storedPage: 2,
    storedPageSize: MOSHTIX_PAGE_SIZE,
    storedSweepId: 'oldsweep',
    previousOpen: false,
    nextSweepId: 'fresh1',
  })
  assert.equal(fresh.continuation, false)
  assert.equal(fresh.sweepId, 'fresh1')
  assert.deepEqual(fresh.cursor, { fromMs: now - MOSHTIX_LOOKBACK_MS, page: 0 })

  const resume = moshtixSweepPlan({
    now,
    storedFromMs: stale,
    storedPage: 0,
    storedPageSize: MOSHTIX_PAGE_SIZE,
    storedSweepId: 'Same1',
    previousOpen: true,
  })
  assert.equal(resume.continuation, true)
  assert.equal(resume.sweepId, 'same1')
  assert.deepEqual(resume.cursor, { fromMs: stale, page: 0 })
})
