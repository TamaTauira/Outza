import { addDays } from '@/lib/board'
import type { BoardArgs } from '@/lib/board-feed'
import { interpretQuery } from '@/lib/ai-search-parse'
import { applyHints, type SearchHints } from '@/lib/search-hints'
import { areaGroupForPlace } from '@/lib/categories'
import { boardCityForPlace, CITY_NAMES } from '@/lib/cities'

const DATE_NIGHT = ['Food & Drink', 'Music', 'Arts & Culture', 'Nightlife']

/** Board query for a shareable /search URL. Date night is an evening under $80, not a search for the word "date". */
export function searchFeedArgs(q: string, cityName: string, today: string, hints?: SearchHints | null): BoardArgs {
  const parsed = applyHints(interpretQuery(q, today), hints, today)
  const dateNight = /\bdate night\b/i.test(q)
  const timeFrom = parsed.timeOfDay === 'evening' ? '17:00' : parsed.timeOfDay === 'afternoon' ? '12:00' : parsed.timeOfDay === 'morning' ? '05:00' : ''
  const city = parsed.city || cityName
  // A suburb that names a folded-in place (Newcastle, Wollongong) is the
  // board's area group, not a suburb string: hand boardWhere the group label
  // it narrows by, the way the filter drawer does. As a plain suburb value it
  // would exact-match a stored suburb almost nothing carries.
  let suburb = parsed.suburb
  if (suburb && !CITY_NAMES.includes(suburb) && boardCityForPlace(suburb) === city) {
    const group = areaGroupForPlace(city, suburb)
    if (group) suburb = group.label
  }
  return {
    page: 1,
    limit: 40,
    search: dateNight ? '' : parsed.keywords.join(' '),
    categories: dateNight ? DATE_NIGHT : parsed.category ? [parsed.category] : [],
    // No inferred subTag gate: a tag the parser guessed from the words must
    // not hard-filter /search, the way it no longer gates Ask. Explore
    // applies only the filters the person picked; stacking the guess on the
    // words and the category zeroed searches Explore answers ("jazz" in
    // Adelaide needed the word, the category AND the exact stored tag).
    subTag: '',
    suburb,
    isFree: parsed.isFree,
    maxPrice: parsed.maxPrice,
    isLGBTI: parsed.lgbtiq,
    dateFrom: parsed.dateFrom,
    dateTo: parsed.dateTo,
    timeFrom,
    sortBy: 'date',
    city,
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
