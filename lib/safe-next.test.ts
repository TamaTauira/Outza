import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestedNext, safeNextPath } from './safe-next'

test('safeNextPath keeps in-app paths and drops off-site targets', () => {
  assert.equal(safeNextPath('/promoter', '/'), '/promoter')
  assert.equal(safeNextPath('/local?tab=submit', '/'), '/local?tab=submit')
  assert.equal(safeNextPath('https://evil.example/phish', '/account'), '/account')
  assert.equal(safeNextPath('//evil.example', '/'), '/')
  assert.equal(safeNextPath('/\\evil.example', '/'), '/')
  assert.equal(safeNextPath('javascript:alert(1)', '/'), '/')
  assert.equal(safeNextPath(null, '/account'), '/account')
  assert.equal(safeNextPath('  /saved  ', '/'), '/saved')
  assert.equal(safeNextPath('/promoter?tab=billing', '/promoter'), '/promoter?tab=billing')
})

test('login accepts next and treats callbackUrl as the same return path', () => {
  assert.equal(requestedNext('/promoter?tab=events', '/account'), '/promoter?tab=events')
  assert.equal(requestedNext(null, '/promoter/invoice/abc'), '/promoter/invoice/abc')
  assert.equal(requestedNext('  ', ''), null)
})
