import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isQaAccountEmail, liveSubscriberWhere } from './qa-account'

test('QA logins are recognised and real addresses are not', () => {
  assert.equal(isQaAccountEmail('outza-tester+qa-consumer-1@mail.grokbot.com'), true)
  assert.equal(isQaAccountEmail('  Outza-tester+qa-admin-1@mail.grokbot.com '), true)
  assert.equal(isQaAccountEmail('outza-tester+faults@mail.grokbot.com'), false)
  assert.equal(isQaAccountEmail('owner@outza.app'), false)
  assert.equal(isQaAccountEmail(''), false)
  assert.equal(isQaAccountEmail(null), false)
})

test('newsletter and reminder queries drop QA logins even when they opt in', () => {
  const where = liveSubscriberWhere()
  assert.equal(where.emailOptIn, true)
  assert.equal(where.NOT.AND[0].email.startsWith, 'outza-tester+qa-')
  assert.equal(where.NOT.AND[1].email.endsWith, '@mail.grokbot.com')
})
