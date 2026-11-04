/**
 * Duplicate comparison is not limited to one city.
 * A shared listing URL on the same date is one row wherever the city column says.
 */
import type { Prisma } from '@prisma/client'
import { canonicalizeListingUrl, listingUrlAliases } from '@/lib/event-identity'

export function duplicateGroupKeys(row: {
  city?: string | null
  date: string
  urls: (string | null | undefined)[]
}): string[] {
  const keys = new Set<string>()
  if (row.city) keys.add(`city:${row.city}|${row.date}`)
  for (const raw of row.urls) {
    const url = canonicalizeListingUrl(raw)
    if (url) keys.add(`url:${url}|${row.date}`)
  }
  return [...keys]
}

type PeerRow = {
  city: string
  date: Date
  sourceUrl?: string | null
  ticketUrl?: string | null
  organiserUrl?: string | null
}

/** Other public rows that can be the same listing: same city and day, or the same URL that day in any city. */
export function duplicatePeerWhere(row: PeerRow): Prisma.EventWhereInput[] {
  const clauses: Prisma.EventWhereInput[] = [{ city: row.city, date: row.date }]
  const seen = new Set<string>()
  for (const raw of [row.sourceUrl, row.ticketUrl, row.organiserUrl]) {
    for (const url of listingUrlAliases(raw)) {
      if (seen.has(url)) continue
      seen.add(url)
      clauses.push({
        date: row.date,
        OR: [{ sourceUrl: url }, { ticketUrl: url }, { organiserUrl: url }],
      })
    }
  }
  return clauses
}

/** One clause per city-day and per listing URL on that day. Repeated touches do not widen the read. */
export function duplicatePeerClauses(rows: PeerRow[]): Prisma.EventWhereInput[] {
  const seen = new Set<string>()
  const clauses: Prisma.EventWhereInput[] = []
  for (const row of rows) {
    for (const clause of duplicatePeerWhere(row)) {
      const key = JSON.stringify(clause, (_name, value) => value instanceof Date ? value.toISOString() : value)
      if (seen.has(key)) continue
      seen.add(key)
      clauses.push(clause)
    }
  }
  return clauses
}
