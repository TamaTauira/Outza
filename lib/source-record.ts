/**
 * Remember where a listing was seen.
 * Missing columns (migration not applied yet) are ignored so refresh can continue.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canonicalizeListingUrl, listingUrlAliases, matchSourceSession, sessionDate } from '@/lib/event-identity'
import { fieldSourcesFromRecords } from '@/lib/linked-fill'

function missingRelation(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'P2021' || code === 'P2022'
}

export function sessionKeyOf(date: string, time?: string | null): string {
  return `${date}|${time ?? ''}`
}

export type SourceKeyHit = {
  eventId: string
  /** The source id moved to a new date. A shared listing URL must not do this. */
  reschedule: boolean
}

export async function findEventIdBySourceKey(input: {
  source: string
  externalId?: string | null
  url?: string | null
  date: string
  time?: string | null
}): Promise<SourceKeyHit | null> {
  try {
    if (input.externalId) {
      const hits = await prisma.sourceRecord.findMany({
        where: { source: input.source, externalId: input.externalId },
        select: { eventId: true, sessionKey: true },
      })
      const matched = matchSourceSession(hits, input)
      if (matched) return { eventId: matched, reschedule: false }
      // One source id changing date is a reschedule. A tour page is not one id.
      if (hits.length === 1 && sessionDate(hits[0].sessionKey) && sessionDate(hits[0].sessionKey) !== input.date) {
        return { eventId: hits[0].eventId, reschedule: true }
      }
      if (hits.length === 1 && !hits[0].sessionKey) return { eventId: hits[0].eventId, reschedule: false }
    }
    const urls = listingUrlAliases(input.url)
    if (!urls.length) return null
    const rows = await prisma.sourceRecord.findMany({
      where: { canonicalUrl: { in: urls } },
      select: { eventId: true, sessionKey: true },
    })
    const matched = matchSourceSession(rows, input)
    return matched ? { eventId: matched, reschedule: false } : null
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

function flagMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return { ...value as Record<string, boolean> }
}

/** Remember which blank fields this linked source filled. A repeat call changes nothing. */
export async function recordContribution(input: {
  eventId: string
  source: string
  fields: string[]
  url?: string | null
  date?: string
  time?: string | null
}) {
  const fields = [...new Set(input.fields.filter(Boolean))]
  if (!fields.length) return
  try {
    const existing = await prisma.sourceRecord.findUnique({
      where: { eventId_source: { eventId: input.eventId, source: input.source } },
      select: { contributed: true },
    })
    const contributed = flagMap(existing?.contributed)
    let changed = !existing
    for (const field of fields) {
      if (!contributed[field]) {
        contributed[field] = true
        changed = true
      }
    }
    if (existing && !changed) return
    const payload = contributed as Prisma.InputJsonValue
    if (!existing) {
      await prisma.sourceRecord.create({
        data: {
          eventId: input.eventId,
          source: input.source,
          contributed: payload,
          sourceUrl: input.url ?? null,
          canonicalUrl: canonicalizeListingUrl(input.url),
          sessionKey: input.date ? sessionKeyOf(input.date, input.time) : null,
          seenAt: new Date(),
          missing: false,
        },
      })
      return
    }
    await prisma.sourceRecord.update({
      where: { eventId_source: { eventId: input.eventId, source: input.source } },
      data: { contributed: payload },
    })
  } catch (err) {
    if (missingRelation(err)) return
    const code = (err as { code?: string })?.code
    if (code === 'P2002') return
    console.error('[source-record] contribution failed', (err as { message?: string })?.message)
  }
}

/** Field → source for values copied onto this listing. Empty when the column is not there yet. */
export async function contributedFieldSources(eventId: string, primary?: string | null): Promise<Record<string, string>> {
  try {
    const rows = await prisma.sourceRecord.findMany({
      where: { eventId },
      select: { source: true, contributed: true },
    })
    return fieldSourcesFromRecords(rows, primary)
  } catch (err) {
    if (missingRelation(err)) return {}
    console.error('[source-record] contributed read failed', (err as { message?: string })?.message)
    return {}
  }
}
