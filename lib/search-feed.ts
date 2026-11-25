import { addDays } from '@/lib/board'
import type { BoardArgs } from '@/lib/board-feed'
import { interpretQuery } from '@/lib/ai-search-parse'
import { applyHints, type SearchHints } from '@/lib/search-hints'

const DATE_NIGHT = ['Food & Drink', 'Music', 'Arts & Culture', 'Nightlife']

/** Board query for a shareable /search URL. Date night is an evening under $80, not a search for the word "date". */
export function searchFeedArgs(q: string, cityName: string, today: string, hints?: SearchHints | null): BoardArgs {
  const parsed = applyHints(interpretQuery(q, today), hints, today)
  const dateNight = /\bdate night\b/i.test(q)
  const timeFrom = parsed.timeOfDay === 'evening' ? '17:00' : parsed.timeOfDay === 'afternoon' ? '12:00' : parsed.timeOfDay === 'morning' ? '05:00' : ''
  return {
    page: 1,
    limit: 40,
    search: dateNight ? '' : parsed.keywords.join(' '),
    categories: dateNight ? DATE_NIGHT : parsed.category ? [parsed.category] : [],
    subTag: dateNight ? '' : parsed.subTag,
    suburb: parsed.suburb,
    isFree: parsed.isFree,
    maxPrice: parsed.maxPrice,
    isLGBTI: parsed.lgbtiq,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    timeFrom,
    sortBy: 'date',
    city: parsed.city || cityName,
    promoterId: '',
  }
}

/** Drop the evening cutoff, then widen a single day, then drop the words. */
export function relaxedSearchArgs(args: BoardArgs): { args: BoardArgs; note: string } | null {
  if (args.timeFrom) return { args: { ...args, timeFrom: '' }, note: 'Including events that start earlier today.' }
  if (args.dateFrom && args.dateTo && args.dateFrom === args.dateTo) {
    return { args: { ...args, dateTo: addDays(args.dateTo, 7) }, note: 'Nothing that day, so this looks a week further.' }
  }
  if (args.search) return { args: { ...args, search: '' }, note: 'Nothing matched those words, so this is the wider list.' }
  return null
}
