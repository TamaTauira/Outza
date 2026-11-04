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

/** Other public rows that can be the same listing: same city and day, or the same URL that day in any city. */
export function duplicatePeerWhere(row: {
  city: string
  date: Date
  sourceUrl?: string | null
  ticketUrl?: string | null
  organiserUrl?: string | null
}): Prisma.EventWhereInput[] {
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
