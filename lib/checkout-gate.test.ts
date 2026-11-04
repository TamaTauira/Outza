import assert from 'node:assert/strict'
import { test } from 'node:test'
import { unpaidTestCheckoutAllowed } from './checkout-gate'

test('a missing Stripe key does not activate a placement unless the sandbox flag is on', () => {
  assert.equal(unpaidTestCheckoutAllowed({}), false)
  assert.equal(unpaidTestCheckoutAllowed({ STRIPE_SECRET_KEY: '  ' }), false)
  assert.equal(unpaidTestCheckoutAllowed({ ALLOW_TEST_CHECKOUT: '1' }), true)
  assert.equal(unpaidTestCheckoutAllowed({ STRIPE_SECRET_KEY: 'sk_test_example', ALLOW_TEST_CHECKOUT: '1' }), false)
})
