import { BUSINESS_PLANS, applyPro } from '@/lib/tiers'

/** Sponsored cards may take at most this share of a mixed result. */
export const SPONSORED_MAX_FRACTION = 1 / 3
export const SPONSORED_MIX_LENGTH = 12

export const ATTRIBUTION_NOTE =
  'Impressions count how often the Sponsored card was served, not unique people. Detail views count page loads while the boost is live, including a refresh. Get tickets counts clicks on your outbound link. Repeat interest counts a signed-in person who clicked Get tickets on another of your boosts in the last 90 days and then clicked again here. Anonymous clicks are not matched to anyone. Ticket sales happen on your ticketing site. VibePeep does not see them, so none of these numbers are sales.'

export type BoostId = 'EVENING' | 'DAY_PASS'
export type PlanId = 'LOCAL_PRO' | 'GROWTH' | 'VENUE_PLUS'

export interface BoostDef {
  id: BoostId
  name: string
  placement: 'FEATURED'
  durationKind: 'EVENING' | 'DAY'
  minMinutes: number
  maxMinutes: number
  priceCents: number
  impressionCap: number
  guaranteed: string
  estimated: string
}

export const BOOSTS: Record<BoostId, BoostDef> = {
  EVENING: {
    id: 'EVENING',
    name: 'Evening pass',
    placement: 'FEATURED',
    durationKind: 'EVENING',
    minMinutes: 60,
    maxMinutes: 6 * 60,
    priceCents: 900,
    impressionCap: 2500,
    guaranteed: 'A Sponsored card in your city’s Hot right now band, from the start you pick until the end or the impression cap, whichever comes first. Sponsored cards stay a minority whenever other events match.',
    estimated: 'Up to 2,500 serves. Detail views and Get tickets clicks are not promised. Ticket sales happen on your own site and are not visible here.',
  },
  DAY_PASS: {
    id: 'DAY_PASS',
    name: 'Day pass',
    placement: 'FEATURED',
    durationKind: 'DAY',
    minMinutes: 60,
    maxMinutes: 24 * 60,
    priceCents: 1500,
    impressionCap: 8000,
    guaranteed: 'A Sponsored card in your city’s Hot right now band for the window you pick, until the end or the impression cap, whichever comes first. Sponsored cards stay a minority whenever other events match.',
    estimated: 'Up to 8,000 serves. Detail views and Get tickets clicks are not promised. Ticket sales happen on your own site and are not visible here.',
  },
}

export interface PlanDef {
  id: PlanId
  name: string
  monthlyCents: number
  features: string[]
  /** Env var that holds the Stripe Price id. Required before a card can be charged. */
  priceEnv: 'STRIPE_PRICE_LOCAL_PRO' | 'STRIPE_PRICE_GROWTH' | 'STRIPE_PRICE_VENUE_PLUS'
}

export const ORGANISER_PLANS: PlanDef[] = [
  {
    id: 'LOCAL_PRO',
    name: 'Local Pro',
    monthlyCents: 3900,
    priceEnv: 'STRIPE_PRICE_LOCAL_PRO',
    features: ['Five short boosts at once', 'Invoices for every renewal', 'Change or cancel the plan yourself'],
  },
  {
    id: 'GROWTH',
    name: 'Growth',
    monthlyCents: 9900,
    priceEnv: 'STRIPE_PRICE_GROWTH',
    features: ['Fifteen short boosts at once', 'Schedule a boost up to 60 days ahead', 'Hourly results and a CSV export'],
  },
  {
    id: 'VENUE_PLUS',
    name: 'Venue Plus',
    monthlyCents: 19900,
    priceEnv: 'STRIPE_PRICE_VENUE_PLUS',
    features: ['Forty short boosts at once', 'Pause every live boost', '7-day refund window when a boost has not been shown'],
  },
]

export const PLAN_RANK: Record<PlanId, number> = { LOCAL_PRO: 1, GROWTH: 2, VENUE_PLUS: 3 }

export const isBoostId = (value: unknown): value is BoostId => value === 'EVENING' || value === 'DAY_PASS'
export const isPlanId = (value: unknown): value is PlanId => value === 'LOCAL_PRO' || value === 'GROWTH' || value === 'VENUE_PLUS'
export const boostDef = (id: string) => (isBoostId(id) ? BOOSTS[id] : undefined)
export const planDef = (id: string) => ORGANISER_PLANS.find((p) => p.id === id)

export function boostSlots(plan: string | null | undefined): number {
  if (plan === 'VENUE_PLUS') return 40
  if (plan === 'GROWTH') return 15
  if (plan === 'LOCAL_PRO') return 5
  return 1
}

export function scheduleHorizonDays(plan: string | null | undefined): number {
  if (plan === 'GROWTH' || plan === 'VENUE_PLUS') return 60
  return 14
}

export function refundWindowHours(plan: string | null | undefined): number {
  return plan === 'VENUE_PLUS' ? 24 * 7 : 48
}

export function canExportCampaigns(plan: string | null | undefined): boolean {
  return plan === 'GROWTH' || plan === 'VENUE_PLUS'
}

export function canPauseBoosts(plan: string | null | undefined): boolean {
  return plan === 'VENUE_PLUS'
}

export function priceEnvForBoost(id: BoostId): 'STRIPE_PRICE_EVENING' | 'STRIPE_PRICE_DAY_PASS' {
  return id === 'EVENING' ? 'STRIPE_PRICE_EVENING' : 'STRIPE_PRICE_DAY_PASS'
}

/**
 * Interleave paid cards into organic matches.
 * When organic matches exist, the result keeps their order, starts with one of them,
 * includes at least one, and is never entirely sponsored.
 * Sponsored share stays at or under maxFraction. An empty organic list still caps the paid rail.
 */
export function mixSponsored<T>(organic: T[], sponsored: T[], opts?: { maxLength?: number; maxFraction?: number }): T[] {
  const maxLength = Math.max(0, opts?.maxLength ?? SPONSORED_MIX_LENGTH)
  const maxFraction = opts?.maxFraction ?? SPONSORED_MAX_FRACTION
  if (!maxLength) return []
  if (!organic.length) {
    return sponsored.slice(0, Math.min(sponsored.length, Math.floor(maxLength * maxFraction)))
  }
  let sCount = Math.min(sponsored.length, Math.floor(maxLength * maxFraction))
  let oCount = Math.min(organic.length, Math.max(1, maxLength - sCount))
  while (sCount > 0 && (oCount + sCount > maxLength || sCount / (oCount + sCount) > maxFraction + 1e-9)) {
    sCount -= 1
    oCount = Math.min(organic.length, maxLength - sCount)
  }
  if (oCount < 1) oCount = Math.min(organic.length, 1)
  const org = organic.slice(0, oCount)
  const spo = sponsored.slice(0, sCount)
  const out: T[] = []
  let oi = 0
  let si = 0
  while (oi < org.length || si < spo.length) {
    if (oi < org.length) out.push(org[oi++])
    if (oi < org.length) out.push(org[oi++])
    if (si < spo.length) out.push(spo[si++])
  }
  return out
}

export interface PlannedBoost {
  inventoryId: BoostId
  city: string
  category: string
  startsAt: Date
  endsAt: Date
  minutes: number
  impressionCap: number
  amountCents: number
  spendCapCents: number
  listCents: number
  headline: string
  blurb: string | null
}

const MIN_CAP = 100

function cleanLine(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export function planBoost(
  input: {
    inventoryId?: unknown
    startsAt?: unknown
    endsAt?: unknown
    impressionCap?: unknown
    headline?: unknown
    blurb?: unknown
    consent?: unknown
    amountCents?: unknown
  },
  event: { city: string; category: string; date: Date },
  opts: { now: Date; pro: boolean; horizonDays: number },
): { ok: true; value: PlannedBoost } | { ok: false; error: string } {
  if (input.consent !== true) {
    return { ok: false, error: 'Tick the box so we know you agree to the charge. We will not bill you without it.' }
  }
  if (!isBoostId(input.inventoryId)) return { ok: false, error: 'Choose an evening pass or a day pass.' }
  const product = BOOSTS[input.inventoryId]
  const startsAt = new Date(typeof input.startsAt === 'string' ? input.startsAt : '')
  const endsAt = new Date(typeof input.endsAt === 'string' ? input.endsAt : '')
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: 'Pick a start and an end.' }
  }
  if (endsAt <= startsAt) return { ok: false, error: 'The end has to be after the start.' }
  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000)
  if (minutes < product.minMinutes) return { ok: false, error: `${product.name} needs at least an hour.` }
  if (minutes > product.maxMinutes) {
    const hours = product.maxMinutes / 60
    return { ok: false, error: `${product.name} runs for ${hours} hours at most.` }
  }
  const skew = opts.now.getTime() - 2 * 60000
  if (startsAt.getTime() < skew) return { ok: false, error: 'That start time is already in the past.' }
  const horizon = opts.now.getTime() + opts.horizonDays * 86400000
  if (startsAt.getTime() > horizon) {
    return { ok: false, error: `You can schedule ${opts.horizonDays} days ahead on your current plan.` }
  }
  const eventMs = event.date.getTime()
  if (eventMs < opts.now.getTime() - 36 * 3600000) return { ok: false, error: 'That event has already passed.' }
  const headline = cleanLine(input.headline, 80)
  if (headline.length < 2) return { ok: false, error: 'Add a short headline for the card.' }
  if (/[<>]/.test(headline)) return { ok: false, error: 'The headline is plain text. Leave the brackets out.' }
  const blurbRaw = cleanLine(input.blurb, 140)
  if (blurbRaw && /[<>]/.test(blurbRaw)) return { ok: false, error: 'The extra line is plain text. Leave the brackets out.' }
  let impressionCap = product.impressionCap
  if (input.impressionCap != null && input.impressionCap !== '') {
    const requested = Number(input.impressionCap)
    if (!Number.isInteger(requested) || requested < MIN_CAP || requested > product.impressionCap) {
      return { ok: false, error: `The impression cap sits between ${MIN_CAP} and ${product.impressionCap.toLocaleString('en-AU')}.` }
    }
    impressionCap = requested
  }
  const listCents = product.priceCents
  const amountCents = applyPro(listCents, opts.pro)
  // Client-supplied prices are ignored. The cap is the amount we will actually charge.
  void input.amountCents
  return {
    ok: true,
    value: {
      inventoryId: product.id,
      city: event.city,
      category: event.category,
      startsAt,
      endsAt,
      minutes,
      impressionCap,
      amountCents,
      spendCapCents: amountCents,
      listCents,
      headline,
      blurb: blurbRaw || null,
    },
  }
}

export function campaignIsServing(
  row: { status: string; startsAt: Date; endsAt: Date; impressionCap: number },
  impressions: number,
  now: Date,
): boolean {
  return row.status === 'ACTIVE' && row.startsAt <= now && row.endsAt > now && impressions < row.impressionCap
}

/** Why a cron pass should stop a boost. Null means leave it. Safe to call again. */
export function expireReason(
  row: { status: string; endsAt: Date; impressionCap: number },
  impressions: number,
  now: Date,
): 'ended' | 'capped' | null {
  if (row.status !== 'ACTIVE' && row.status !== 'PAUSED') return null
  if (impressions >= row.impressionCap) return 'capped'
  if (row.endsAt <= now) return 'ended'
  return null
}

export function refundEligible(args: {
  status: string
  impressions: number
  startsAt: Date | null
  now: Date
  windowHours: number
  paymentMode: string
  hasPaymentIntent: boolean
}): { ok: true } | { ok: false; reason: string } {
  if (args.status === 'REFUNDED') return { ok: false, reason: 'This one is already refunded.' }
  if (args.status !== 'ACTIVE' && args.status !== 'PAUSED' && args.status !== 'PENDING') {
    return { ok: false, reason: 'Only a live boost that has not been shown can be refunded here.' }
  }
  if (args.impressions > 0) return { ok: false, reason: 'This boost has already been shown, so the self-serve refund is closed.' }
  if (!args.startsAt) return { ok: false, reason: 'This boost has no start time.' }
  const deadline = args.startsAt.getTime() + args.windowHours * 3600000
  if (args.now.getTime() > deadline) {
    return { ok: false, reason: `The self-serve window is ${args.windowHours} hours from the start. Write to us with the invoice if something went wrong.` }
  }
  if (args.paymentMode !== 'stripe' || !args.hasPaymentIntent) {
    return { ok: false, reason: 'There is no card charge to refund.' }
  }
  return { ok: true }
}

export const CARD_FEE_RATE = 0.017
export const CARD_FEE_FIXED_CENTS = 30

export function estimatedCardFee(amountCents: number): number {
  if (amountCents <= 0) return 0
  return Math.round(amountCents * CARD_FEE_RATE) + CARD_FEE_FIXED_CENTS
}

export function placementMargin(rows: { amountCents: number; paymentMode: string; status: string }[]) {
  const paid = rows.filter((r) => r.paymentMode === 'stripe' && (r.status === 'ACTIVE' || r.status === 'EXPIRED'))
  const revenueCents = paid.reduce((sum, row) => sum + row.amountCents, 0)
  const feeCents = paid.reduce((sum, row) => sum + estimatedCardFee(row.amountCents), 0)
  const margin = revenueCents > 0 ? (revenueCents - feeCents) / revenueCents : null
  return { revenueCents, feeCents, margin }
}

export function monthlyRecurringRevenue(subs: { status: string; amountCents: number; cancelAtPeriodEnd: boolean }[]) {
  const live = subs.filter((s) => s.status === 'ACTIVE' && !s.cancelAtPeriodEnd)
  return {
    mrrCents: live.reduce((sum, row) => sum + row.amountCents, 0),
    subscribers: live.length,
    cancelling: subs.filter((s) => s.status === 'ACTIVE' && s.cancelAtPeriodEnd).length,
  }
}

/** Share of organisers with 2+ paid placements in the 90 days before `now`. */
export function repeatPurchase90d(purchases: { organiserId: string; at: number }[], now: number) {
  const start = now - 90 * 86400000
  const recent = purchases.filter((p) => p.at >= start && p.at <= now)
  const counts = new Map<string, number>()
  for (const row of recent) counts.set(row.organiserId, (counts.get(row.organiserId) ?? 0) + 1)
  const paying = counts.size
  let repeat = 0
  for (const count of counts.values()) if (count >= 2) repeat += 1
  return { paying, repeat, rate: paying ? repeat / paying : 0 }
}

export function impressionBucket(now = new Date()): string {
  return now.toISOString().slice(0, 13)
}

export function planPricesMatchPublicCatalogue(): boolean {
  return ORGANISER_PLANS.every((plan) => BUSINESS_PLANS.some((row) => row.key === plan.id && row.monthlyCents === plan.monthlyCents))
}
