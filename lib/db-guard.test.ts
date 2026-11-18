import assert from 'node:assert/strict'
import test from 'node:test'
import { isDbSaturation } from './db-guard'

test('pool timeouts and cancelled statements count as saturation', () => {
  assert.equal(isDbSaturation(Object.assign(new Error('Timed out fetching a new connection from the connection pool'), { code: 'P2024' })), true)
  assert.equal(isDbSaturation(Object.assign(new Error('transaction'), { code: 'P2028' })), true)
  assert.equal(isDbSaturation(new Error('canceling statement due to statement timeout')), true)
  assert.equal(isDbSaturation(new Error('Unable to start a transaction in the given time')), true)
  assert.equal(isDbSaturation(new Error('Unique constraint failed')), false)
  assert.equal(isDbSaturation(null), false)
})
