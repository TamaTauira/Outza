import { NextResponse } from 'next/server'
import { BOOSTS, ORGANISER_PLANS } from '@/lib/sponsorship'
import { payments, planPriceId, prepareCatalog } from '@/lib/sponsorship-billing'

export const dynamic = 'force-dynamic'

/** Public prices and whether a card can actually be charged. */
export async function GET() {
  const ready = await prepareCatalog()
  const gate = payments()
  return NextResponse.json({
    ready,
    paymentsEnabled: gate.enabled,
    subscriptionsEnabled: gate.subscriptionsEnabled,
    boosts: Object.values(BOOSTS),
    plans: ORGANISER_PLANS.map((plan) => ({ ...plan, priceConfigured: !!planPriceId(plan.id) })),
  })
}
