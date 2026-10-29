import assert from 'node:assert/strict'
import { test } from 'node:test'
import { savedStorageKey, savesToUpload, visibleSavedCount } from './saved-scope'

test('saved favourites are empty when signed out and are not shared between accounts', () => {
  assert.equal(savedStorageKey(null), null)
  assert.equal(savedStorageKey(undefined), null)
  assert.equal(visibleSavedCount(false, 307), 0)
  assert.equal(visibleSavedCount(true, 0), 0)
  assert.equal(visibleSavedCount(true, 4), 4)

  const a = savedStorageKey('user-a')
  const b = savedStorageKey('user-b')
  assert.ok(a && b)
  assert.notEqual(a, b)
  assert.equal(a?.includes('user-a'), true)
  assert.equal(a?.startsWith('sydney-events-saved-v1:user:'), true)

  assert.deepEqual(savesToUpload(null, ['evt-from-someone-else']), [])
  assert.deepEqual(savesToUpload('user-b', []), [])
  assert.deepEqual(savesToUpload('user-b', ['evt-1', 'evt-1', 'evt-2']), ['evt-1', 'evt-2'])
})
