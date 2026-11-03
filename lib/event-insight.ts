/**
 * Listing summary for an event page. Every sentence is built from fields we store.
 * A curated intelligence note is included only when its source is still current.
 * AI rewrites are optional, labelled, and rejected when they add facts.
 */
import { createHash } from 'node:crypto'
import { isReferenceShowable } from '@/lib/intel/reference-freshness'
import { sourceLabel } from '@/lib/quality'

export type InsightSource = {
  kind: 'official' | 'organiser' | 'summary'
  label: string
  url: string | null
  lastChecked: string | null
}

export type EventInsight = {
  heading: string
  disclaimer: string
  sentences: string[]
  match: string | null
  sources: InsightSource[]
  hash: string
  rewrite: string | null
}

export type InsightFacts = {
  title: string
  category: string | null
  city: string | null
  venueName: string | null
  dateLabel: string | null
  time: string | null
  isFree: boolean
  price: string | null
  description: string | null
  accessibilityInfo: string | null
  ageRestriction: string | null
  transportInfo: string | null
  relatedTitles: string[]
  source: string | null
  sourceUrl: string | null
  lastChecked: string | null
  organiserUpdated: boolean
}

export type InsightPrefs = {
  preferredCategories?: string[]
  homeCity?: string | null
  savedInCategory?: number
  followedVenue?: boolean
  freePreferred?: boolean
}

export type CuratedCitation = {
  note: string
  lastVerified: string
  sourceUrl: string
}

const REVIEW = /\b(attendees?\s+(said|loved|raved)|eyewitness|must[- ]see|sold[- ]out|unforgettable|crowd favourite|you will love)\b/i

function clip(value: string | null | undefined, max: number): string | null {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trim()}…`
}

function joinBits(bits: string[]): string {
  if (bits.length === 1) return bits[0]
  return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}`
}

export function insightMatch(facts: Pick<InsightFacts, 'category' | 'city' | 'venueName' | 'isFree'>, prefs: InsightPrefs | null | undefined): string | null {
  if (!prefs) return null
  const bits: string[] = []
  if (facts.category && prefs.preferredCategories?.includes(facts.category)) bits.push(`you follow ${facts.category}`)
  if (facts.city && prefs.homeCity && prefs.homeCity === facts.city) bits.push(`your home city is ${facts.city}`)
  if ((prefs.savedInCategory ?? 0) > 0) bits.push('you have saved similar events')
  if (prefs.followedVenue && facts.venueName) bits.push(`you follow ${facts.venueName}`)
  if (prefs.freePreferred && facts.isFree) bits.push('you set free as the spend you prefer')
  if (!bits.length) return null
  return `Recommended because ${joinBits(bits)}.`
}

export function insightHash(sentences: string[]): string {
  return createHash('sha256').update(sentences.join('\n')).digest('hex').slice(0, 20)
}

/** A rewrite may only repeat numbers and links that already appear in the fact sheet. */
export function rewriteIsGrounded(text: string, allowed: string): boolean {
  const body = text.replace(/\s+/g, ' ').trim()
  if (!body || body.length > 700) return false
  if (REVIEW.test(body)) return false
  const numbers = body.match(/\d[\d:.,]*/g) ?? []
  for (const token of numbers) {
    if (!allowed.includes(token)) return false
  }
  const links = body.match(/https?:\/\/\S+/gi) ?? []
  for (const link of links) {
    if (!allowed.includes(link.replace(/[).,]+$/, ''))) return false
  }
  return true
}

export function buildEventInsight(facts: InsightFacts, prefs?: InsightPrefs | null, curated?: CuratedCitation | null, rewrite?: string | null, asOf = new Date()): EventInsight | null {
  if (!facts.title.trim()) return null
  const sentences: string[] = []
  const place = [facts.venueName, facts.city].filter(Boolean).join(', ')
  const when = [facts.dateLabel, facts.time].filter(Boolean).join(' at ')
  const kind = facts.category ? `${facts.category} ` : ''
  let opener = `${facts.title} is listed`
  if (kind) opener += ` as ${kind.trim()}`
  if (place) opener += ` at ${place}`
  if (when) opener += ` on ${when}`
  sentences.push(`${opener}.`)
  if (facts.isFree) sentences.push('The listing says it is free.')
  else if (facts.price?.trim()) sentences.push(`The listed price is ${facts.price.trim()}.`)
  else sentences.push('No price is listed.')
  const description = clip(facts.description, 180)
  if (description) sentences.push(`The listing says: “${description}”`)
  const practical = [facts.ageRestriction, facts.accessibilityInfo, facts.transportInfo].map((item) => clip(item, 160)).filter((item): item is string => !!item)
  if (practical.length) sentences.push(`The listing also includes: ${practical.join(' ')}`)
  const related = facts.relatedTitles.map((title) => title.trim()).filter(Boolean).slice(0, 3)
  if (related.length) sentences.push(`Also listed nearby: ${related.join('; ')}.`)
  const curatedNote = curated && isReferenceShowable(curated, asOf) ? clip(curated.note, 200) : null
  if (curatedNote) sentences.push(`From a checked reference: ${curatedNote}`)

  const allowed = sentences.join(' ')
  const grounded = rewrite && rewriteIsGrounded(rewrite, allowed) ? rewrite.replace(/\s+/g, ' ').trim() : null
  const sources: InsightSource[] = [{
    kind: 'official',
    label: `Published listing from ${sourceLabel(facts.source)}`,
    url: facts.sourceUrl && /^https?:\/\//i.test(facts.sourceUrl) ? facts.sourceUrl : null,
    lastChecked: facts.lastChecked,
  }]
  if (facts.organiserUpdated) {
    sources.push({ kind: 'organiser', label: 'Updated by organiser', url: null, lastChecked: facts.lastChecked })
  }
  sources.push({
    kind: 'summary',
    label: grounded ? 'Short version written by AI from the listing text' : 'Summary assembled from the listing',
    url: null,
    lastChecked: facts.lastChecked,
  })

  return {
    heading: "Why you'll love this event",
    disclaimer: 'This is a summary of the listing, not an attendee review.',
    sentences,
    match: insightMatch(facts, prefs),
    sources,
    hash: insightHash(sentences),
    rewrite: grounded,
  }
}
