import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ExtractError, isPrivateAddress, readPage } from './local-extract'

test('private and link-local addresses are blocked, public ones are not', () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true)
  assert.equal(isPrivateAddress('169.254.169.254'), true)
  assert.equal(isPrivateAddress('10.1.2.3'), true)
  assert.equal(isPrivateAddress('192.168.0.4'), true)
  assert.equal(isPrivateAddress('8.8.8.8'), false)
})

test('import refuses a loopback URL before fetching it', async () => {
  await assert.rejects(() => readPage('http://127.0.0.1/latest/meta-data'), ExtractError)
  await assert.rejects(() => readPage('http://169.254.169.254/'), ExtractError)
})
