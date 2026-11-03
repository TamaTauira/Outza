/**
 * Remember where a listing was seen.
 * Missing columns (migration not applied yet) are ignored so refresh can continue.
 */
import { prisma } from '@/lib/prisma'
import { canonicalizeListingUrl } from '@/lib/event-identity'

function missingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'P2021' || code === 'P2022'
}

export function sessionKeyOf(date: string, time?: string | null): string {
  return `${date}|${time ?? ''}`
}

export async function findEventIdBySourceKey(input: {
  source: string
  externalId?: string | null
  url?: string | null
  date: string
  time?: string | null
}): Promise<string | null> {
  try {
    if (input.externalId) {
      const hit = await prisma.sourceRecord.findFirst({
        where: { source: input.source, externalId: input.externalId },
        select: { eventId: true },
      })
      if (hit) return hit.eventId
    }
    const canonicalUrl = canonicalizeListingUrl(input.url)
    if (!canonicalUrl) return null
    const rows = await prisma.sourceRecord.findMany({
      where: { canonicalUrl },
      select: { eventId: true, sessionKey: true },
      take: 20,
    })
    const sessionKey = sessionKeyOf(input.date, input.time)
    const same = rows.find((row) => row.sessionKey === sessionKey)
    if (same) return same.eventId
    if (rows.length === 1) return rows[0].eventId
    return null
  } catch (err) {
    if (missingRelation(err)) return null
    throw err
  }
}

export async function rememberSource(input: {
  eventId: string
  source: string
  externalId?: string | null
  url?: string | null
  date: string
  time?: string | null
}) {
  try {
    const canonicalUrl = canonicalizeListingUrl(input.url)
    const data = {
      sourceUrl: input.url ?? null,
      externalId: input.externalId || null,
      canonicalUrl,
      sessionKey: sessionKeyOf(input.date, input.time),
      seenAt: new Date(),
      missing: false,
    }
    await prisma.sourceRecord.upsert({
      where: { eventId_source: { eventId: input.eventId, source: input.source } },
      create: { eventId: input.eventId, source: input.source, ...data },
      update: data,
    })
  } catch (err) {
    if (missingRelation(err)) return
    const code = (err as { code?: string })?.code
    if (code === 'P2002') return
    console.error('[source-record] save failed', (err as { message?: string })?.message)
  }
}
