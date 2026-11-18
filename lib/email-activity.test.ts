import assert from 'node:assert/strict'
import test from 'node:test'
import { emailActivityAllowed, emailActivityDefault } from './email-activity'
import { plainEmailUrl } from './newsletter/links'

test('Australia defaults email activity on; EU, UK and unknown default off', () => {
  assert.equal(emailActivityDefault('AU'), true)
  assert.equal(emailActivityDefault('au'), true)
  assert.equal(emailActivityDefault('DE'), false)
  assert.equal(emailActivityDefault('GB'), false)
  assert.equal(emailActivityDefault('UK'), false)
  assert.equal(emailActivityDefault('NO'), false)
  assert.equal(emailActivityDefault('US'), false)
  assert.equal(emailActivityDefault(null), false)
  assert.equal(emailActivityDefault(''), false)
  assert.equal(emailActivityAllowed(true), true)
  assert.equal(emailActivityAllowed(false), false)
  assert.equal(emailActivityAllowed(undefined), false)
})

test('opted-out email links skip the click logger and can still carry campaign tags', () => {
  const ctx = { sendId: 'send1', edition: 'weekly', issueDate: '2026-11-18', city: 'Sydney' }
  const plain = plainEmailUrl(ctx, 'hero', 'detail', 'evt1')
  assert.equal(plain.includes('/api/nl/c'), false)
  assert.match(plain, /\/events\/evt1/)
  assert.match(plain, /utm_medium=email/)
})
