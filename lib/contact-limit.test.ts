import assert from 'node:assert/strict'
import test from 'node:test'
import { contactAddressDecision, resetContactIpLimits, takeIpSlot, turnstileConfigured } from './contact-limit'

test('an address can send three notes an hour and one acknowledgement a day', () => {
  assert.deepEqual(contactAddressDecision({ inLastHour: 0, inLastDay: 0 }), { allow: true, sendAck: true })
  assert.deepEqual(contactAddressDecision({ inLastHour: 1, inLastDay: 1 }), { allow: true, sendAck: false })
  assert.deepEqual(contactAddressDecision({ inLastHour: 3, inLastDay: 3 }), { allow: false, sendAck: false })
})

test('one IP is capped at three accepts an hour', () => {
  resetContactIpLimits()
  assert.equal(takeIpSlot('203.0.113.8', 1_000), true)
  assert.equal(takeIpSlot('203.0.113.8', 2_000), true)
  assert.equal(takeIpSlot('203.0.113.8', 3_000), true)
  assert.equal(takeIpSlot('203.0.113.8', 4_000), false)
  assert.equal(takeIpSlot('203.0.113.9', 4_000), true)
})

test('Turnstile is on only when both keys are set', () => {
  assert.equal(turnstileConfigured({}), false)
  assert.equal(turnstileConfigured({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site' }), false)
  assert.equal(turnstileConfigured({ TURNSTILE_SECRET_KEY: 'secret' }), false)
  assert.equal(turnstileConfigured({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' }), true)
})
