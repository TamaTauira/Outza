import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boardCountGate, boardDataIsStale, boardLoadIsWindowed, boardQueryKey, boardWindowSuffix } from './board-query'
import { boardPagesToLoad } from './scroll-restore'

// The board holds rows and a total loaded for one query (span, city,
// search, filters) while the selection can move to another. Held data
// may only be presented under the query that loaded it; while the two
// differ, the surface shows its loading state instead of the old
// query's count (transition flicker on span switches, e.g. Today ->
// This weekend publishing the old day's total with no date suffix).

const today = { from: '2026-11-28', to: '2026-11-28', city: 'Sydney' }
const weekend = { from: '2026-11-28', to: '2026-11-29', city: 'Sydney' }

test('the same query parts produce the same key', () => {
  assert.equal(boardQueryKey(today), boardQueryKey({ ...today }))
  assert.equal(
    boardQueryKey({ ...today, categories: ['Music', 'Food & Drink'], isFree: true }),
    boardQueryKey({ ...today, categories: ['Music', 'Food & Drink'], isFree: true }),
  )
})

test('a span change changes the key', () => {
  assert.notEqual(boardQueryKey(today), boardQueryKey(weekend))
  assert.notEqual(boardQueryKey(weekend), boardQueryKey({ from: '2026-11-30', to: '2026-12-06', city: 'Sydney' }))
})

test('every other fetch input changes the key', () => {
  const base = boardQueryKey(today)
  assert.notEqual(boardQueryKey({ ...today, city: 'Melbourne' }), base)
  assert.notEqual(boardQueryKey({ ...today, city: '' }), base)
  assert.notEqual(boardQueryKey({ ...today, search: 'jazz' }), base)
  assert.notEqual(boardQueryKey({ ...today, categories: ['Music'] }), base)
  assert.notEqual(boardQueryKey({ ...today, subTag: 'Markets' }), base)
  assert.notEqual(boardQueryKey({ ...today, suburb: 'Newtown' }), base)
  assert.notEqual(boardQueryKey({ ...today, isFree: true }), base)
  assert.notEqual(boardQueryKey({ ...today, isLGBTI: true }), base)
})

test('category order does not change the key', () => {
  assert.equal(
    boardQueryKey({ ...today, categories: ['Music', 'Food & Drink'] }),
    boardQueryKey({ ...today, categories: ['Food & Drink', 'Music'] }),
  )
})

test('held data is stale when it was loaded under a different key', () => {
  assert.equal(boardDataIsStale(boardQueryKey(today), boardQueryKey(weekend), 417), true)
  assert.equal(boardDataIsStale(null, boardQueryKey(weekend), 417), true)
})

test('held data is not stale under the key it was loaded under', () => {
  assert.equal(boardDataIsStale(boardQueryKey(weekend), boardQueryKey(weekend), 701), false)
})

test('an empty hand is never stale', () => {
  assert.equal(boardDataIsStale(boardQueryKey(today), boardQueryKey(weekend), 0), false)
  assert.equal(boardDataIsStale(null, boardQueryKey(weekend), 0), false)
})

// The count gate: a windowed headline is a sum over the rows the list
// holds, so it may only be published once the first load has fetched
// every page of the span — before that it would be a partial sum that
// grows as appends land. A load stopped by the page ceiling can never
// complete, so its headline falls back to the server's full-set numbers
// instead of ever publishing the partial sum.

test('an unwindowed count is always ready to publish', () => {
  assert.equal(boardCountGate({ windowed: false, heldPages: 1, totalPages: 4, capped: false }), 'ready')
  assert.equal(boardCountGate({ windowed: false, heldPages: 1, totalPages: 4, capped: true }), 'ready')
})

test('a windowed count is gated until every page of the span is held', () => {
  assert.equal(boardCountGate({ windowed: true, heldPages: 1, totalPages: 2, capped: false }), 'gated')
  assert.equal(boardCountGate({ windowed: true, heldPages: 2, totalPages: 2, capped: false }), 'ready')
  assert.equal(boardCountGate({ windowed: true, heldPages: 3, totalPages: 2, capped: false }), 'ready')
  assert.equal(boardCountGate({ windowed: true, heldPages: 1, totalPages: 1, capped: false }), 'ready')
})

test('a capped windowed load falls back instead of publishing a partial count', () => {
  assert.equal(boardCountGate({ windowed: true, heldPages: 8, totalPages: 12, capped: true }), 'fallback')
  // Paging on to the last page completes the set, and the windowed
  // count takes over from the fallback.
  assert.equal(boardCountGate({ windowed: true, heldPages: 12, totalPages: 12, capped: true }), 'ready')
})

// The shared windowed decision: the first load and the count gate
// both take `windowed` from boardLoadIsWindowed, so a board the gate
// holds is always one whose load was commanded to fetch the whole
// set. A pinned board's effective window is its requested window.
// An unpinned board's effective window is chosen by a fallback chain
// once rows land and can be promoted to 'evening' over an 'all'
// request — the case that stranded the headline on "…": the load
// had read the request alone and fetched only the restoration
// depth, the gate read the promoted window and held, and no load
// was left to release it.

test("a pinned 'all' board is unwindowed and loads at restoration depth", () => {
  // Safe because a pinned board's effective window is its requested
  // one: the count is the server's full-set total from page 1.
  assert.equal(boardLoadIsWindowed({ requestedWindow: 'all', windowPinned: true }), false)
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 4, spanning: false, windowed: boardLoadIsWindowed({ requestedWindow: 'all', windowPinned: true }) }), 1)
})

test("an unpinned 'all' board loads as windowed, so the gate always has a load that can lift it", () => {
  assert.equal(boardLoadIsWindowed({ requestedWindow: 'all', windowPinned: false }), true)
  // The pin is optional and absent means unpinned, as in EventList.
  assert.equal(boardLoadIsWindowed({ requestedWindow: 'all' }), true)
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 4, spanning: false, windowed: boardLoadIsWindowed({ requestedWindow: 'all', windowPinned: false }) }), 4)
})

test('a windowed request loads as windowed, pinned or not', () => {
  for (const requestedWindow of ['now', 'hour', 'evening'] as const) {
    assert.equal(boardLoadIsWindowed({ requestedWindow, windowPinned: true }), true)
    assert.equal(boardLoadIsWindowed({ requestedWindow, windowPinned: false }), true)
  }
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 4, spanning: false, windowed: boardLoadIsWindowed({ requestedWindow: 'now', windowPinned: true }) }), 4)
})

// The summary line's window label: the landing window ('now') states
// "from now" — its own label, per the owner's 2026-11-28 decision —
// not the evening window's "tonight". 'hour' and 'all' add no words.

test("the landing 'now' window is labelled 'from now', not 'tonight'", () => {
  assert.equal(boardWindowSuffix('now'), ' from now')
})

test("the evening window keeps 'tonight', and 'hour'/'all' add no time words", () => {
  assert.equal(boardWindowSuffix('evening'), ' tonight')
  assert.equal(boardWindowSuffix('hour'), '')
  assert.equal(boardWindowSuffix('all'), '')
})
