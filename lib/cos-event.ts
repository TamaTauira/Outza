/**
 * City of Sydney What's On. Search hits carry a strapline.
 * The event record's description is the full write-up.
 */
import { toSydneyParts } from '@/lib/event-store-parts'
import { preferDescription } from '@/lib/description-text'
import { readPriceRows } from '@/lib/price'

export type CosWhen = {
  date: string | null
  time: string | null
  endDate: string | null
  endTime: string | null
}

function parse12h(s: string): string | null {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/)
  if (!m) return null
  let h = parseInt(m[1], 10) % 12
  if (m[3] === 'pm') h += 12
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`
}

function instant(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Local date and clock for a search hit. Legacy string times still parse. */
export function cosWhen(hit: {
  upcomingDate?: unknown
  upcomingDateStart?: unknown
  upcomingDateEnd?: unknown
  isUpcomingAllDayEvent?: unknown
  eventUpcomingTime?: unknown
  dates?: unknown
}): CosWhen {
  const legacyDate = typeof hit.upcomingDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(hit.upcomingDate)
    ? hit.upcomingDate.slice(0, 10)
    : null
  const start = instant(hit.upcomingDateStart)
  if (!start && legacyDate) {
    const [from, to] = String(hit.eventUpcomingTime ?? '').split(/\s+to\s+/)
    return { date: legacyDate, time: from ? parse12h(from) : null, endDate: null, endTime: to ? parse12h(to) : null }
  }
  if (!start) {
    const first = Array.isArray(hit.dates) ? hit.dates[0] : null
    const fallback = typeof first === 'string' && /^\d{4}-\d{2}-\d{2}/.test(first) ? first.slice(0, 10) : null
    return { date: fallback, time: null, endDate: null, endTime: null }
  }
  const local = toSydneyParts(start, 'Australia/Sydney')
  const endInstant = instant(hit.upcomingDateEnd)
  const end = endInstant ? toSydneyParts(endInstant, 'Australia/Sydney') : null
  const allDay = hit.isUpcomingAllDayEvent === true || hit.isUpcomingAllDayEvent === 'true'
  const endDate = end && end.date !== local.date ? end.date : null
  if (allDay) {
    return { date: local.date, time: '00:00', endDate, endTime: endDate ? null : '23:59' }
  }
  return {
    date: local.date,
    time: local.time,
    endDate,
    endTime: end?.time ?? null,
  }
}

/** `{ category, value }` rows from the current API, or the older `{ label, price }` rows. */
export function cosPriceText(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (text.startsWith('[') || text.startsWith('{')) {
      try { return cosPriceText(JSON.parse(text)) } catch { return readPriceRows([{ price: text }]).price }
    }
    return readPriceRows([{ price: text }]).price
  }
  if (Array.isArray(raw)) {
    const rows = raw.map((row) => {
      if (row && typeof row === 'object') {
        const item = row as { label?: unknown; category?: unknown; price?: unknown; value?: unknown }
        return { label: String(item.label ?? item.category ?? ''), price: item.price ?? item.value }
      }
      return { price: row }
    })
    return readPriceRows(rows).price
  }
  if (typeof raw === 'object') {
    const item = raw as { label?: unknown; category?: unknown; price?: unknown; value?: unknown }
    return readPriceRows([{ label: String(item.label ?? item.category ?? ''), price: item.price ?? item.value }]).price
  }
  return null
}

export function cosDescriptionFromRecord(record: { description?: unknown; strapline?: unknown } | null | undefined): string | null {
  return preferDescription(record?.description, record?.strapline)
}

type Hit = Record<string, unknown>

/** Events embedded in a What's On page: the old Next search payload, or Sitecore prefetch. */
export function cosHitsFromHtml(html: string): Hit[] {
  const hits: Hit[] = []
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (next) {
    try {
      const data = JSON.parse(next[1]) as { props?: { pageProps?: { searchResults?: { hits?: Hit[] }; sectionAdditionalData?: unknown } } }
      const listed = data?.props?.pageProps?.searchResults?.hits
      if (Array.isArray(listed)) hits.push(...listed)
      const extra: Hit[] = []
      const walk = (node: unknown) => {
        if (Array.isArray(node)) node.forEach(walk)
        else if (node && typeof node === 'object') {
          const item = node as Hit
          if (item.type === 'Event' && item.objectID && Array.isArray(item.dates)) extra.push(item)
          Object.values(item).forEach(walk)
        }
      }
      walk(data?.props?.pageProps?.sectionAdditionalData)
      hits.push(...extra)
    } catch { /* keep going */ }
  }
  const jss = html.match(/<script type="application\/json" id="__JSS_STATE__">([\s\S]*?)<\/script>/)
  if (jss) {
    try {
      const data = JSON.parse(jss[1]) as { sitecore?: { context?: { eventSearchPrefetch?: unknown } } }
      const prefetch = data?.sitecore?.context?.eventSearchPrefetch
      if (Array.isArray(prefetch)) {
        for (const block of prefetch) {
          const events = (block as { data?: { events?: Hit[] } })?.data?.events
          if (Array.isArray(events)) hits.push(...events)
        }
      }
    } catch { /* ignore a broken state blob */ }
  }
  return hits
}
