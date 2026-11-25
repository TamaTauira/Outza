import { addDays } from '@/lib/board'
import { CATEGORIES } from '@/lib/categories'
import type { AiFilters } from '@/lib/ai-search-parse'
import { matchPlanPick } from '@/lib/plan-picks'

export type When = '' | 'soon' | 'tonight' | 'weekend'
export type Budget = '' | 'free' | '30' | '75'

/** When, Budget, Vibe and Suburb. One shape for the hero, Ask and /search. */
export type SearchHints = {
  when: When
  budget: Budget
  category: string
  area: string
}

export const EMPTY_HINTS: SearchHints = { when: '', budget: '', category: '', area: '' }

const WHEN = new Set<string>(['soon', 'tonight', 'weekend'])
const BUDGET = new Set<string>(['free', '30', '75'])
const CAT_NAMES = CATEGORIES.map((c) => c.name)

export function pickedHints(hints: SearchHints) {
  return !!(hints.when || hints.budget || hints.category || hints.area.trim())
}

export function hintsFromParams(sp: { when?: string; budget?: string; vibe?: string; suburb?: string }): SearchHints {
  const vibe = (sp.vibe ?? '').trim().slice(0, 40)
  return {
    when: WHEN.has(sp.when ?? '') ? (sp.when as When) : '',
    budget: BUDGET.has(sp.budget ?? '') ? (sp.budget as Budget) : '',
    category: CAT_NAMES.includes(vibe) ? vibe : '',
    area: (sp.suburb ?? '').replace(/[^\p{L}\p{N} '&-]/gu, '').trim().slice(0, 40),
  }
}

export function hintsToQuery(hints: SearchHints, extra: { q?: string; city?: string }) {
  const params = new URLSearchParams()
  if (extra.city) params.set('city', extra.city)
  const q = extra.q?.trim() ?? ''
  if (q) params.set('q', q)
  if (hints.when) params.set('when', hints.when)
  if (hints.budget) params.set('budget', hints.budget)
  if (hints.category) params.set('vibe', hints.category)
  if (hints.area.trim()) params.set('suburb', hints.area.trim())
  return params
}

function weekend(today: string): [string, string] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
  if (dow === 0) return [today, today]
  if (dow === 6) return [today, addDays(today, 1)]
  return [addDays(today, 6 - dow), addDays(today, 7 - dow)]
}

/** Quick picks win over whatever the words implied. */
export function applyHints(filters: AiFilters, hints: SearchHints | null | undefined, today: string): AiFilters {
  const next: AiFilters = { ...filters, keywords: [...filters.keywords] }
  if (!hints) return next
  if (hints.when === 'soon') {
    next.dateFrom = today
    next.dateTo = today
    next.timeOfDay = 'any'
    next.soon = true
  } else if (hints.when === 'tonight') {
    next.dateFrom = today
    next.dateTo = today
    next.timeOfDay = 'evening'
    next.soon = false
  } else if (hints.when === 'weekend') {
    const [from, to] = weekend(today)
    next.dateFrom = from
    next.dateTo = to
    next.timeOfDay = 'any'
    next.soon = false
  }
  if (hints.budget === 'free') {
    next.isFree = true
    next.maxPrice = null
  } else if (hints.budget === '30' || hints.budget === '75') {
    next.isFree = false
    next.maxPrice = Number(hints.budget)
  }
  if (hints.category && CAT_NAMES.includes(hints.category)) {
    next.category = hints.category
    next.categoryStrict = true
  }
  if (hints.area.trim()) next.suburb = hints.area.trim()
  return next
}

/**
 * Plan requests and sentence-length asks belong in Ask.
 * A short keyword stays on /search.
 */
export function isNaturalAsk(text: string): boolean {
  const q = text.trim()
  if (!q) return false
  if (matchPlanPick(q)) return true
  if (/\bplan my\b/i.test(q)) return true
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length >= 4) return true
  if (words.length >= 3 && /\b(tonight|weekend|tomorrow|saturday|sunday|friday|morning|afternoon|evening)\b/i.test(q)) return true
  return false
}

/** Chips that must hit the category the listings actually use, not a keyword that was stripped. */
export function chipQuery(label: string): { q: string; hints: Partial<SearchHints>; maxPrice?: number; subTag?: string } | null {
  if (label === 'Live music') return { q: '', hints: { category: 'Music' } }
  if (label === 'Comedy under $40') return { q: '', hints: { category: 'Arts & Culture' }, maxPrice: 40, subTag: 'Comedy' }
  if (label === 'LGBTIQ+ this week') return { q: 'LGBTIQ+ this week', hints: {} }
  return null
}
