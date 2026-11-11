/**
 * Refetch full descriptions for listings that stored a strapline, a teaser,
 * or a 600-character cut. Safe to run again: a row changes only when the
 * source still has a richer write-up and nobody has edited it by hand.
 */
import { prisma } from '@/lib/db'
import { sydneyToday } from '@/lib/event-store'
import {
  descriptionUpdate,
  eventbriteDescriptionFromHtml,
  humanitixDescriptionFromHtml,
  moshtixListingDescription,
  paragraphsFromHtml,
  preferDescription,
  sanitizeDescription,
} from '@/lib/description-text'
import { BCC_DATASET } from '@/lib/sources/brisbane-council'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export type SourceCount = {
  seen: number
  updated: number
  unchanged: number
  locked: number
  failed: number
  noFullerText: number
}

export type BackfillReport = {
  apply: boolean
  sources: Record<string, SourceCount>
  notes: string[]
}

const REFRESHABLE = ['cityofsydney', 'eventbrite', 'humanitix', 'moshtix', 'brisbanecouncil', 'ticketmaster', 'oztix'] as const

function emptyCount(): SourceCount {
  return { seen: 0, updated: 0, unchanged: 0, locked: 0, failed: 0, noFullerText: 0 }
}

function pathOf(url: string | null | undefined): string | null {
  if (!url) return null
  try { return new URL(url).pathname.replace(/\/+$/, '').toLowerCase() } catch { return null }
}

function absolutePath(origin: string, value: string | null | undefined): string | null {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return pathOf(value)
  return pathOf(`${origin}/${value.replace(/^\/+/, '')}`)
}

function cosSlug(url: string | null | undefined): string | null {
  const path = pathOf(url)
  const match = path?.match(/\/events\/([^/]+)$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function bccId(url: string | null | undefined): string | null {
  if (!url) return null
  let text = url
  try { text = decodeURIComponent(url) } catch { /* the raw link still gets a chance */ }
  const match = text.match(/eventid=(\d+)/i)
  return match?.[1] ?? null
}

async function getText(url: string, headers?: Record<string, string>): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json', ...headers }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  let index = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]
      index += 1
      await run(item)
    }
  })
  await Promise.all(workers)
}

type Row = {
  id: string
  source: string
  description: string | null
  sourceUrl: string | null
  ticketUrl: string | null
  title: string
  organiserEditedAt: Date | null
}

async function cosText(row: Row): Promise<string | null> {
  const slug = cosSlug(row.sourceUrl)
  if (!slug) return null
  const raw = await getText(`https://whatson.cityofsydney.nsw.gov.au/api/v1/events/eventsearch/${encodeURIComponent(slug)}`, { Accept: 'application/json' })
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as { description?: unknown; strapline?: unknown }
    return preferDescription(data.description, data.strapline)
  } catch {
    return null
  }
}

async function pageText(row: Row, read: (html: string) => string | null): Promise<string | null> {
  const url = row.sourceUrl || row.ticketUrl
  if (!url) return null
  const html = await getText(url)
  if (!html) return null
  return read(html)
}

async function brisbaneMap(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const raw = await getText(`${BCC_DATASET}?limit=100&offset=${offset}`, { Accept: 'application/json' })
    if (!raw) break
    const json = JSON.parse(raw) as { total_count?: number; results?: { web_link?: string; description?: string }[] }
    total = Number(json.total_count ?? 0)
    const rows = json.results ?? []
    if (!rows.length) break
    for (const row of rows) {
      const id = bccId(row.web_link)
      const text = paragraphsFromHtml(row.description)
      if (id && text) out.set(id, text)
    }
    offset += rows.length
    if (rows.length < 100) break
  }
  return out
}

async function moshtixMap(wanted: Set<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!wanted.size) return out
  const from = new Date().toISOString()
  for (let page = 0; page < 80 && out.size < wanted.size; page++) {
    const res = await fetch('https://api.moshtix.com/v1/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({
        query: `query($page: Int, $from: Date) { viewer { getEvents(pageIndex: $page, pageSize: 50, publicOnly: true, searchableOnly: true, excludeClosed: true, sortBy: STARTDATE, sortByDirection: ASC, eventStartDateFrom: $from) { items { eventUrl teaser description } } } }`,
        variables: { page, from },
      }),
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) break
    const json = await res.json() as { data?: { viewer?: { getEvents?: { items?: { eventUrl?: string; teaser?: string; description?: string }[] } } } }
    const items = json.data?.viewer?.getEvents?.items ?? []
    if (!items.length) break
    for (const item of items) {
      const key = absolutePath('https://www.moshtix.com.au', item.eventUrl)
      if (!key || !wanted.has(key)) continue
      const text = moshtixListingDescription(item.teaser, item.description)
      if (text) out.set(key, text)
    }
    if (items.length < 50) break
  }
  return out
}

async function ticketmasterText(externalId: string, apiKey: string): Promise<string | null> {
  const raw = await getText(`https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(externalId)}.json?apikey=${encodeURIComponent(apiKey)}`, { Accept: 'application/json' })
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as { info?: unknown; pleaseNote?: unknown }
    return preferDescription(data.info, data.pleaseNote)
  } catch {
    return null
  }
}

async function oztixText(row: Row, apiKey: string): Promise<string | null> {
  const path = pathOf(row.sourceUrl || row.ticketUrl)
  if (!path) return null
  const res = await fetch('https://ICGFYQWGTD-dsn.algolia.net/1/indexes/prod_oztix_eventguide/query', {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': 'ICGFYQWGTD',
      'X-Algolia-API-Key': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({ params: `query=${encodeURIComponent(row.title)}&hitsPerPage=5&attributesToRetrieve=EventName,EventDescription,EventUrl&attributesToHighlight=` }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) return null
  const json = await res.json() as { hits?: { EventDescription?: string; EventUrl?: string }[] }
  const hit = (json.hits ?? []).find((item) => absolutePath('https://www.oztix.com.au', item.EventUrl) === path)
  return preferDescription(hit?.EventDescription)
}

export async function runDescriptionBackfill(options: { apply?: boolean; sources?: string[] } = {}): Promise<BackfillReport> {
  const apply = options.apply === true
  const wanted = new Set((options.sources?.length ? options.sources : [...REFRESHABLE]).map((item) => item.toLowerCase()))
  const notes = [
    'Frontier Touring publishes an empty description on the tour page, so those listings keep the one-line billing line.',
    'Curated regulars are written in full on purpose. Nothing there was a cut-down teaser.',
    'Ticketek keeps the longest of description, summary and teaser. The public site is not fetched.',
  ]
  const sources: Record<string, SourceCount> = {}
  for (const name of wanted) sources[name] = emptyCount()

  const rows = await prisma.event.findMany({
    where: {
      source: { in: [...wanted] },
      duplicateOfId: null,
      deletedAt: null,
      communityKey: null,
      date: { gte: sydneyToday() },
    },
    select: {
      id: true, source: true, description: true, sourceUrl: true, ticketUrl: true, title: true, organiserEditedAt: true,
    },
  })
  const overrides = await prisma.eventFieldOverride.findMany({
    where: { active: true, fieldName: 'description', eventId: { in: rows.map((row) => row.id) } },
    select: { eventId: true },
  })
  const locked = new Set(overrides.map((row) => row.eventId))

  const brisbane = wanted.has('brisbanecouncil') ? await brisbaneMap() : new Map<string, string>()
  const moshtixWanted = new Set(
    rows.filter((row) => row.source === 'moshtix').map((row) => pathOf(row.sourceUrl || row.ticketUrl)).filter((item): item is string => !!item),
  )
  const moshtix = wanted.has('moshtix') ? await moshtixMap(moshtixWanted) : new Map<string, string>()
  const tmIds = wanted.has('ticketmaster') && process.env.TICKETMASTER_API_KEY
    ? await prisma.sourceRecord.findMany({
      where: { source: 'ticketmaster', externalId: { not: null }, eventId: { in: rows.filter((row) => row.source === 'ticketmaster').map((row) => row.id) } },
      select: { eventId: true, externalId: true },
    })
    : []
  const tmByEvent = new Map(tmIds.map((row) => [row.eventId, row.externalId]))
  if (wanted.has('ticketmaster') && !process.env.TICKETMASTER_API_KEY) {
    notes.push('Ticketmaster descriptions are no longer cut at 600 characters on the next refresh. This run had no API key, so existing rows were left for that refresh.')
  }
  if (wanted.has('oztix') && !process.env.OZTIX_ALGOLIA_KEY) {
    notes.push('Oztix already stores EventDescription. The 600-character cap is gone, so the next refresh fills anything that was cut. This run had no search key.')
  }

  await pool(rows, 4, async (row) => {
    const count = sources[row.source]
    if (!count) return
    count.seen += 1
    if (row.organiserEditedAt || locked.has(row.id)) {
      count.locked += 1
      return
    }
    let incoming: string | null = null
    try {
      if (row.source === 'cityofsydney') incoming = await cosText(row)
      else if (row.source === 'eventbrite') incoming = await pageText(row, eventbriteDescriptionFromHtml)
      else if (row.source === 'humanitix') incoming = await pageText(row, humanitixDescriptionFromHtml)
      else if (row.source === 'moshtix') incoming = moshtix.get(pathOf(row.sourceUrl || row.ticketUrl) ?? '') ?? null
      else if (row.source === 'brisbanecouncil') incoming = brisbane.get(bccId(row.sourceUrl) ?? '') ?? null
      else if (row.source === 'ticketmaster') {
        const externalId = tmByEvent.get(row.id)
        const key = process.env.TICKETMASTER_API_KEY
        const short = sanitizeDescription(row.description).length >= 580 || sanitizeDescription(row.description).length < 8
        if (externalId && key && short) incoming = await ticketmasterText(externalId, key)
        else incoming = null
      } else if (row.source === 'oztix') {
        const key = process.env.OZTIX_ALGOLIA_KEY
        if (key && sanitizeDescription(row.description).length >= 580) incoming = await oztixText(row, key)
      }
    } catch {
      count.failed += 1
      return
    }
    const next = descriptionUpdate(row.description, incoming)
    if (!incoming) {
      count.noFullerText += 1
      return
    }
    if (!next) {
      count.unchanged += 1
      return
    }
    if (apply) {
      await prisma.event.update({ where: { id: row.id }, data: { description: next } })
    }
    count.updated += 1
  })

  return { apply, sources, notes }
}
