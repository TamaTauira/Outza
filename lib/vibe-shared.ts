// Optional "vibe" profile questions (client-safe). Every answer is optional and only ever used for the person's own
// recommendations, or shown to organisers/Intelligence as grouped stats (groups under 10 hidden).

export type VibeQuestion = { key: VibeKey; label: string; hint?: string; multi: boolean; options: string[] }
export type VibeKey = 'vibes' | 'crew' | 'when' | 'spend' | 'travel' | 'transport' | 'planAhead' | 'frequency'
export type VibeProfile = Partial<Record<VibeKey, string[]>> & { bio?: string }

export const VIBE_BIO_MAX = 160

export const VIBE_QUESTIONS: VibeQuestion[] = [
  { key: 'vibes', label: 'What’s your normal vibe?', hint: 'Pick as many as you like', multi: true, options: [
    'Partying & clubbing', 'Live gigs', 'Shopping & markets', 'Foodie adventures', 'Bars & cocktails', 'Arts & theatre',
    'Comedy', 'Chill hangs', 'Outdoorsy', 'Sport fan', 'Wellness', 'Learning & workshops', 'Family fun', 'LGBTIQ+ scene',
  ] },
  { key: 'crew', label: 'Who do you usually roll with?', multi: true, options: ['Solo', 'Partner or date', 'Mates', 'Family with kids', 'Work crew'] },
  { key: 'when', label: 'When are you usually out?', multi: true, options: ['Weeknights', 'Friday nights', 'Saturday daytime', 'Saturday nights', 'Sundays', 'Late, late nights'] },
  { key: 'spend', label: 'Typical spend per outing', multi: false, options: ['Free is my favourite price', 'Under $30', '$30–$80', '$80–$150', '$150+'] },
  { key: 'travel', label: 'How far will you go for a good time?', multi: false, options: ['Walking distance', 'Up to 30 min', 'Up to an hour', 'Anywhere for the right event'] },
  { key: 'transport', label: 'How do you usually get there?', multi: true, options: ['Public transport', 'Drive', 'Rideshare or taxi', 'Walk or bike'] },
  { key: 'planAhead', label: 'How far ahead do you plan?', multi: false, options: ['Same day, spontaneous', 'A few days ahead', 'A couple of weeks ahead', 'A month or more'] },
  { key: 'frequency', label: 'How often do you head out?', multi: false, options: ['Most weeks', 'A couple of times a month', 'About once a month', 'Now and then'] },
]

/** Vibe answers that line up with event categories, used to nudge personalised picks. */
export const VIBE_CATEGORIES: Record<string, string[]> = {
  'Partying & clubbing': ['Nightlife', 'Music'], 'Live gigs': ['Music'], 'Shopping & markets': ['Community', 'Food & Drink'],
  'Foodie adventures': ['Food & Drink'], 'Bars & cocktails': ['Nightlife', 'Food & Drink'], 'Arts & theatre': ['Arts & Culture'],
  Comedy: ['Arts & Culture'], 'Chill hangs': ['Community', 'Food & Drink'], Outdoorsy: ['Sports', 'Wellness', 'Community'],
  'Sport fan': ['Sports'], Wellness: ['Wellness'], 'Learning & workshops': ['Education', 'Business'], 'Family fun': ['Family'],
}

/** Keeps only known answers; returns null when nothing is left. */
export function cleanVibe(input: unknown): VibeProfile | null {
  if (!input || typeof input !== 'object') return null
  const src = input as Record<string, unknown>
  const out: VibeProfile = {}
  for (const q of VIBE_QUESTIONS) {
    const raw = src[q.key]
    if (!Array.isArray(raw)) continue
    const picked = [...new Set(raw.filter((v): v is string => typeof v === 'string' && q.options.includes(v)))]
    const vals = q.multi ? picked : picked.slice(0, 1)
    if (vals.length) out[q.key] = vals
  }
  if (typeof src.bio === 'string') {
    const bio = src.bio.replace(/\s+/g, ' ').trim().slice(0, VIBE_BIO_MAX)
    if (bio) out.bio = bio
  }
  return Object.keys(out).length ? out : null
}

export const asVibe = (v: unknown): VibeProfile => cleanVibe(v) ?? {}

/** How many of the questions (plus the bio) have an answer. */
export function vibeProgress(v: VibeProfile): { done: number; total: number } {
  const total = VIBE_QUESTIONS.length + 1
  const done = VIBE_QUESTIONS.filter((q) => (v[q.key]?.length ?? 0) > 0).length + (v.bio ? 1 : 0)
  return { done, total }
}
