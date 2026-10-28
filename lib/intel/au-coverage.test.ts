import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAuAsgs } from './util'
import { promoterCanEditEvent } from '../quality'

test('ABS geography keeps every state, not only NSW', () => {
  assert.equal(isAuAsgs('GCCSA', '2GMEL'), true)
  assert.equal(isAuAsgs('GCCSA', '3GBRI'), true)
  assert.equal(isAuAsgs('GCCSA', '5GPER'), true)
  assert.equal(isAuAsgs('STE', '4'), true)
  assert.equal(isAuAsgs('SA2', '206011105'), true)
  assert.equal(isAuAsgs('AUS', 'AUS'), true)
  assert.equal(isAuAsgs('STE', '9'), false)
})

test('only promoter-created events are editable', () => {
  assert.equal(promoterCanEditEvent('promoter'), true)
  for (const source of ['ticketmaster', 'moshtix', 'oztix', 'eventbrite', 'humanitix', 'frontier', 'cityofsydney', 'ticketek', 'curated']) {
    assert.equal(promoterCanEditEvent(source), false)
  }
})
