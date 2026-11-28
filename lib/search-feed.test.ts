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

test('an inferred subTag never hard-gates /search', () => {
  // "jazz" parses to category Music with an inferred Jazz tag. Explore lists
  // Adelaide jazz whose stored tags lack exactly 'Jazz', so the tag guess
  // must not reach boardWhere as a filter — the word and category still do.
  const args = searchFeedArgs('jazz', 'Adelaide', FRIDAY)
  assert.equal(args.subTag, '')
  assert.deepEqual(args.categories, ['Music'])
  assert.equal(args.search, 'jazz')
  assert.equal(args.city, 'Adelaide')
})

test('the searched city is the one the words named, not the URL city', () => {
  // The /search count line prints args.city; a query naming Sydney while the
  // link says Brisbane must head its results with the city actually searched.
  const args = searchFeedArgs('comedy in Sydney', 'Brisbane', FRIDAY)
  assert.equal(args.city, 'Sydney')
})

test('a folded-in place becomes its area group on its board', () => {
  const newcastle = searchFeedArgs('indie gigs in Newcastle', 'Sydney', FRIDAY)
  assert.equal(newcastle.city, 'Sydney')
  assert.equal(newcastle.suburb, 'Newcastle & the Hunter')
  assert.equal(newcastle.search, 'indie gig')

  const wollongong = searchFeedArgs('markets in Wollongong', 'Sydney', FRIDAY)
  assert.equal(wollongong.city, 'Sydney')
  assert.equal(wollongong.suburb, 'Wollongong & the Illawarra')
  assert.equal(wollongong.search, 'market')

  // An ordinary suburb keeps its plain name.
  const bondi = searchFeedArgs('markets in Bondi', 'Sydney', FRIDAY)
  assert.equal(bondi.suburb, 'Bondi')
})
