/**
 * Search over the Local page feed. The items are already limited to one city.
 * A city named in the query does not add rows or switch that city.
 */
import type { AiFilters } from './ai-search-parse'
import { sectionByKey, suburbMatches } from './community-shared'
import { addDaysStr } from './local-shared'
import { isPaidListing } from './quality'
import { foldSearchText } from './search-fold'

export interface LocalSearchItem {
  title: string
  date: string
  section?: string | null
  category?: string | null
  suburb?: string | null
  city?: string | null
  isFree?: boolean
  price?: string | null
  priceMin?: number | null
  blurb?: string | null
  description?: string | null
  venue?: string | null
  venueName?: string | null
  venueAddress?: string | null
  address?: string | null
  postcode?: string | null
  tags?: string[] | null
  subTags?: string[] | null
}

/** Home search fills this in when the person did not name a day. The when control keeps that job here. */
const DEFAULT_SPAN_DAYS = 13
export const LOCAL_SEARCH_CAP_DAYS = 60

const DATE_WORD = /\b(tonight|today|tomorrow|weekend|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|christmas|xmas|nye)\b/i
const YEAR_PHRASE = /\b(?:in|during|for|throughout)\s+20\d{2}\b|\bthis year\b|\bnext year\b/i
const MONTH_WORD = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i
const TOPIC_SKIP = new Set(['and', 'the', 'for', 'with'])

export function localDateBounds(query: string, filters: Pick<AiFilters, 'dateFrom' | 'dateTo'>, today: string): { from: string; to: string } | null {
  const text = query.trim()
  if (!text) return null
  if (filters.dateFrom === today && filters.dateTo === addDaysStr(today, DEFAULT_SPAN_DAYS)) return null
  if (!DATE_WORD.test(text) && !YEAR_PHRASE.test(text)) return null
  return { from: filters.dateFrom, to: filters.dateTo }
}

/** Widen a when-window so a named day still has occurrences, and stop about 60 days out. */
export function localOccurrenceWindow(
  base: { from: string; to: string },
  bounds: { from: string; to: string } | null,
  today: string,
): { from: string; to: string } {
  if (!bounds) return base
  const cap = addDaysStr(today, LOCAL_SEARCH_CAP_DAYS)
  const boundFrom = bounds.from > today ? bounds.from : today
  const from = boundFrom < base.from ? boundFrom : base.from
  let to = bounds.to > base.to ? bounds.to : base.to
  if (to > cap) to = cap
  if (from > to) return { from: base.from, to: base.to > cap ? cap : base.to }
  return { from, to }
}

function postcodesIn(query: string, filters: Pick<AiFilters, 'dateFrom' | 'dateTo'>): string[] {
  const codes = [...new Set([...query.matchAll(/\b(\d{4})\b/g)].map((match) => match[1]))]
  if (!codes.length) return []
  if (YEAR_PHRASE.test(query) || MONTH_WORD.test(query)) {
    const years = new Set([filters.dateFrom.slice(0, 4), filters.dateTo.slice(0, 4)])
    return codes.filter((code) => !years.has(code))
  }
  return codes
}

function topicWords(filters: Pick<AiFilters, 'keywords' | 'category' | 'subTag'>): string[] {
  const keywords = filters.keywords.map((word) => word.toLowerCase()).filter(Boolean)
  if (keywords.length) return [...new Set(keywords)]
  const extra = [filters.subTag, filters.category]
    .flatMap((value) => (value ?? '').toLowerCase().split(/[^a-z0-9]+/))
    .filter((word) => word.length > 2 && !TOPIC_SKIP.has(word))
  return [...new Set(extra)]
}

function hasWord(blob: string, word: string): boolean {
  const forms = new Set([word])
  if (word.length > 3 && word.endsWith('s')) forms.add(word.slice(0, -1))
  else forms.add(`${word}s`)
  return blob.split(' ').some((token) => forms.has(token))
}

function listingText(item: LocalSearchItem): string {
  const section = sectionByKey(item.section)
  return foldSearchText([
    item.title,
    item.blurb,
    item.description,
    item.suburb,
    item.section,
    item.category,
    section?.label,
    section?.short,
    section?.boardCategory,
    ...(section?.subTags ?? []),
    ...(item.tags ?? []),
    ...(item.subTags ?? []),
    item.venue,
    item.venueName,
    item.venueAddress,
    item.address,
  ].filter(Boolean).join(' '))
}

function placeText(item: LocalSearchItem): string {
  return [item.suburb, item.address, item.venueAddress, item.venueName, item.venue, item.postcode].filter(Boolean).join(' ')
}

function listingIsFree(item: LocalSearchItem): boolean {
  if (isPaidListing({ price: item.price, priceMin: item.priceMin ?? null })) return false
  if (item.isFree === true) return true
  if (item.isFree === false) return false
  const price = (item.price ?? '').trim()
  if (!price) return true
  return /^free\b/i.test(price)
}

function matchesSuburb(item: LocalSearchItem, suburb: string): boolean {
  if (suburbMatches(item.suburb, suburb)) return true
  const needle = foldSearchText(suburb)
  if (!needle) return true
  const blob = foldSearchText(placeText(item))
  if (blob.includes(needle)) return true
  return needle.split(' ').every((word) => hasWord(blob, word))
}

function matchesPostcode(item: LocalSearchItem, code: string): boolean {
  return new RegExp(`(?:^|\\D)${code}(?:\\D|$)`).test(placeText(item))
}

/**
 * Keep the feed rows that match a parsed Local search.
 * An empty query returns the same rows: the when, category and suburb controls already applied.
 */
export function filterLocalSearch<T extends LocalSearchItem>(items: T[], filters: AiFilters, query: string, today: string): T[] {
  const text = query.replace(/\s+/g, ' ').trim()
  if (!text) return items
  const bounds = localDateBounds(text, filters, today)
  const from = bounds && bounds.from < today ? today : bounds?.from
  const topics = topicWords(filters)
  const postcodes = postcodesIn(text, filters)
  const haystacks = topics.length ? items.map((item) => listingText(item)) : []
  return items.filter((item, index) => {
    const day = item.date.slice(0, 10)
    if (bounds && from && (day < from || day > bounds.to)) return false
    if (filters.isFree && !listingIsFree(item)) return false
    if (filters.paidOnly && listingIsFree(item)) return false
    if (filters.suburb && !matchesSuburb(item, filters.suburb)) return false
    if (postcodes.some((code) => !matchesPostcode(item, code))) return false
    if (topics.length && !topics.every((word) => hasWord(haystacks[index], word))) return false
    return true
  })
}
