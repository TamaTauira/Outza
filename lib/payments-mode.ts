/**
 * One payments state.
 * Stripe is deferred: no secret key means test mode. One-off campaigns, Promoter Pro
 * and local recommendations activate without a charge and are stored as test invoices.
 * Monthly plans and short boosts need a card, so they stay quote-only until a key exists.
 */
export type PaymentsMode = 'live' | 'test'

export function paymentsMode(env: Record<string, string | undefined> = process.env): PaymentsMode {
  return env.STRIPE_SECRET_KEY?.trim() ? 'live' : 'test'
}

export function cardPaymentsLive(env: Record<string, string | undefined> = process.env): boolean {
  return paymentsMode(env) === 'live'
}

/** Unpaid activation. True in test mode, never when a Stripe key is set. */
export function unpaidTestCheckoutAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return paymentsMode(env) === 'test'
}

export const PAYMENTS_COPY = {
  testBanner:
    'Test mode: Boost, Spotlight, Headliner, Promoter Pro and local recommendations activate straight away. No card is charged, and the invoice is marked test. They show in your dashboard. Monthly plans and short boosts need card payments, which are not switched on yet.',
  plansOffTitle: 'Monthly plans need card payments',
  plansOffBody: 'Card payments are not switched on, so a plan can’t be started here. Request a quote. Nothing is charged.',
  boostsOffTitle: 'Short boosts need card payments',
  boostsOffBody: 'Card payments are not switched on. A quote does not charge a card and does not put the boost live.',
  campaignActivated: 'Campaign is on (test mode — no card charged). The invoice is marked test.',
  proActivated: 'Promoter Pro is on (test mode — no card charged). The invoice is marked test.',
  localActivated: 'Your recommendation is on (test mode — no card charged). The invoice is marked test.',
} as const

export function campaignConfirmLabel(total: string, live: boolean): string {
  return live ? `Confirm ${total} and pay` : `Activate ${total} (test mode, no charge)`
}
