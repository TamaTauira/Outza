import assert from 'node:assert/strict'
import { test } from 'node:test'
import { auToIso, isoToAu } from './au-date'

test('Australian dates parse to ISO and display as dd/mm/yyyy', () => {
  assert.equal(auToIso('19/11/2026'), '2026-11-19')
  assert.equal(auToIso('1/2/2026'), '2026-02-01')
  assert.equal(auToIso('2026-11-19'), '2026-11-19')
  assert.equal(isoToAu('2026-11-19'), '19/11/2026')
  assert.equal(isoToAu('2026-11-19T00:00:00.000Z'), '19/11/2026')
  assert.equal(auToIso('31/02/2026'), null)
  assert.equal(auToIso('19-11-2026'), null)
  assert.equal(auToIso(''), null)
  assert.equal(isoToAu('not-a-date'), '')
})
