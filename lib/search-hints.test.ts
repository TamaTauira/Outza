import assert from 'node:assert/strict'
import { test } from 'node:test'
import { interpretQuery } from './ai-search-parse'
import { priceWhere, shouldFilterCategory } from './ai-search-query'
import { applyHints, chipQuery, hintsToQuery, isNaturalAsk, EMPTY_HINTS } from './search-hints'

const today = '2026-11-25'

test('a plan and a sentence go to Ask, a keyword stays a search', () => {
  assert.equal(isNaturalAsk('plan my Saturday'), true)
  assert.equal(isNaturalAsk('live music this weekend'), true)
  assert.equal(isNaturalAsk('jazz'), false)
  assert.equal(isNaturalAsk(''), false)
})

test('hero picks become query params and an empty query is left off', () => {
  const params = hintsToQuery({ when: 'weekend', budget: 'free', category: 'Music', area: 'Newtown' }, { city: 'Sydney' })
  assert.equal(params.get('q'), null)
  assert.equal(params.get('when'), 'weekend')
  assert.equal(params.get('budget'), 'free')
  assert.equal(params.get('vibe'), 'Music')
  assert.equal(params.get('suburb'), 'Newtown')
  assert.equal(params.get('city'), 'Sydney')
})

test('budget-only filters are in the SQL where, not a second pass over the first page', () => {
  const free = priceWhere({ isFree: true, maxPrice: null })
  assert.ok(free)
  assert.equal(JSON.stringify(free).includes('contains'), false)
  const cheap = priceWhere(applyHints(interpretQuery('', today), { ...EMPTY_HINTS, budget: '30' }, today))
  assert.equal(cheap && 'OR' in cheap, true)
  const weekendFree = applyHints(interpretQuery('', today), { ...EMPTY_HINTS, when: 'weekend', budget: 'free' }, today)
  assert.equal(weekendFree.isFree, true)
  assert.equal(weekendFree.dateFrom, '2026-11-28')
  assert.equal(weekendFree.dateTo, '2026-11-29')
})

test('Live music is a Music category query, not a stripped keyword', () => {
  const chip = chipQuery('Live music')
  assert.equal(chip?.hints.category, 'Music')
  assert.equal(chip?.q, '')
  const filters = applyHints(interpretQuery('', today), { ...EMPTY_HINTS, category: 'Music' }, today)
  assert.equal(shouldFilterCategory(filters, ''), true)
  assert.equal(filters.category, 'Music')
})

test('the same words set the same category whether they start in Ask or on /search', () => {
  const parsed = interpretQuery('live music this weekend', today)
  assert.equal(parsed.category, 'Music')
  assert.equal(shouldFilterCategory(parsed, 'live music this weekend'), true)
})
