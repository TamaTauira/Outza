import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isReferenceShowable, referenceProblems } from './reference-freshness'

const asOf = new Date('2026-11-03T00:00:00.000Z')
const sample = { lastVerified: '2026-11-03', sourceUrl: 'https://example.com/source' }

test('a check older than six months is stale, and an exact six-month check is still shown', () => {
  assert.deepEqual(referenceProblems({ ...sample, lastVerified: '2026-05-03' }, asOf), [])
  assert.deepEqual(referenceProblems({ ...sample, lastVerified: '2026-05-02' }, asOf), ['stale'])
  assert.equal(isReferenceShowable({ ...sample, lastVerified: '2026-05-02' }, asOf), false)
})

test('a missing source, a bad date, or a future date is hidden', () => {
  assert.deepEqual(referenceProblems({ ...sample, sourceUrl: '' }, asOf), ['unverified'])
  assert.ok(referenceProblems({ ...sample, lastVerified: '' }, asOf).includes('unverified'))
  assert.deepEqual(referenceProblems({ ...sample, lastVerified: '2026-11-04' }, asOf), ['unverified'])
})
