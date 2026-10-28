import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import { CITIES, cityDef } from '@/lib/cities'
import { addDaysStr, diffDays, isTimeStr, lastDate, localDupKey, occurrences, todayIn, MAX_SPAN_DAYS, type RecurringShape } from '@/lib/local-shared'

/**
 * Fills OUTZA Local from public listings Outza already ingests for the main board
 * (official market/organiser sites, City of Sydney What's On, Eventbrite, Humanitix, Moshtix, Oztix).
 * Facts only (title, date, time, place, price, original link) — no images, no private events.
 * Every imported row keeps its source and links back to the original listing.
 */
export const LOCAL_IMPORT_SOURCES: Record<string, string> = {
  curated: 'the organiser’s official website',
  cityofsydney: 'City of Sydney What’s On',
  eventbrite: 'Eventbrite',
  humanitix: 'Humanitix',
  moshtix: 'Moshtix',
  oztix: 'Oztix',
}

const LOCAL_RX = /\b(markets?|fair|fete|bazaar|swap|car boot|garage sale|yard sale|clearance|warehouse sale|sample sale|pop[- ]?up|makers|farmers|fundraiser|community|trivia|run club|picnic|working bee|clean[- ]?up|night market)\b/i
const SKIP_RX = /\b(private|invitation[- ]only|invite[- ]only|members[- ]only|online|webinar|virtual|zoom|conference|summit|masterclass|networking|my fair lady)\b/i
const STATE_RX = /\b(NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/

/** Only genuine sales get a sale type; exhibitions, festivals, classes, trivia etc. are community events. */
export function categoryFor(title: string): string {
  if (/\b(exhibition|sculpture|gallery|festival|class|workshop|tour|trivia|talk|screening|concert|run club|meetup|walk)\b/i.test(title) && !/\b(markets?|garage sale|clearance|warehouse sale|sample sale)\b/i.test(title)) return 'COMMUNITY'
  if (/\b(garage sale|car boot|yard sale|moving sale|swap meet|clothes swap|swap)\b/i.test(title)) return 'GARAGE'
  if (/\b(warehouse sale|clearance|sample sale|stock sale)\b/i.test(title)) return 'WAREHOUSE'
  if (/\b(markets?|marketta|bazaar|farmers|makers|fete|craft fair|pop[- ]?up (shop|store|market|sale)|designer pop[- ]?up|mini-mart|(record|vinyl|book|comic|toy) fair)\b/i.test(title)) return 'MARKET'
  return 'COMMUNITY'
}

/** Splits "2 Rosenthal Ave, Lane Cove, NSW 2066" into street / suburb / postcode. */
function splitAddress(venueName: string, venueAddress: string | null, fallbackSuburb: string) {
  const parts = (venueAddress ?? '').split(',').map((p) => p.trim()).filter(Boolean)
  const postcode = (venueAddress ?? '').match(/\b(\d{4})\b(?!.*\b\d{4}\b)/)?.[1] ?? ''
  const si = parts.findIndex((p) => STATE_RX.test(p))
  // "The Rocks NSW 2000" carries the suburb in the same part as the state; "Lane Cove, NSW 2066" in the part before.
  const inline = si >= 0 ? parts[si].replace(STATE_RX, '').replace(/\d{4}/, '').trim() : ''
  const suburb = inline || (si > 0 ? parts[si - 1] : '')
  const street = (si < 0 ? [] : parts.slice(0, inline ? si : Math.max(0, si - 1))).join(', ')
  const address = street && !venueName.toLowerCase().includes(street.toLowerCase()) ? `${venueName}, ${street}` : venueName
  return { address: address.slice(0, 200), suburb: (suburb || fallbackSuburb).slice(0, 80), postcode }
}

const key = (...p: string[]) => createHash('sha1').update(p.join('|')).digest('hex').slice(0, 20)

interface Row {
  id: string; title: string; description: string | null; date: Date; endDate: Date | null; time: string | null; endTime: string | null
  venueName: string; venueAddress: string | null; suburb: string | null; city: string; isFree: boolean; price: string | null
  ticketUrl: string | null; organiserName: string | null; organiserUrl: string | null; source: string; latitude: number | null; longitude: number | null
}

type Draft = Omit<RecurringShape, 'endDate' | 'recurUntil'> & { endDate: string | null; recurUntil: string | null; row: Row; sourceKey: string }

export async function importLocalFromBoard(): Promise<{ upserted: number; skipped: number }> {
  const since = new Date(Date.now() - 86400000)
  const rows: Row[] = await prisma.event.findMany({
    where: { source: { in: Object.keys(LOCAL_IMPORT_SOURCES) }, date: { gte: since }, duplicateOfId: null, status: 'SCHEDULED', city: { in: CITIES.map((c) => c.name) } },
    select: { id: true, title: true, description: true, date: true, endDate: true, time: true, endTime: true, venueName: true, venueAddress: true, suburb: true, city: true, isFree: true, price: true, ticketUrl: true, organiserName: true, organiserUrl: true, source: true, latitude: true, longitude: true },
    orderBy: { date: 'asc' }, take: 20000,
  })

  let skipped = 0
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const text = `${r.title} ${r.venueName}`
    const ok = (r.source === 'curated' || LOCAL_RX.test(r.title)) && !SKIP_RX.test(text) && isTimeStr(r.time) && isTimeStr(r.endTime) && r.endTime! > r.time!
    if (!ok) { skipped++; continue }
    const g = `${r.source}|${r.city}|${r.title.toLowerCase()}|${r.venueName.toLowerCase()}`
    groups.set(g, [...(groups.get(g) ?? []), r])
  }

  // Weekly runs (same weekday, 7 days apart) become one recurring listing; everything else stays one-off.
  const drafts: Draft[] = []
  for (const [g, list] of groups) {
    const byDow = new Map<number, Row[]>()
    list.forEach((r) => { const d = r.date.getUTCDay(); byDow.set(d, [...(byDow.get(d) ?? []), r]) })
    for (const [dow, rs] of byDow) {
      const dates = [...new Set(rs.map((r) => r.date.toISOString().slice(0, 10)))].sort()
      const weekly = dates.length >= 2 && dates.every((d, i) => i === 0 || diffDays(dates[i - 1], d) === 7)
      if (weekly) {
        drafts.push({ row: rs[0], startDate: dates[0], endDate: null, recurrence: 'WEEKLY', recurUntil: dates[dates.length - 1], sourceKey: `import:${key(g, String(dow))}` })
      } else {
        for (const r of rs) {
          const start = r.date.toISOString().slice(0, 10)
          const end = r.endDate ? r.endDate.toISOString().slice(0, 10) : null
          const span = end && end > start && diffDays(start, end) < MAX_SPAN_DAYS ? end : null
          // Keyed by the event's last day, not the board row id: multi-day events whose start date rolls forward each refresh stay one listing.
          drafts.push({ row: r, startDate: start, endDate: span, recurrence: 'NONE', recurUntil: null, sourceKey: `import:${key(g, 'once', end && end > start ? end : start)}` })
        }
      }
    }
  }

  // Same key twice in one run (e.g. several board rows for one multi-day event): keep the earliest start.
  const unique = new Map<string, Draft>()
  for (const d of drafts) if (!unique.has(d.sourceKey)) unique.set(d.sourceKey, d)

  let upserted = 0
  for (const d of unique.values()) {
    const r = d.row
    if (lastDate(d) < todayIn(cityDef(r.city).tz)) { skipped++; continue }
    const { address, suburb, postcode } = splitAddress(r.venueName, r.venueAddress, r.suburb ?? r.city)
    const data = {
      title: r.title.slice(0, 120), category: categoryFor(r.title),
      description: (r.description?.trim() || r.title).slice(0, 2000),
      address, suburb, postcode, city: r.city,
      lat: r.latitude, lng: r.longitude, addressVerified: r.latitude != null && r.longitude != null,
      startDate: d.startDate, endDate: d.endDate, startTime: r.time!, endTime: r.endTime!,
      recurrence: d.recurrence, recurUntil: d.recurUntil,
      priceNote: r.isFree ? 'Free' : r.price?.slice(0, 60) || null,
      organiserName: (r.organiserName || r.venueName).slice(0, 120),
      contactEmail: '', websiteUrl: r.ticketUrl || r.organiserUrl,
      sourceName: LOCAL_IMPORT_SOURCES[r.source], sourceKey: d.sourceKey,
      expiresAt: new Date(`${addDaysStr(lastDate(d), 1)}T14:00:00Z`),
    }
    try {
      const existing = await prisma.localListing.findFirst({ where: { sourceKey: d.sourceKey }, select: { id: true, status: true } })
        ?? await adoptable(data.title, data.suburb, data.city, data.startTime, d)
      if (existing) {
        // Moderation decisions (rejected/removed/back in review) always stick.
        await prisma.localListing.update({ where: { id: existing.id }, data })
      } else {
        await prisma.localListing.create({ data: { ...data, status: 'APPROVED', flags: ['IMPORTED'] } })
      }
      upserted++
    } catch (e: any) {
      skipped++
      console.error('[local-import] failed for', r.id, e?.message)
    }
  }
  await dedupeLocalListings().catch((e) => console.error('[local-import] dedupe failed', e?.message))
  return { upserted, skipped }
}

const windowFor = (city: string) => { const t = todayIn(cityDef(city).tz); return [t, addDaysStr(t, 180)] as const }
const sharesDate = (a: RecurringShape, b: RecurringShape, city: string) => {
  const [from, to] = windowFor(city)
  const mine = new Set(occurrences(a, from, to))
  return occurrences(b, from, to).some((x) => mine.has(x))
}

/** An earlier import of the same event (old per-row key) is reused instead of creating another copy. */
async function adoptable(title: string, suburb: string, city: string, startTime: string, d: Draft) {
  const rows = await prisma.localListing.findMany({
    where: { title, city, startTime, recurrence: d.recurrence, duplicateOfId: null, flags: { has: 'IMPORTED' } },
    select: { id: true, status: true, title: true, suburb: true, city: true, startDate: true, endDate: true, recurrence: true, recurUntil: true },
    orderBy: { updatedAt: 'desc' }, take: 20,
  })
  const k = localDupKey({ title, suburb, city })
  return rows.find((x) => localDupKey(x) === k && sharesDate(x, d, city)) ?? null
}

/**
 * Hides repeat copies of the same live listing (same title, suburb, city and start time on a shared date).
 * Organiser submissions win over imports, then the most recently refreshed row. Copies are linked via duplicateOfId, never deleted.
 */
export async function dedupeLocalListings(): Promise<number> {
  const rows = await prisma.localListing.findMany({
    where: { status: 'APPROVED', duplicateOfId: null, expiresAt: { gte: new Date() } },
    select: { id: true, title: true, suburb: true, city: true, startTime: true, startDate: true, endDate: true, recurrence: true, recurUntil: true, sourceName: true, updatedAt: true },
    take: 5000,
  })
  const groups = new Map<string, typeof rows>()
  for (const r of rows) { const k = `${localDupKey(r)}|${r.startTime}`; groups.set(k, [...(groups.get(k) ?? []), r]) }
  const links = new Map<string, string[]>()
  for (const list of groups.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => Number(a.sourceName != null) - Number(b.sourceName != null) || b.updatedAt.getTime() - a.updatedAt.getTime())
    const kept: typeof rows = []
    for (const r of list) {
      const twin = kept.find((k) => sharesDate(k, r, r.city))
      if (twin) links.set(twin.id, [...(links.get(twin.id) ?? []), r.id])
      else kept.push(r)
    }
  }
  let n = 0
  for (const [canon, ids] of links) {
    const res = await prisma.localListing.updateMany({ where: { id: { in: ids } }, data: { duplicateOfId: canon } })
    n += res.count
  }
  return n
}
