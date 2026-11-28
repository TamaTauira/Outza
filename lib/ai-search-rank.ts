import { isPaidListing } from '@/lib/quality'
import type { AiFilters } from '@/lib/ai-search-parse'
import { areaGroupForPlace, matchesAreaGroup, type BoardAreaGroup } from '@/lib/categories'
import { boardCitiesFor, boardCityForPlace, CITY_NAMES } from '@/lib/cities'
import { foldSearchText, hasLgbtiText, isLgbtiTerm } from '@/lib/search-fold'

export const ASK_LIMIT = 8

export interface AskRow {
  id: string
  title: string
  description?: string | null
  date: Date | string
  time: string | null
  venueName: string
  venueAddress?: string | null
  suburb: string | null
  city: string
  category: string
  subTags?: string[] | null
  isFree: boolean
  price: string | null
  priceMin: number | null
  /** Stored flag. Ask treats it as a wider net, not a requirement, when the query inferred LGBTIQ+. */
  isLGBTI?: boolean
  views?: number
  _count?: { savedBy: number; attendees: number }
}

function dayKey(date: Date | string): string {
  if (typeof date === 'string') return date.slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function fold(value: string | null | undefined): string {
  return foldSearchText(value)
}

/** Singular/plural and the Market vs Markets tag the catalogue actually stores. */
export function tagForms(word: string): string[] {
  const stem = word.toLowerCase()
  const forms = new Set<string>([stem, stem[0].toUpperCase() + stem.slice(1)])
  if (stem.endsWith('s')) forms.add(stem.slice(0, -1))
  else forms.add(`${stem}s`)
  if (stem === 'market' || stem === 'markets') {
    forms.add('Market')
    forms.add('Markets')
  }
  for (const form of [...forms]) {
    if (form.length > 1) forms.add(form[0].toUpperCase() + form.slice(1).toLowerCase())
  }
  return [...forms]
}

function placeBlob(row: AskRow): string {
  return fold([row.suburb, row.venueName, row.venueAddress].filter(Boolean).join(' '))
}

function titleBlob(row: AskRow): string {
  return fold(row.title)
}

function tagBlob(row: AskRow): string {
  return fold((row.subTags ?? []).join(' '))
}

type Strength = 'title' | 'description' | 'place' | 'tag' | 'partial' | 'lgbti' | 'none'

/** Whole words only, so "market" matches Markets but not Haymarket, and "gay" does not match Gaylard. */
function hasWord(blob: string, word: string): boolean {
  const forms = new Set([word])
  if (word.length > 3 && word.endsWith('s')) forms.add(word.slice(0, -1))
  else forms.add(`${word}s`)
  return blob.split(' ').some((token) => forms.has(token))
}

function tagHit(row: AskRow, word: string): boolean {
  return tagForms(word).some((form) => (row.subTags ?? []).some((tag) => tag.toLowerCase() === form.toLowerCase()))
}

function wordInRow(row: AskRow, blobs: string[], word: string): boolean {
  return blobs.some((blob) => hasWord(blob, word)) || tagHit(row, word)
}

/**
 * Title and description are both real matches. A queer synonym in the title counts
 * for any of gay / queer / lgbt / pride / lgbtiq. The stored flag only adds rows.
 */
function strengthFor(row: AskRow, keywords: string[], widen: boolean): Strength {
  if (!keywords.length && !widen) return 'title'
  const title = titleBlob(row)
  const description = fold(row.description)
  const place = placeBlob(row)
  const tags = tagBlob(row)
  const blobs = [title, description, place, tags]
  const required = keywords.filter((word) => !isLgbtiTerm(word))
  if (required.length) {
    const matched = required.filter((word) => wordInRow(row, blobs, word)).length
    if (matched < required.length) {
      // A relaxed pass (one keyword in SQL) hands back rows that match only some of
      // the person's words. Those are partial matches — ranked by how many words
      // hit — not full matches, and not nothing.
      if (required.length >= 2 && matched > 0) return 'partial'
      return 'none'
    }
  }

  const inTitle = (word: string) => (isLgbtiTerm(word) ? hasLgbtiText(title) : hasWord(title, word))
  if (keywords.length && keywords.every(inTitle) && required.every((word) => hasWord(title, word))) return 'title'
  if (widen && hasLgbtiText(title) && required.every((word) => hasWord(title, word))) return 'title'

  const inDescription = (word: string) => (isLgbtiTerm(word) ? hasLgbtiText(description) : hasWord(description, word))
  if (keywords.length && keywords.every((word) => inDescription(word) || hasWord(title, word)) && required.every((word) => hasWord(title, word) || hasWord(description, word))) return 'description'
  if (widen && hasLgbtiText(description) && required.every((word) => hasWord(title, word) || hasWord(description, word))) return 'description'

  if (keywords.length && keywords.every((word) => hasWord(place, word) || (isLgbtiTerm(word) && hasLgbtiText(place)))) return 'place'
  if (keywords.length && keywords.every((word) => hasWord(tags, word) || tagHit(row, word) || (isLgbtiTerm(word) && hasLgbtiText(tags)))) return 'tag'
  if (widen && row.isLGBTI) return 'lgbti'
  return 'none'
}

/** How many of the person's topic words a row matches at all (any field or tag). */
function matchedWordCount(row: AskRow, required: string[]): number {
  if (!required.length) return 0
  const blobs = [titleBlob(row), fold(row.description), placeBlob(row), tagBlob(row)]
  return required.filter((word) => wordInRow(row, blobs, word)).length
}

function inRange(row: AskRow, filters: Pick<AiFilters, 'dateFrom' | 'dateTo' | 'city' | 'suburb' | 'isFree'>, focusGroup?: BoardAreaGroup): boolean {
  const day = dayKey(row.date)
  if (day < filters.dateFrom || day > filters.dateTo) return false
  // A region board's rows file under its member cities too (Newcastle files
  // under its own name on the Sydney board), so the test is membership in
  // the board's city set — the same set the route's SQL clause reads — not
  // equality with the board's own name.
  if (filters.city && !boardCitiesFor(filters.city).includes(row.city)) return false
  if (filters.suburb) {
    if (focusGroup) {
      // A folded-in place focus (Newcastle, Wollongong) is an area, not text
      // to scan for: membership follows the board's area group — filed city
      // or suburb — the predicate shapeBoard applies. A contains scan for
      // the place's name would drop the area's own suburbs (Hamilton,
      // Dapto), whose listings never have to say the place's name.
      if (!matchesAreaGroup(row, filters.city, focusGroup)) return false
    } else {
      const want = filters.suburb.toLowerCase()
      const blob = placeBlob(row)
      if (!blob.includes(want)) return false
    }
  }
  if (filters.isFree && isPaidListing(row)) return false
  return true
}

/**
 * Title matches come first. A description match still counts when nothing in a
 * title says the word. An inferred LGBTIQ+ topic adds tagged listings behind
 * those title matches; it never removes a listing whose title or description hit.
 */
export function rankAskRows<T extends AskRow>(rows: T[], filters: Pick<AiFilters, 'keywords' | 'category' | 'subTag' | 'dateFrom' | 'dateTo' | 'city' | 'suburb' | 'isFree' | 'lgbtiq'>, limit = ASK_LIMIT): T[] {
  const keywords = filters.keywords.map((word) => word.toLowerCase())
  const required = keywords.filter((word) => !isLgbtiTerm(word))
  const widen = filters.lgbtiq || keywords.some((word) => isLgbtiTerm(word))
  // The area group a folded-in place focus names on this board, if any —
  // resolved exactly as the route resolves it for its SQL narrowing.
  const focusGroup = filters.city && filters.suburb && !CITY_NAMES.includes(filters.suburb) && boardCityForPlace(filters.suburb) === filters.city
    ? areaGroupForPlace(filters.city, filters.suburb)
    : undefined
  const pool = rows.filter((row) => inRange(row, filters, focusGroup))
  const scored = pool.map((row) => ({ row, strength: strengthFor(row, keywords, widen) }))
  const titles = scored.filter((item) => item.strength === 'title')
  const descriptions = scored.filter((item) => item.strength === 'description')
  const places = scored.filter((item) => item.strength === 'place')
  const tags = scored.filter((item) => item.strength === 'tag')
  const partials = scored.filter((item) => item.strength === 'partial')
  const flags = scored.filter((item) => item.strength === 'lgbti')
  let chosen = titles
  if (!keywords.length && !widen) chosen = scored
  else if (titles.length && !widen) chosen = titles
  else if (titles.length) chosen = [...titles, ...descriptions, ...flags]
  // No title matched every word, so the full matches in the weaker tiers stand
  // first and partial matches (the relaxed pass's rows) fill in behind them.
  // A title-tier full match stays exact: "Queen Victoria Market" returns that
  // market, not every other row that happens to say "market".
  else chosen = [...descriptions, ...places, ...tags, ...partials, ...flags]
  const strengthScore: Record<Strength, number> = { title: 5, description: 3, place: 2, tag: 2, partial: 1, lgbti: 1, none: 0 }
  const ranked = chosen
    .map((item) => {
      const title = titleBlob(item.row)
      const hits = keywords.reduce((n, word) => n + (hasWord(title, word) ? 2 : 0), 0)
      const synonym = widen && hasLgbtiText(title) ? 1 : 0
      const categoryBoost = filters.category && item.row.category === filters.category ? 1 : 0
      const subTagBoost = filters.subTag && (item.row.subTags ?? []).includes(filters.subTag) ? 1 : 0
      const partialHits = item.strength === 'partial' ? matchedWordCount(item.row, required) * 30 : 0
      const pop = (item.row._count?.savedBy ?? 0) + (item.row._count?.attendees ?? 0) + Math.min(item.row.views ?? 0, 50) / 50
      return { item, score: strengthScore[item.strength] * 100 + hits * 10 + synonym + categoryBoost + subTagBoost + partialHits + pop }
    })
    .sort((a, b) => b.score - a.score || dayKey(a.item.row.date).localeCompare(dayKey(b.item.row.date)) || (a.item.row.time ?? '').localeCompare(b.item.row.time ?? ''))
  return ranked.slice(0, limit).map((entry) => entry.item.row)
}

/**
 * When every keyword together is too tight, the longest topic word is enough.
 * Four letters is the floor: "food" and "wine" are real topics, while a
 * three-letter needle ("art", "gig") substring-matches half the catalogue.
 */
export function relaxedKeywords(keywords: string[]): string[] | null {
  if (keywords.length < 2) return null
  const longest = [...keywords].sort((a, b) => b.length - a.length)[0]
  if (!longest || longest.length < 4) return null
  return [longest]
}
