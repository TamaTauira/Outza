// Client-safe helpers for event-goer profile fields (year of birth, home postcode) and their grouped forms.

export const MIN_AGE = 13
export const EU_MIN_AGE = 16
export const ADULT_AGE = 18
export const MAX_AGE = 110
/** Groups smaller than this are never shown to promoters. */
export const MIN_GROUP = 10

/** EU, EEA and the UK. IP country is best-effort; a missing header does not block sign-up. */
export const UNDER16_BLOCKED_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB',
])

export const UNDER16_BLOCK_MESSAGE = 'VibePeep can’t open an account for under-16s in your country. You can join once you are 16.'

/** Shown wherever promoters see audience insights (dashboard and weekly report email). */
export const AUDIENCE_DISCLAIMER = `Based on saves, "going", ticket taps, shares, itinerary adds and views by signed-in adults on VibePeep. Under-18s are not included. VibePeep doesn't sell tickets, so this is interest, not purchaser data. Groups under ${MIN_GROUP} people are hidden, and you never see anyone's year of birth, postcode, name or email.`

export const AGE_BANDS = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'] as const

function sydneyParts(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: n('year'), month: n('month'), day: n('day') }
}

/**
 * Youngest age someone born in that year can be. Their birthday is treated as 31 December,
 * so a check never treats a person as older than they might be.
 */
export function conservativeAge(birthYear: number, now = new Date()): number {
  const { year, month, day } = sydneyParts(now)
  const hadBirthday = month === 12 && day === 31
  return year - birthYear - (hadBirthday ? 0 : 1)
}

export function ageBandForYear(birthYear: number, now = new Date()): string {
  const a = conservativeAge(birthYear, now)
  if (a < 18) return AGE_BANDS[0]
  if (a < 25) return AGE_BANDS[1]
  if (a < 35) return AGE_BANDS[2]
  if (a < 45) return AGE_BANDS[3]
  if (a < 55) return AGE_BANDS[4]
  if (a < 65) return AGE_BANDS[5]
  return AGE_BANDS[6]
}

/** True when the youngest possible age is under 18. A missing year is not treated as a minor. */
export function isUnder18(birthYear: number | null | undefined, now = new Date()): boolean {
  return typeof birthYear === 'number' && conservativeAge(birthYear, now) < ADULT_AGE
}

/** Under-18s are left out of organiser insights, exports and newsletter profiling. */
export function includeInAudience(birthYear: number | null | undefined, now = new Date()): boolean {
  return !isUnder18(birthYear, now)
}

/** Parses a four-digit birth year. The 13+ check uses the youngest age that year could be. */
export function parseBirthYear(v: unknown, now = new Date()): { year?: number; error?: string } {
  const raw = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : ''
  if (!/^\d{4}$/.test(raw)) return { error: 'Enter the year you were born' }
  const year = Number(raw)
  const age = conservativeAge(year, now)
  if (age < MIN_AGE) return { error: `You need to be ${MIN_AGE} or older to use VibePeep` }
  if (age > MAX_AGE) return { error: 'Please check the year of birth' }
  return { year }
}

/**
 * Blocks sign-up in the EU, EEA and UK when the youngest possible age is under 16.
 * A missing country header does not block: IP geolocation is best-effort.
 */
export function under16GeoBlock(country: string | null | undefined, birthYear: number | null | undefined, now = new Date()): string | null {
  const code = (country ?? '').trim().toUpperCase()
  if (!code || !UNDER16_BLOCKED_COUNTRIES.has(code)) return null
  if (typeof birthYear !== 'number') return null
  if (conservativeAge(birthYear, now) < EU_MIN_AGE) return UNDER16_BLOCK_MESSAGE
  return null
}

export const isPostcode = (v: unknown): v is string => typeof v === 'string' && /^\d{4}$/.test(v)

// Broad home areas from postcode ranges. Deliberately coarse so no area points to a single street or small suburb.
const AREAS: [number, number, string][] = [
  // Sydney & NSW
  [2000, 2011, 'Sydney CBD & inner city'], [2015, 2020, 'Inner south Sydney'], [2021, 2036, 'Eastern suburbs'],
  [2037, 2050, 'Inner west'], [2203, 2204, 'Inner west'], [2127, 2138, 'Inner west'],
  [2060, 2069, 'Lower North Shore'], [2088, 2092, 'Lower North Shore'], [2070, 2087, 'Upper North Shore'],
  [2093, 2108, 'Northern Beaches'], [2110, 2126, 'Ryde & northern districts'], [2140, 2152, 'Parramatta & surrounds'],
  [2153, 2159, 'The Hills'], [2160, 2168, 'Cumberland & Fairfield'], [2170, 2179, 'South-west Sydney'],
  [2190, 2200, 'Canterbury-Bankstown'], [2205, 2224, 'St George'], [2225, 2234, 'Sutherland Shire'],
  [2555, 2574, 'Macarthur'], [2745, 2759, 'Penrith & Hawkesbury'], [2760, 2770, 'Blacktown & Mount Druitt'],
  [2773, 2786, 'Blue Mountains'], [2250, 2263, 'Central Coast'], [2264, 2310, 'Newcastle & Lake Macquarie'],
  [2500, 2530, 'Wollongong & Illawarra'], [2600, 2620, 'Canberra'], [2900, 2914, 'Canberra'],
  [2000, 2999, 'Regional NSW'],
  // Melbourne & VIC
  [3000, 3008, 'Melbourne CBD & Docklands'], [3051, 3058, 'Inner north Melbourne'], [3065, 3068, 'Inner north Melbourne'],
  [3121, 3121, 'Inner east Melbourne'], [3141, 3146, 'Inner south-east Melbourne'], [3181, 3207, 'Bayside & inner south Melbourne'],
  [3010, 3030, 'Western suburbs Melbourne'], [3031, 3099, 'Northern suburbs Melbourne'], [3101, 3138, 'Eastern suburbs Melbourne'],
  [3139, 3160, 'Outer east Melbourne'], [3161, 3180, 'South-east Melbourne'], [3800, 3810, 'South-east Melbourne'],
  [3910, 3944, 'Mornington Peninsula'], [3211, 3228, 'Geelong'], [3000, 3999, 'Regional Victoria'],
  // Brisbane & QLD
  [4000, 4007, 'Brisbane CBD & inner city'], [4101, 4102, 'Brisbane CBD & inner city'], [4008, 4037, 'Northern Brisbane'],
  [4051, 4069, 'Western Brisbane'], [4103, 4125, 'Southside Brisbane'], [4151, 4179, 'Bayside Brisbane'],
  [4207, 4230, 'Gold Coast'], [4500, 4509, 'Moreton Bay'], [4550, 4575, 'Sunshine Coast'], [4300, 4306, 'Ipswich'],
  [4000, 4999, 'Regional Queensland'],
  // Adelaide & SA
  [5000, 5006, 'Adelaide CBD & North Adelaide'], [5007, 5025, 'Western Adelaide'], [5031, 5052, 'South-west Adelaide'],
  [5061, 5076, 'Eastern Adelaide'], [5081, 5098, 'North-east Adelaide'], [5106, 5121, 'Northern Adelaide'],
  [5158, 5174, 'Southern Adelaide'], [5000, 5999, 'Regional SA'],
  // Perth & WA
  [6000, 6005, 'Perth CBD & inner city'], [6006, 6019, 'Western suburbs & coast Perth'], [6020, 6038, 'Northern suburbs Perth'],
  [6050, 6062, 'North-east Perth'], [6100, 6112, 'South-east Perth'], [6147, 6162, 'Fremantle & surrounds'],
  [6163, 6176, 'Cockburn & Rockingham'], [6207, 6214, 'Mandurah'], [6000, 6999, 'Regional WA'],
  // Hobart & TAS
  [7000, 7019, 'Hobart'], [7248, 7250, 'Launceston'], [7000, 7999, 'Regional Tasmania'],
  // Darwin & NT
  [800, 832, 'Darwin'], [800, 899, 'Regional NT'],
]

export function areaForPostcode(pc: string | null | undefined): string | null {
  if (!isPostcode(pc)) return null
  const n = Number(pc)
  for (const [lo, hi, label] of AREAS) if (n >= lo && n <= hi) return label
  return 'Elsewhere in Australia'
}

export const PLAN_AHEAD = ['Same day', '1–6 days ahead', '1–2 weeks ahead', '2–4 weeks ahead', 'A month or more ahead'] as const

export function planAheadBand(engagedAt: Date, eventDate: Date): string {
  const days = Math.floor((eventDate.getTime() - engagedAt.getTime()) / 86400000)
  if (days < 1) return PLAN_AHEAD[0]
  if (days < 7) return PLAN_AHEAD[1]
  if (days < 14) return PLAN_AHEAD[2]
  if (days < 28) return PLAN_AHEAD[3]
  return PLAN_AHEAD[4]
}
