import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_TRIAL_DAYS,
  GENERIC_RESET_MESSAGE,
  RESET_TTL_MS,
  VERIFY_TTL_MS,
  accountIsVerified,
  expiresAt,
  hashAuthToken,
  tooManyTokens,
  trialAccess,
  trialConsentCopy,
  trialEligible,
  trialPeriodDays,
  trialReminderDue,
} from './account-trust'

test('reset links last about an hour and verification links last about a day', () => {
  const now = Date.parse('2026-11-04T00:00:00.000Z')
  assert.equal(expiresAt('PASSWORD_RESET', now).getTime() - now, RESET_TTL_MS)
  assert.equal(expiresAt('EMAIL_VERIFY', now).getTime() - now, VERIFY_TTL_MS)
  assert.equal(RESET_TTL_MS, 60 * 60 * 1000)
  assert.equal(VERIFY_TTL_MS, 24 * 60 * 60 * 1000)
})

test('tokens are stored as a hash, not the raw link secret', () => {
  const hash = hashAuthToken('raw-secret', 'pepper')
  assert.notEqual(hash, 'raw-secret')
  assert.equal(hash, hashAuthToken('raw-secret', 'pepper'))
  assert.notEqual(hash, hashAuthToken('raw-secret', 'other'))
})

test('reset and verification sends are capped at three an hour', () => {
  assert.equal(tooManyTokens(2, 'PASSWORD_RESET'), false)
  assert.equal(tooManyTokens(3, 'PASSWORD_RESET'), true)
  assert.equal(tooManyTokens(3, 'EMAIL_VERIFY'), true)
})

test('the reset response does not say whether the account exists', () => {
  assert.equal(GENERIC_RESET_MESSAGE.includes('@'), false)
  assert.match(GENERIC_RESET_MESSAGE, /If an account exists/)
})

test('the free month defaults to 30 days and can be overridden', () => {
  assert.equal(DEFAULT_TRIAL_DAYS, 30)
  assert.equal(trialPeriodDays({}), 30)
  assert.equal(trialPeriodDays({ TRIAL_PERIOD_DAYS: '30' }), 30)
  assert.equal(trialPeriodDays({ TRIAL_PERIOD_DAYS: '45' }), 45)
  assert.equal(trialPeriodDays({ TRIAL_PERIOD_DAYS: '14' }), 14)
  assert.equal(trialPeriodDays({ TRIAL_PERIOD_DAYS: '0' }), 30)
  assert.equal(trialPeriodDays({ TRIAL_PERIOD_DAYS: 'nope' }), 30)
})

test('a trial is once per account and never starts just because Stripe is missing', () => {
  assert.equal(trialEligible(null), true)
  assert.equal(trialEligible(new Date()), false)
  const future = new Date(Date.now() + 86400000)
  const past = new Date(Date.now() - 1000)
  assert.equal(trialAccess({ stripeConfigured: false, status: 'TRIALING', periodEnd: future }), false)
  assert.equal(trialAccess({ stripeConfigured: true, status: 'TRIALING', periodEnd: future }), true)
  assert.equal(trialAccess({ stripeConfigured: true, status: 'TRIALING', periodEnd: past }), false)
  assert.equal(trialAccess({ stripeConfigured: true, status: 'CANCELLED', periodEnd: future }), false)
  assert.equal(trialAccess({ stripeConfigured: true, status: 'ACTIVE', periodEnd: future }), true)
})

test('the reminder is only in the last three days of a live trial', () => {
  const now = new Date('2026-11-04T00:00:00.000Z')
  assert.equal(trialReminderDue(new Date('2026-11-06T00:00:00.000Z'), now), true)
  assert.equal(trialReminderDue(new Date('2026-12-04T00:00:00.000Z'), now), false)
  assert.equal(trialReminderDue(new Date('2026-11-03T00:00:00.000Z'), now), false)
})

test('consent copy names a free month and a shorter override', () => {
  assert.match(trialConsentCopy(30, true), /30 days are free/)
  assert.match(trialConsentCopy(30, true), /will not be charged/)
  assert.match(trialConsentCopy(30, false), /already used its free month/)
})

test('a timestamp means the account email is verified', () => {
  assert.equal(accountIsVerified(null), false)
  assert.equal(accountIsVerified(new Date('2026-11-04T00:00:00.000Z')), true)
})
