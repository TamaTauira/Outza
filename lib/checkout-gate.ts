/**
 * Unpaid activation is the old path for a machine with no Stripe key.
 * Production should not use it. Set ALLOW_TEST_CHECKOUT=1 only on a sandbox.
 */
export function unpaidTestCheckoutAllowed(env: {
  STRIPE_SECRET_KEY?: string
  ALLOW_TEST_CHECKOUT?: string
} = process.env): boolean {
  if (env.STRIPE_SECRET_KEY?.trim()) return false
  return env.ALLOW_TEST_CHECKOUT === '1'
}
