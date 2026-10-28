export type Tier = 'SILVER' | 'BRONZE' | 'GOLD'
export type Addon = 'SPOTLIGHT' | 'FRONTROW'
export type Duration = 7 | 14 | 30

export interface TierDef {
  key: Tier
  name: string
  priceCents: number
  days: number
  color: string
  tagline: string
  perks: string[]
  /** price in cents per campaign length */
  prices: Record<Duration, number>
  /** the campaign length each package is sold around */
  headlineDays: Duration
}

export const DURATIONS: { days: Duration; label: string; note?: string }[] = [
  { days: 7, label: '7 days', note: 'Launch week' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days', note: 'Best value' },
]

/** Promotion packages (one-time payment, AUD inc. GST, per event). Boost < Spotlight < Headliner.
 *  DB keys stay SILVER/BRONZE/GOLD so existing promotions keep working. */
export const TIERS: TierDef[] = [
  {
    key: 'SILVER', name: 'Boost', priceCents: 1900, days: 7, headlineDays: 7, color: '#C0C7D1', tagline: 'Low-friction entry point',
    perks: ['Highlighted event card with a “Boost” badge', 'Placed in the Featured band for your event’s city', 'Basic reporting: listing views & ticket clicks'],
    prices: { 7: 1900, 14: 2900, 30: 4900 },
  },
  {
    key: 'BRONZE', name: 'Spotlight', priceCents: 4900, days: 14, headlineDays: 14, color: '#CD7F32', tagline: 'Homepage placement with geo targeting',
    perks: ['Everything in Boost', 'Homepage placement, ranked above Boost', 'Geo targeting: larger highlighted pin on your city’s map', 'Click reporting for every ticket click'],
    prices: { 7: 2900, 14: 4900, 30: 7900 },
  },
  {
    key: 'GOLD', name: 'Headliner', priceCents: 9900, days: 30, headlineDays: 30, color: '#F5B700', tagline: 'Premium placement in every city',
    perks: ['Everything in Spotlight', 'Premium placement in the Featured band in every city', 'Premium pin always shown on the map', 'Newsletter eligibility in subscriber emails'],
    prices: { 7: 4900, 14: 6900, 30: 9900 },
  },
]

export interface AddonDef { key: Addon; name: string; desc: string; prices: Record<Duration, number> }

/** Optional extras bought alongside a package; they run for the same campaign length. */
export const ADDONS: AddonDef[] = [
  { key: 'FRONTROW', name: 'Front-row placement', desc: 'First position in the Featured band, shown nationwide in every city.', prices: { 7: 2900, 14: 4900, 30: 7900 } },
  { key: 'SPOTLIGHT', name: 'Newsletter boost', desc: 'Top slot in the “Hot & promoted” section of every subscriber email for your city while your boost runs, clearly labelled Sponsored.', prices: { 7: 1900, 14: 2900, 30: 3900 } },
]

export const PRO_PLAN = {
  name: 'Promoter Pro',
  priceCents: 2900,
  days: 30,
  discountPct: 15,
  perks: ['15% off every package and add-on', 'Verified promoter tick on your events', 'Views & ticket-click analytics on all your events'],
}

/** Monthly business subscriptions (proposed — not yet purchasable; visitors can register interest). */
export const BUSINESS_PLANS = [
  { key: 'FREE', name: 'Free', monthlyCents: 0, value: 'Basic listing and event submissions', live: true },
  { key: 'LOCAL_PRO', name: 'Local Pro', monthlyCents: 3900, value: 'Enhanced profile, recurring events, basic analytics', live: false },
  { key: 'GROWTH', name: 'Growth', monthlyCents: 9900, value: 'More promotion credits, richer analytics, scheduling tools', live: false },
  { key: 'VENUE_PLUS', name: 'Venue Plus', monthlyCents: 19900, value: 'Multi-event management, team access, advanced promotion tools', live: false },
] as const

/** Local business recommendation shown beneath a single event, until that event ends. Flat price. */
export const LOCAL_AD = {
  name: 'Local business recommendation',
  priceCents: 5900,
  desc: 'Restaurants, bars, parking and experience operators: appear as a “Recommended” pick beneath a specific event, until it ends.',
}

export const TIER_RANK: Record<Tier, number> = { SILVER: 1, BRONZE: 2, GOLD: 3 }
export const TIER_KEYS: Tier[] = ['SILVER', 'BRONZE', 'GOLD']
export const tierDef = (t: string) => TIERS.find((x) => x.key === t)
export const addonDef = (a: string) => ADDONS.find((x) => x.key === a)
export const isTier = (t: unknown): t is Tier => t === 'SILVER' || t === 'BRONZE' || t === 'GOLD'
export const isAddon = (a: unknown): a is Addon => a === 'SPOTLIGHT' || a === 'FRONTROW'
export const isDuration = (d: unknown): d is Duration => d === 7 || d === 14 || d === 30
export const productName = (key: string) => tierDef(key)?.name ?? addonDef(key)?.name ?? key
export const formatAud = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`
export const applyPro = (cents: number, pro: boolean) => (pro ? Math.round(cents * (1 - PRO_PLAN.discountPct / 100)) : cents)

/** Price breakdown for a campaign. All amounts in cents. */
export function quote(tier: Tier, days: Duration, addons: Addon[], pro: boolean) {
  const lines = [
    { key: tier as string, name: `${tierDef(tier)!.name} package`, listCents: tierDef(tier)!.prices[days] },
    ...addons.map((a) => ({ key: a as string, name: addonDef(a)!.name, listCents: addonDef(a)!.prices[days] })),
  ].map((l) => ({ ...l, cents: applyPro(l.listCents, pro) }))
  const list = lines.reduce((s, l) => s + l.listCents, 0)
  const total = lines.reduce((s, l) => s + l.cents, 0)
  return { lines, list, total, saving: list - total }
}
