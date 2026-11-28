import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boardPagesToLoad, BOARD_FULL_LOAD_PAGE_CAP, isListPage, listDepthToLoad, shouldFinishRestore, SCROLL_MIN_MS, SCROLL_REACHED_MS, SCROLL_STABLE_MS, SCROLL_TIMEOUT_MS } from './scroll-restore'

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
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 2, spanning: false, preview: false, windowed: true }), 2)
  assert.equal(boardPagesToLoad({ saved: null, totalPages: 3, spanning: false, preview: false, windowed: true }), 3)
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 1, spanning: false, preview: false, windowed: true }), 1)
})

test('the windowed full load stops at the page ceiling', () => {
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 40, spanning: false, preview: false, windowed: true }), BOARD_FULL_LOAD_PAGE_CAP)
  assert.equal(boardPagesToLoad({ saved: null, totalPages: 0, spanning: false, preview: false, windowed: true }), 1)
})

test('an unwindowed single-day board keeps the restoration depth and pages on demand', () => {
  // The 'all' board states a server-derived count, so loading every page
  // up front would buy nothing.
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 4, spanning: false, preview: false, windowed: false }), 1)
  assert.equal(boardPagesToLoad({ saved: 3, totalPages: 5, spanning: false, preview: false, windowed: false }), 3)
  assert.equal(boardPagesToLoad({ saved: 40, totalPages: 40, spanning: false, preview: false, windowed: false }), 8)
})

test('spanning spans and previews keep the restoration depth', () => {
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 4, spanning: true, preview: false, windowed: true }), 1)
  assert.equal(boardPagesToLoad({ saved: 3, totalPages: 5, spanning: true, preview: false, windowed: false }), 3)
  assert.equal(boardPagesToLoad({ saved: 1, totalPages: 4, spanning: false, preview: true, windowed: true }), 1)
  assert.equal(boardPagesToLoad({ saved: null, totalPages: 0, spanning: false, preview: false, windowed: false }), 1)
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
