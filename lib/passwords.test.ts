import assert from 'node:assert/strict'
import { test } from 'node:test'
import { passwordError } from './passwords'

test('a dictionary password is rejected and a mixed one is kept', () => {
  assert.match(passwordError('password') ?? '', /common/)
  assert.match(passwordError('short1') ?? '', /8 characters/)
  assert.match(passwordError('longpassword') ?? '', /number/)
  assert.equal(passwordError('river-lamp-42'), null)
})
