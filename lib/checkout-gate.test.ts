import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cardPaymentsLive, paymentsMode, unpaidTestCheckoutAllowed } from './payments-mode'

test('no Stripe key is test mode, and a key is live checkout', () => {
  assert.equal(paymentsMode({}), 'test')
  assert.equal(cardPaymentsLive({}), false)
  assert.equal(unpaidTestCheckoutAllowed({}), true)
  assert.equal(unpaidTestCheckoutAllowed({ STRIPE_SECRET_KEY: '  ' }), true)
  assert.equal(unpaidTestCheckoutAllowed({ ALLOW_TEST_CHECKOUT: '0' }), true)
  assert.equal(paymentsMode({ STRIPE_SECRET_KEY: 'sk_test_example' }), 'live')
  assert.equal(unpaidTestCheckoutAllowed({ STRIPE_SECRET_KEY: 'sk_test_example', ALLOW_TEST_CHECKOUT: '1' }), false)
  assert.equal(cardPaymentsLive({ STRIPE_SECRET_KEY: 'sk_live_example' }), true)
})
