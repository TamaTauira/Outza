import { isPaidListing } from '@/lib/quality'
import type { AiFilters } from '@/lib/ai-search-parse'

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
  views?: number
  _count?: { savedBy: number; attendees: number }
}

function dayKey(date: Date | string): string {
  if (typeof date === 'string') return date.slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function fold(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[-–—'’]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

type Strength = 'title' | 'place' | 'tag' | 'none'

/** Whole words only, so "market" matches Markets but not Haymarket. */
function hasWord(blob: string, word: string): boolean {
  const forms = new Set([word])
  if (word.length > 3 && word.endsWith('s')) forms.add(word.slice(0, -1))
  else forms.add(`${word}s`)
  return blob.split(' ').some((token) => forms.has(token))
}

function strengthFor(row: AskRow, keywords: string[]): Strength {
  if (!keywords.length) return 'title'
  const title = titleBlob(row)
  const place = placeBlob(row)
  const tags = tagBlob(row)
  if (keywords.every((word) => hasWord(title, word))) return 'title'
  if (keywords.every((word) => hasWord(place, word))) return 'place'
  const inTag = keywords.every((word) => hasWord(tags, word) || tagForms(word).some((form) => (row.subTags ?? []).some((tag) => tag.toLowerCase() === form.toLowerCase())))
  return inTag ? 'tag' : 'none'
}

function inRange(row: AskRow, filters: Pick<AiFilters, 'dateFrom' | 'dateTo' | 'city' | 'suburb' | 'isFree'>): boolean {
  const day = dayKey(row.date)
  if (day < filters.dateFrom || day > filters.dateTo) return false
  if (filters.city && row.city !== filters.city) return false
  if (filters.suburb) {
    const want = filters.suburb.toLowerCase()
    const blob = placeBlob(row)
    if (!blob.includes(want)) return false
  }
  if (filters.isFree && isPaidListing(row)) return false
  return true
}

/**
 * Keep title matches ahead of a sub-tag-only hit, and drop description-only noise
 * when a real title match exists. A keyword query with no title or tag hit returns nothing.
 */
export function rankAskRows<T extends AskRow>(rows: T[], filters: Pick<AiFilters, 'keywords' | 'category' | 'subTag' | 'dateFrom' | 'dateTo' | 'city' | 'suburb' | 'isFree'>, limit = ASK_LIMIT): T[] {
  const keywords = filters.keywords.map((word) => word.toLowerCase())
  const pool = rows.filter((row) => inRange(row, filters))
  const scored = pool.map((row) => ({ row, strength: strengthFor(row, keywords) }))
  const titles = scored.filter((item) => item.strength === 'title')
  const places = scored.filter((item) => item.strength === 'place')
  const tags = scored.filter((item) => item.strength === 'tag')
  let chosen = titles
  if (!keywords.length) chosen = scored
  else if (titles.length) chosen = titles
  else if (places.length) chosen = places
  else chosen = tags
  const ranked = chosen
    .map((item) => {
      const title = titleBlob(item.row)
      const hits = keywords.reduce((n, word) => n + (title.includes(word) ? 2 : 0), 0)
      const categoryBoost = filters.category && item.row.category === filters.category ? 1 : 0
      const pop = (item.row._count?.savedBy ?? 0) + (item.row._count?.attendees ?? 0) + Math.min(item.row.views ?? 0, 50) / 50
      return { item, score: hits * 10 + categoryBoost + pop }
    })
    .sort((a, b) => b.score - a.score || dayKey(a.item.row.date).localeCompare(dayKey(b.item.row.date)) || (a.item.row.time ?? '').localeCompare(b.item.row.time ?? ''))
  return ranked.slice(0, limit).map((entry) => entry.item.row)
}

/** When every keyword together is too tight, the longest topic word is enough. */
export function relaxedKeywords(keywords: string[]): string[] | null {
  if (keywords.length < 2) return null
  const longest = [...keywords].sort((a, b) => b.length - a.length)[0]
  if (!longest || longest.length < 5) return null
  return [longest]
}
