import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boardDataIsStale, boardQueryKey } from './board-query'

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
