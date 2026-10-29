/** Ready-made day plans offered inside the hero search bar. Client-safe. */

export type PlanPick = {
  slug: string
  /** Chip label. */
  label: string
  /** Text written into the search bar when the chip is chosen. */
  fill: string
}

export const PLAN_PICKS: PlanPick[] = [
  { slug: 'saturday-date-night', label: 'Saturday date night', fill: 'Saturday date night' },
  { slug: 'family-sunday', label: 'Family Sunday', fill: 'Family Sunday' },
  { slug: 'free-afternoon', label: 'Free afternoon', fill: 'Free afternoon' },
]

const ALIASES: Record<string, string[]> = {
  'saturday-date-night': ['saturday date night', 'date night', 'saturday night'],
  'family-sunday': ['family sunday', 'family sunday under 50', 'family day'],
  'free-afternoon': ['free afternoon', 'a free afternoon', 'free arvo'],
}

function norm(value: string): string {
  return value.toLowerCase().replace(/\$/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Matches a typed plan to one quick pick. Short or unrelated text stays unmatched. */
export function matchPlanPick(text: string): PlanPick | null {
  const q = norm(text)
  if (q.length < 3) return null
  let best: { pick: PlanPick; score: number } | null = null
  for (const pick of PLAN_PICKS) {
    const names = [pick.label, pick.fill, pick.slug.replace(/-/g, ' '), ...(ALIASES[pick.slug] ?? [])].map(norm)
    let score = 0
    for (const name of names) {
      if (!name) continue
      if (q === name) score = Math.max(score, 100)
      else if (name.length >= 8 && q.includes(name)) score = Math.max(score, 80)
      else if (q.length >= 8 && name.includes(q)) score = Math.max(score, 70)
    }
    if (!best || score > best.score) best = { pick, score }
  }
  return best && best.score >= 70 ? best.pick : null
}

export type PlanViewStop =
  | {
      kind: 'event'
      event: {
        id: string
        title: string
        date: string
        time: string | null
        venueName: string
        suburb?: string | null
        category: string
        isFree: boolean
        price?: string | null
      }
    }
  | { kind: 'tip'; tip: 'dining' | 'transport'; text: string; href: string }

export type PlanViewLeg = { fromId: string; toId: string; kind: string; text: string; href: string }

export type PlanView = {
  slug: string
  title: string
  blurb: string
  city: string
  date: string | null
  href: string
  stops: PlanViewStop[]
  legs: PlanViewLeg[]
}
