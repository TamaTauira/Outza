import assert from 'node:assert/strict'
import test from 'node:test'
import { displayPriceValue, displayTitle, parentCategory, runsUntilLabel } from './display-public'

test('display titles drop shouty caps, emoji and a trailing date', () => {
  assert.equal(displayTitle('🎸 LIVE AT THE METRO — 12 Nov'), 'Live At The Metro')
  assert.equal(displayTitle('Jazz at the Basement'), 'Jazz at the Basement')
  assert.equal(displayTitle('Friday Jazz | Sydney Events Guide'), 'Friday Jazz')
  assert.equal(displayTitle('Bond shoot [Model pending]'), 'Bond shoot')
})

test('an unknown price points at the source, and a multi-day run names its last day', () => {
  assert.equal(displayPriceValue('Price TBA', 'unknown'), 'Tickets at source')
  assert.equal(displayPriceValue('Free', 'free'), 'Free')
  assert.equal(runsUntilLabel('2026-11-17', '2026-11-20'), 'Runs until 20 Nov')
  assert.equal(runsUntilLabel('2026-11-17', '2026-11-17'), null)
})

test('raw feed categories land on a parent', () => {
  assert.equal(parentCategory('Music'), 'Music')
  assert.equal(parentCategory('Stand-up comedy night'), 'Arts & Culture')
  assert.equal(parentCategory('Misc'), 'Community')
})
