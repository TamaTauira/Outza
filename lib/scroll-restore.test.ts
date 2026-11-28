import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boardPagesToLoad, boardTopUpTarget, BOARD_FULL_LOAD_PAGE_CAP, isListPage, listDepthToLoad, shouldFinishRestore, SCROLL_MIN_MS, SCROLL_REACHED_MS, SCROLL_STABLE_MS, SCROLL_TIMEOUT_MS } from './scroll-restore'

const ready = {
  target: 1800,
  maxScroll: 2400,
  sinceHeightChange: SCROLL_STABLE_MS,
  sinceReached: SCROLL_REACHED_MS,
  holds: 0,
  elapsed: SCROLL_MIN_MS,
  fontsReady: true,
}

test('a short loading list does not count as restored', () => {
  assert.equal(shouldFinishRestore({ ...ready, maxScroll: 400 }), 'wait')
})

test('an open hold, unread fonts, or the first paint keeps waiting', () => {
  assert.equal(shouldFinishRestore({ ...ready, holds: 1 }), 'wait')
  assert.equal(shouldFinishRestore({ ...ready, fontsReady: false }), 'wait')
  assert.equal(shouldFinishRestore({ ...ready, elapsed: SCROLL_MIN_MS - 1 }), 'wait')
})

test('a tall, quiet page finishes and a long wait gives up without pretending it arrived', () => {
  assert.equal(shouldFinishRestore(ready), 'done')
  assert.equal(shouldFinishRestore({ ...ready, maxScroll: 400, elapsed: SCROLL_TIMEOUT_MS }), 'timeout')
})

test('paged lists reload the pages that were open, and stop at the last page', () => {
  assert.equal(listDepthToLoad(3, 5), 3)
  assert.equal(listDepthToLoad(9, 2), 2)
  assert.equal(listDepthToLoad(null, 4), 1)
  assert.equal(listDepthToLoad(40, 40), 8)
})

test('a windowed single-day board loads every page, so a time window counts its whole set', () => {
  // The landing 'now' window and the Today preset read the same day; with
  // only page 1 held, the windowed count understated it (297 vs 416).
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 2, spanning: false, windowed: true }), 2)
  assert.equal(boardPagesToLoad({ saved: null, totalPages: 3, spanning: false, windowed: true }), 3)
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 1, spanning: false, windowed: true }), 1)
})

test('the windowed full load stops at the page ceiling', () => {
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 40, spanning: false, windowed: true }), BOARD_FULL_LOAD_PAGE_CAP)
  assert.equal(boardPagesToLoad({ saved: null, totalPages: 0, spanning: false, windowed: true }), 1)
})

test('an unwindowed single-day board keeps the restoration depth and pages on demand', () => {
  // The 'all' board states a server-derived count, so loading every page
  // up front would buy nothing.
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 4, spanning: false, windowed: false }), 1)
  assert.equal(boardPagesToLoad({ saved: 3, totalPages: 5, spanning: false, windowed: false }), 3)
  assert.equal(boardPagesToLoad({ saved: 40, totalPages: 40, spanning: false, windowed: false }), 8)
})

test('spanning spans keep the restoration depth', () => {
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 4, spanning: true, windowed: true }), 1)
  assert.equal(boardPagesToLoad({ saved: 3, totalPages: 5, spanning: true, windowed: false }), 3)
  assert.equal(boardPagesToLoad({ saved: null, totalPages: 0, spanning: false, windowed: false }), 1)
})

test('a preview is not a load exemption: the decision takes no preview input', () => {
  // The homepage's collapsed board (previewLimit set) publishes the same
  // windowed count line as the open board. While the load decision
  // treated a preview as a slice, the landing headline settled on page
  // 1's partial sum (296) against the open board's full-set count (373).
  // previewLimit caps the rows rendered, never the pages loaded, so the
  // calls EventList makes are identical whether the board is collapsed
  // or open — the windowed cases above are the collapsed board's too.
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 4, spanning: false, windowed: true }), 4)
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 4, spanning: false, windowed: false }), 1)
})

test('a board that turns windowed after an unwindowed load owes the rest of its pages', () => {
  // Today (pinned 'all') depth-loads page 1 of a big day; Tonight
  // (pinned 'evening') reads the same query as windowed without
  // re-running the load, so the top-up target is the whole set.
  assert.equal(boardTopUpTarget({ heldPages: 1, totalPages: 2, spanning: false, windowed: true }), 2)
  assert.equal(boardTopUpTarget({ heldPages: 3, totalPages: 5, spanning: false, windowed: true }), 5)
  // The first load's ceiling bounds the top-up too.
  assert.equal(boardTopUpTarget({ heldPages: 1, totalPages: 40, spanning: false, windowed: true }), BOARD_FULL_LOAD_PAGE_CAP)
})

test('a settled board owes nothing: the target never passes the held depth for unwindowed or spanning boards', () => {
  assert.equal(boardTopUpTarget({ heldPages: 1, totalPages: 4, spanning: false, windowed: false }), 1)
  assert.equal(boardTopUpTarget({ heldPages: 3, totalPages: 5, spanning: false, windowed: false }), 3)
  assert.equal(boardTopUpTarget({ heldPages: 1, totalPages: 4, spanning: true, windowed: true }), 1)
  // And a windowed board that reached its target reads it back, so a
  // completed top-up cannot re-fire.
  assert.equal(boardTopUpTarget({ heldPages: 2, totalPages: 2, spanning: false, windowed: true }), 2)
  assert.equal(boardTopUpTarget({ heldPages: BOARD_FULL_LOAD_PAGE_CAP, totalPages: 40, spanning: false, windowed: true }), BOARD_FULL_LOAD_PAGE_CAP)
})

test('board, local, saved, itinerary and city landings are lists; an event page is not', () => {
  assert.equal(isListPage('/'), true)
  assert.equal(isListPage('/?city=Sydney'), true)
  assert.equal(isListPage('/saved'), true)
  assert.equal(isListPage('/local'), true)
  assert.equal(isListPage('/local?tab=browse'), true)
  assert.equal(isListPage('/itinerary'), true)
  assert.equal(isListPage('/sydney/events'), true)
  assert.equal(isListPage('/melbourne/tonight'), true)
  assert.equal(isListPage('/guides/live-music'), true)
  assert.equal(isListPage('/events/jazz-night-abc'), false)
  assert.equal(isListPage('/login'), false)
  assert.equal(isListPage('/venues/abc'), false)
})
