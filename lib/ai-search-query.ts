import type { Prisma } from '@prisma/client'
import type { AiFilters } from './ai-search-parse'
import { tagForms } from './ai-search-rank'
import { LGBTI_NEEDLES, isLgbtiTerm, searchSpellings } from './search-fold'

/** Equality matches. A `contains` scan of every price string times out on a two-week window. */
const FREE_PRICES = ['Free', 'free', 'FREE', '$0', '$0.00', '0', '0.00', 'Complimentary']

/**
 * Price constraint that belongs in the SQL `where`, before `take`.
 * Filtering the first page in memory made Free / Under $30 / Under $75 return nothing
 * whenever the earliest rows were paid.
 */
export function priceWhere(filters: Pick<AiFilters, 'isFree' | 'maxPrice'>): Prisma.EventWhereInput | null {
  if (filters.isFree) {
    return {
      OR: [
        { isFree: true, OR: [{ priceMin: null }, { priceMin: { lte: 0 } }] },
        { priceMin: { lte: 0 } },
        { price: { in: FREE_PRICES } },
      ],
    }
  }
  if (filters.maxPrice != null) {
    return {
      OR: [
        { isFree: true },
        { priceMin: { lte: filters.maxPrice } },
        { price: { in: FREE_PRICES } },
      ],
    }
  }
  return null
}

/**
 * A category inferred from the words has to reach SQL when those words were
 * stripped as generic ("live music") or the person picked the vibe themselves.
 * Otherwise the first page is every category and the music filter finds nothing.
 */
export function shouldFilterCategory(
  filters: Pick<AiFilters, 'category' | 'categoryStrict' | 'isFree' | 'timeOfDay' | 'soon' | 'keywords'>,
  q: string,
): boolean {
  if (!filters.category) return false
  if (filters.categoryStrict || filters.isFree || filters.timeOfDay !== 'any' || filters.soon) return true
  if (!filters.keywords.length) return true
  if (filters.category === 'Music' && /\b(live music|gigs?|concerts?)\b/i.test(q)) return true
  return false
}

const mode = 'insensitive' as const

type TextField = 'title' | 'description' | 'venueName' | 'suburb' | 'venueAddress'

function fieldContains(field: TextField, needles: string[]): Prisma.EventWhereInput[] {
  return needles.map((word) => ({ [field]: { contains: word, mode } }))
}

function wordClause(word: string): Prisma.EventWhereInput {
  const spellings = searchSpellings(word)
  const ascii = [word.toLowerCase()]
  return {
    OR: [
      ...fieldContains('title', spellings),
      ...fieldContains('description', spellings),
      ...fieldContains('venueName', ascii),
      ...fieldContains('suburb', ascii),
      ...fieldContains('venueAddress', ascii),
      { subTags: { hasSome: tagForms(word) } },
    ],
  }
}

/**
 * Keyword filter for Ask. An inferred LGBTIQ+ topic is a union with the flag
 * and with queer synonyms, never an extra AND that drops an untagged title.
 */
export function askTextWhere(keywords: string[], lgbtiq: boolean): Prisma.EventWhereInput {
  const words = keywords.map((word) => word.toLowerCase()).filter(Boolean)
  const required = words.filter((word) => !isLgbtiTerm(word))
  const widen = lgbtiq || words.some((word) => isLgbtiTerm(word))
  const parts: Prisma.EventWhereInput[] = required.map(wordClause)
  if (widen) {
    // The flag is the same net as the LGBTIQ+ guide. Description LIKEs across every
    // fancy spelling time out, and the chip then comes back empty.
    const needles = [...new Set(LGBTI_NEEDLES.flatMap((term) => searchSpellings(term)))]
    parts.push({
      OR: [
        { isLGBTI: true },
        ...fieldContains('title', needles),
      ],
    })
  }
  if (!parts.length) return {}
  return { AND: parts }
}

/** Inclusive calendar days. A listing dated the last day of the year still counts. */
export function askDateBounds(dateFrom: string, dateTo: string): { gte: Date; lte: Date } {
  return {
    gte: new Date(`${dateFrom}T00:00:00.000Z`),
    lte: new Date(`${dateTo}T23:59:59.999Z`),
  }
}

/**
 * Short windows stay small. A named year has to keep March and December in the
 * candidate set, not only the first page of January.
 */
export function askCandidateTake(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00.000Z`).getTime()
  const to = new Date(`${dateTo}T00:00:00.000Z`).getTime()
  const days = Math.round((to - from) / 86400000)
  return days > 60 ? 500 : 80
}

/** Zero-padded 'HH:MM' for a minute of day, clamped into the day — the same
 * string shape the route compares stored times against. */
function minuteOfDay(mins: number): string {
  const clamped = Math.max(0, Math.min(mins, 23 * 60 + 59))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

/**
 * "Not already ended today" in SQL, mirroring the route's post-filter
 * exactly: a listing counts as ended only when it is dated today and its
 * start is more than 60 minutes past, so a row survives when its date is
 * after today, or it is today with no time or a time at or after
 * now − 60 minutes. The condition has to be in the `where`, before the
 * take — the candidate set is earliest-first, so dropping ended rows in
 * memory afterwards lets a broad ask spend its whole take on this
 * morning's finished events and report an honest-looking zero by evening.
 */
export function askNotEndedTodayWhere(today: string, nowMinutes: number): Prisma.EventWhereInput {
  return {
    OR: [
      { date: { gt: new Date(`${today}T23:59:59.999Z`) } },
      {
        date: askDateBounds(today, today),
        OR: [{ time: null }, { time: { gte: minuteOfDay(nowMinutes - 60) } }],
      },
    ],
  }
}
