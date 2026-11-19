import assert from 'node:assert/strict'
import test from 'node:test'
import { relaxedSearchArgs, searchFeedArgs } from './search-feed'

const FRIDAY = '2026-10-30'

test('date night is an evening across a few categories, not a search for the word date', () => {
  const args = searchFeedArgs('Date night', 'Sydney', FRIDAY)
  assert.equal(args.search, '')
  assert.equal(args.timeFrom, '17:00')
  assert.ok(args.categories.includes('Food & Drink'))
  assert.ok(args.categories.includes('Music'))
  assert.equal(args.dateFrom, FRIDAY)
})

test('this weekend on a Friday runs through Sunday', () => {
  const args = searchFeedArgs('jazz this weekend', 'Sydney', FRIDAY)
  assert.equal(args.dateFrom, FRIDAY)
  assert.equal(args.dateTo, '2026-11-01')
  assert.equal(args.search, 'jazz')
})

test('a miss drops the evening cutoff before it drops the words', () => {
  const first = searchFeedArgs('free things tonight', 'Sydney', FRIDAY)
  const relaxed = relaxedSearchArgs(first)
  assert.equal(first.timeFrom, '17:00')
  assert.equal(first.isFree, true)
  assert.equal(relaxed?.args.timeFrom, '')
  assert.equal(relaxed?.args.isFree, true)
})
