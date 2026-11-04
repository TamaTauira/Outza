import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeNextPath } from './safe-next'

test('safeNextPath keeps in-app paths and drops off-site targets', () => {
  assert.equal(safeNextPath('/promoter', '/'), '/promoter')
  assert.equal(safeNextPath('/local?tab=submit', '/'), '/local?tab=submit')
  assert.equal(safeNextPath('https://evil.example/phish', '/account'), '/account')
  assert.equal(safeNextPath('//evil.example', '/'), '/')
  assert.equal(safeNextPath('/\\evil.example', '/'), '/')
  assert.equal(safeNextPath('javascript:alert(1)', '/'), '/')
  assert.equal(safeNextPath(null, '/account'), '/account')
  assert.equal(safeNextPath('  /saved  ', '/'), '/saved')
})
