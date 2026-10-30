import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  INDEX_MAX_PARENT_OVERLAP, INDEX_MIN_FRESH, INDEX_MIN_LISTINGS,
  assessIndexability, blocksAsNearDuplicate,
} from './indexability'

test('quantity, freshness and distinct content share one threshold', () => {
  assert.equal(INDEX_MIN_LISTINGS, 5)
  assert.equal(INDEX_MIN_FRESH, 2)
  assert.equal(blocksAsNearDuplicate(6, 7), true)
  assert.equal(blocksAsNearDuplicate(5, 6), false)
  assert.ok(6 / 7 >= INDEX_MAX_PARENT_OVERLAP)
  assert.ok(5 / 6 < INDEX_MAX_PARENT_OVERLAP)

  assert.deepEqual(assessIndexability({ total: 0 }), { index: false, reason: 'empty' })
  assert.deepEqual(assessIndexability({ total: 4, mode: 'seasonal' }), { index: false, reason: 'thin' })
  assert.deepEqual(
    assessIndexability({ total: 6, fresh: 1, requireFresh: true, mode: 'combo' }),
    { index: false, reason: 'stale' },
  )
  assert.deepEqual(
    assessIndexability({ total: 6, fresh: 2, requireFresh: true }),
    { index: true, reason: 'index' },
  )
  assert.deepEqual(
    assessIndexability({ total: 6, parentOverlap: 6 / 7, mode: 'editorial' }),
    { index: false, reason: 'near-duplicate' },
  )
  assert.deepEqual(
    assessIndexability({ total: 6, parentOverlap: 5 / 6, mode: 'seasonal' }),
    { index: true, reason: 'index' },
  )
  assert.deepEqual(
    assessIndexability({ total: 3, fresh: 0, requireFresh: true, parentOverlap: 1 }),
    { index: false, reason: 'thin' },
  )
})
