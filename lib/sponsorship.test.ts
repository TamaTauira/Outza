import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BUSINESS_PLANS } from './tiers'
import {
  BOOSTS,
  campaignIsServing,
  expireReason,
  mixSponsored,
  monthlyRecurringRevenue,
  placementMargin,
  planBoost,
  planPricesMatchPublicCatalogue,
  refundEligible,
  repeatPurchase90d,
} from './sponsorship'

const now = new Date('2026-10-30T01:00:00.000Z')
const event = { city: 'Sydney', category: 'Music', date: new Date('2026-11-02T00:00:00.000Z') }

function boost(over: Record<string, unknown> = {}) {
  return planBoost(
    {
      inventoryId: 'EVENING',
      startsAt: '2026-10-30T08:00:00.000Z',
      endsAt: '2026-10-30T12:00:00.000Z',
      headline: 'Late set, early drinks',
      consent: true,
      ...over,
    },
    event,
    { now, pro: false, horizonDays: 14 },
  )
}

test('public plan prices match the chargeable catalogue', () => {
  assert.equal(planPricesMatchPublicCatalogue(), true)
  assert.equal(BUSINESS_PLANS.find((p) => p.key === 'LOCAL_PRO')?.monthlyCents, 3900)
})

test('a mixed rail keeps organic matches in front and caps sponsored density', () => {
  const organic: { id: string; kind: 'o' | 's' }[] = Array.from({ length: 16 }, (_, i) => ({ id: `o${i}`, kind: 'o' }))
  const sponsored: { id: string; kind: 'o' | 's' }[] = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, kind: 's' }))
  const mixed = mixSponsored(organic, sponsored)
  const paid = mixed.filter((row) => row.kind === 's')
  assert.ok(mixed.length > 0)
  assert.equal(mixed[0].kind, 'o')
  assert.ok(mixed.some((row) => row.kind === 'o'))
  assert.ok(paid.length < mixed.length)
  assert.ok(paid.length / mixed.length <= 1 / 3 + 1e-9)
  const organicIds = mixed.filter((row) => row.kind === 'o').map((row) => row.id)
  assert.deepEqual(organicIds, organicIds.slice().sort((a, b) => organic.findIndex((row) => row.id === a) - organic.findIndex((row) => row.id === b)))
  assert.deepEqual(organicIds, ['o0', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'])
})

test('one organic match is never replaced by a fully sponsored row', () => {
  const mixed = mixSponsored([{ id: 'only' }], [{ id: 'ad' }, { id: 'ad2' }])
  assert.deepEqual(mixed.map((row) => row.id), ['only'])
})

test('with no organic matches the paid rail is still capped', () => {
  const mixed = mixSponsored([], Array.from({ length: 9 }, (_, i) => i))
  assert.equal(mixed.length, 4)
})

test('evening pass rejects a missing tick, a long window, and a client price', () => {
  assert.equal(boost({ consent: false }).ok, false)
  assert.match(boost({ consent: false }).ok ? '' : (boost({ consent: false }) as { error: string }).error, /Tick the box/)
  const long = boost({ endsAt: '2026-10-30T15:00:00.000Z' })
  assert.equal(long.ok, false)
  const priced = boost({ amountCents: 100 })
  assert.equal(priced.ok, true)
  if (priced.ok) {
    assert.equal(priced.value.amountCents, BOOSTS.EVENING.priceCents)
    assert.equal(priced.value.spendCapCents, BOOSTS.EVENING.priceCents)
    assert.equal(priced.value.city, 'Sydney')
    assert.equal(priced.value.category, 'Music')
  }
})

test('promoter pro discounts the charge and a lower impression cap is kept', () => {
  const planned = planBoost(
    {
      inventoryId: 'DAY_PASS',
      startsAt: '2026-10-30T08:00:00.000Z',
      endsAt: '2026-10-31T08:00:00.000Z',
      headline: 'All day on the band',
      consent: true,
      impressionCap: 500,
    },
    event,
    { now, pro: true, horizonDays: 14 },
  )
  assert.equal(planned.ok, true)
  if (planned.ok) {
    assert.equal(planned.value.amountCents, Math.round(1500 * 0.85))
    assert.equal(planned.value.impressionCap, 500)
    assert.equal(planned.value.spendCapCents, planned.value.amountCents)
  }
})

test('serving stops at the end and at the impression cap', () => {
  const row = {
    status: 'ACTIVE',
    startsAt: new Date('2026-10-30T00:00:00.000Z'),
    endsAt: new Date('2026-10-30T06:00:00.000Z'),
    impressionCap: 100,
  }
  assert.equal(campaignIsServing(row, 10, new Date('2026-10-30T03:00:00.000Z')), true)
  assert.equal(campaignIsServing(row, 100, new Date('2026-10-30T03:00:00.000Z')), false)
  assert.equal(campaignIsServing(row, 10, new Date('2026-10-30T06:00:00.000Z')), false)
  assert.equal(expireReason(row, 100, new Date('2026-10-30T03:00:00.000Z')), 'capped')
  assert.equal(expireReason(row, 10, new Date('2026-10-30T07:00:00.000Z')), 'ended')
  assert.equal(expireReason({ ...row, status: 'EXPIRED' }, 10, new Date('2026-10-30T09:00:00.000Z')), null)
  assert.equal(expireReason({ ...row, status: 'EXPIRED' }, 500, new Date('2026-10-30T09:00:00.000Z')), null)
})

test('a shown boost cannot be refunded, and an unshown one can inside the window', () => {
  const startsAt = new Date('2026-10-30T08:00:00.000Z')
  assert.equal(refundEligible({
    status: 'ACTIVE', impressions: 0, startsAt, now: new Date('2026-10-30T09:00:00.000Z'),
    windowHours: 48, paymentMode: 'stripe', hasPaymentIntent: true,
  }).ok, true)
  const shown = refundEligible({
    status: 'ACTIVE', impressions: 1, startsAt, now: new Date('2026-10-30T09:00:00.000Z'),
    windowHours: 48, paymentMode: 'stripe', hasPaymentIntent: true,
  })
  assert.equal(shown.ok, false)
  const late = refundEligible({
    status: 'ACTIVE', impressions: 0, startsAt, now: new Date('2026-11-03T09:00:00.000Z'),
    windowHours: 48, paymentMode: 'stripe', hasPaymentIntent: true,
  })
  assert.equal(late.ok, false)
})

test('margin, MRR and 90-day repeat ignore unpaid and cancelling rows', () => {
  const margin = placementMargin([
    { amountCents: 1500, paymentMode: 'stripe', status: 'ACTIVE' },
    { amountCents: 900, paymentMode: 'stripe', status: 'EXPIRED' },
    { amountCents: 1900, paymentMode: 'test', status: 'ACTIVE' },
    { amountCents: 1500, paymentMode: 'stripe', status: 'REFUNDED' },
  ])
  assert.equal(margin.revenueCents, 2400)
  assert.ok(margin.margin != null && margin.margin < 1)
  const mrr = monthlyRecurringRevenue([
    { status: 'ACTIVE', amountCents: 3900, cancelAtPeriodEnd: false },
    { status: 'ACTIVE', amountCents: 9900, cancelAtPeriodEnd: true },
    { status: 'CANCELLED', amountCents: 19900, cancelAtPeriodEnd: false },
  ])
  assert.equal(mrr.mrrCents, 3900)
  assert.equal(mrr.subscribers, 1)
  assert.equal(mrr.cancelling, 1)
  const day = 86400000
  const at = now.getTime()
  const repeat = repeatPurchase90d([
    { organiserId: 'a', at: at - day },
    { organiserId: 'a', at: at - 2 * day },
    { organiserId: 'b', at: at - day },
    { organiserId: 'c', at: at - 120 * day },
    { organiserId: 'c', at: at - 121 * day },
  ], at)
  assert.equal(repeat.paying, 2)
  assert.equal(repeat.repeat, 1)
  assert.equal(repeat.rate, 0.5)
})
