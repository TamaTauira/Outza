import { createHash } from 'crypto'
import { prisma } from '@/lib/db'
import { completeJson, llmConfigured } from '@/lib/llm'
import { CITIES, cityDef } from '@/lib/cities'
import {
  LOCAL_CATEGORIES, RECURRENCES, MAX_AHEAD_DAYS, MAX_RECUR_DAYS, MAX_SPAN_DAYS,
  addDaysStr, diffDays, isDateStr, isTimeStr, lastDate, occurrences, todayIn,
} from '@/lib/local-shared'

export const ipHash = (req: Request) => {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  return createHash('sha256').update(`outza-local:${ip}`).digest('hex').slice(0, 32)
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export interface LocalInput {
  title: string; category: string; description: string; address: string; suburb: string; postcode: string; city: string
  startDate: string; endDate: string | null; startTime: string; endTime: string; recurrence: string; recurUntil: string | null
  priceNote: string | null; organiserName: string; contactEmail: string; websiteUrl: string | null
}

/** Validates and normalises a submission. Returns an error message for the user, or the clean input. */
export function parseLocal(b: Record<string, unknown>): { error: string } | { input: LocalInput } {
  const title = clean(b.title, 100)
  const description = String(b.description ?? '').trim().slice(0, 1500)
  const category = clean(b.category, 20)
  const city = clean(b.city, 40)
  const recurrence = clean(b.recurrence, 20) || 'NONE'
  const postcode = clean(b.postcode, 4)
  if (title.length < 5) return { error: 'Please give your listing a title (at least 5 characters).' }
  if (description.length < 20) return { error: 'Please describe what’s on (at least 20 characters).' }
  if (!LOCAL_CATEGORIES.some((c) => c.key === category)) return { error: 'Please choose a category.' }
  if (!CITIES.some((c) => c.name === city)) return { error: 'Please choose a city.' }
  if (!RECURRENCES.some((r) => r.key === recurrence)) return { error: 'Please choose how often it runs.' }
  const address = clean(b.address, 160)
  const suburb = clean(b.suburb, 60)
  if (address.length < 5 || !/\d/.test(address)) return { error: 'Please enter the street address, including the street number.' }
  if (suburb.length < 2) return { error: 'Please enter the suburb.' }
  if (!/^\d{4}$/.test(postcode)) return { error: 'Please enter a 4-digit postcode.' }

  const tz = cityDef(city).tz
  const today = todayIn(tz)
  if (!isDateStr(b.startDate)) return { error: 'Please choose a date.' }
  const startDate = b.startDate
  if (startDate < today) return { error: 'The date has already passed.' }
  if (diffDays(today, startDate) > MAX_AHEAD_DAYS) return { error: 'Listings can be added up to a year ahead.' }
  if (!isTimeStr(b.startTime) || !isTimeStr(b.endTime)) return { error: 'Please enter a start and finish time.' }
  if (b.endTime <= b.startTime) return { error: 'The finish time must be after the start time.' }

  let endDate: string | null = null
  let recurUntil: string | null = null
  if (recurrence === 'NONE') {
    if (b.endDate && isDateStr(b.endDate) && b.endDate > startDate) {
      if (diffDays(startDate, b.endDate) >= MAX_SPAN_DAYS) return { error: `A one-off sale can run for up to ${MAX_SPAN_DAYS} days.` }
      endDate = b.endDate
    }
  } else {
    const cap = addDaysStr(startDate, MAX_RECUR_DAYS)
    recurUntil = b.recurUntil && isDateStr(b.recurUntil) ? (b.recurUntil < cap ? b.recurUntil : cap) : cap
    if (recurUntil < startDate) return { error: 'The “repeat until” date is before the first date.' }
  }

  const contactEmail = clean(b.contactEmail, 200).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { error: 'Please enter a valid contact email (it isn’t shown publicly).' }
  const organiserName = clean(b.organiserName, 80)
  if (organiserName.length < 2) return { error: 'Please tell us who is running it.' }
  let websiteUrl: string | null = clean(b.websiteUrl, 300) || null
  if (websiteUrl) {
    try { const u = new URL(/^https?:\/\//.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`); if (!/^https?:$/.test(u.protocol)) throw 0; websiteUrl = u.toString() }
    catch { return { error: 'That website link doesn’t look right.' } }
  }
  if (b.isPublic !== true) return { error: 'Please confirm this is open to the public. Private or invitation-only events can’t be listed.' }
  return { input: { title, category, description, address, suburb, postcode, city, startDate, endDate, startTime: b.startTime, endTime: b.endTime, recurrence, recurUntil, priceNote: clean(b.priceNote, 80) || null, organiserName, contactEmail, websiteUrl } }
}

// ---------- moderation ----------
const PRIVATE = /\b(birthday party|bday party|invite[- ]only|invitation[- ]only|by invitation|private (party|function|event|gathering)|wedding (reception|ceremony)|hens? (night|party)|bucks? (night|party)|baby shower|engagement party|family only|guests only)\b/i
const BANNED = /\b(crypto|bitcoin|forex|casino|betting tips|viagra|cialis|escort|onlyfans|payday loan|make money fast|work from home income|weight ?loss pills?|adult (content|services)|xxx)\b/i
const WEAPONS = /\b(guns?|firearms?|ammunition|ammo|vapes?|nicotine|prescription (drugs|meds))\s+(for sale|sale|available)\b/i

export function spamSignals(i: LocalInput, filledMs: number | null): string[] {
  const s: string[] = []
  const text = `${i.title} ${i.description}`
  if (filledMs !== null && filledMs < 4000) s.push('form filled too fast')
  if ((text.match(/https?:\/\//g) ?? []).length > 2) s.push('many links')
  if (i.title.length > 12 && i.title === i.title.toUpperCase() && /[A-Z]/.test(i.title)) s.push('all caps title')
  if (/(.)\1{6,}/.test(text)) s.push('repeated characters')
  if (/\b(whatsapp|telegram|dm me|text me on)\b/i.test(text) && /\+?\d[\d\s]{8,}/.test(text)) s.push('off-platform contact push')
  return s
}

/** Hard blocks the user is told about straight away. */
export function hardBlock(i: LocalInput): string | null {
  const text = `${i.title} ${i.description}`
  if (PRIVATE.test(text)) return 'VibePeep Local is for events open to the public. Private or invitation-only gatherings (like birthday parties) can’t be listed.'
  if (BANNED.test(text) || WEAPONS.test(text)) return 'This listing includes content we can’t accept. See our listing rules on this page.'
  return null
}

/** Optional AI moderation pass. Never rewrites content; only says whether a human should look. Fails open to "review" only on explicit concerns. */
export async function aiModeration(i: LocalInput): Promise<string | null> {
  if (!llmConfigured()) return null
  try {
    const out = await completeJson({
      temperature: 0,
      maxOutputTokens: 120,
      timeoutMs: 12000,
      messages: [
        { role: 'system', content: 'You moderate public community listings (garage sales, clearance sales, markets, community activities) for an Australian events site. Reply JSON {"ok": boolean, "reason": string}. ok=false if the listing is spam, a scam, hateful, sexual, illegal goods, a private/invitation-only event, a job ad, a rental/real-estate ad, or not a real-world public event or sale. Otherwise ok=true and reason "".' },
        { role: 'user', content: JSON.stringify({ title: i.title, category: i.category, description: i.description, organiser: i.organiserName }) },
      ],
    })
    return out.ok === false ? clean(out.reason, 200) || 'Flagged by automated moderation' : null
  } catch (e: any) {
    console.error('Local AI moderation skipped:', e?.message)
    return null
  }
}

// ---------- address validation ----------
const rad = (d: number) => (d * Math.PI) / 180
export function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Geocodes the address with OpenStreetMap Nominatim (light, one request per submission). */
export async function validateAddress(i: LocalInput): Promise<{ lat: number | null; lng: number | null; verified: boolean; outside: boolean }> {
  const c = cityDef(i.city)
  try {
    const q = new URLSearchParams({ street: i.address, city: i.suburb, state: c.state, postalcode: i.postcode, country: 'Australia', format: 'json', limit: '1', countrycodes: 'au' })
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': 'VibePeepLocal/1.0 (address validation for community listings)', 'Accept-Language': 'en-AU' }, signal: AbortSignal.timeout(6000) })
    const rows = res.ok ? await res.json() : []
    let hit = Array.isArray(rows) && rows[0] ? rows[0] : null
    if (!hit) { // fall back to suburb + postcode centre
      const r2 = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ city: i.suburb, state: c.state, postalcode: i.postcode, country: 'Australia', format: 'json', limit: '1' })}`, { headers: { 'User-Agent': 'VibePeepLocal/1.0' }, signal: AbortSignal.timeout(6000) })
      const rr = r2.ok ? await r2.json() : []
      const sub = Array.isArray(rr) && rr[0] ? rr[0] : null
      if (!sub) return { lat: null, lng: null, verified: false, outside: false }
      const lat = Number(sub.lat), lng = Number(sub.lon)
      return { lat, lng, verified: false, outside: km(c.lat, c.lng, lat, lng) > c.radiusKm * 1.5 }
    }
    const lat = Number(hit.lat), lng = Number(hit.lon)
    return { lat, lng, verified: true, outside: km(c.lat, c.lng, lat, lng) > c.radiusKm * 1.5 }
  } catch (e: any) {
    console.error('Address validation unavailable:', e?.message)
    return { lat: null, lng: null, verified: false, outside: false }
  }
}

// ---------- duplicate detection ----------
const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'at', 'in', 'on', 'for', 'sale', 'sales', 'market', 'markets', 'garage', 'moving', 'community', 'weekly', 'pop', 'up', 'event'])
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w)))
export function similarity(a: string, b: string) {
  const A = tokens(a), B = tokens(b)
  if (!A.size || !B.size) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0
  let inter = 0
  A.forEach((w) => { if (B.has(w)) inter++ })
  return inter / (A.size + B.size - inter)
}
const normAddr = (s: string) => s.toLowerCase().replace(/\b(street|st|road|rd|avenue|ave|parade|pde|lane|ln|drive|dr)\b/g, '').replace(/[^a-z0-9]/g, '')

/** Finds an existing live listing (or board event) that looks like the same thing on an overlapping date. */
export async function findDuplicate(i: LocalInput, excludeId?: string): Promise<{ id: string; title: string; kind: 'local' | 'event' } | null> {
  const span = occurrences(i, i.startDate, addDaysStr(i.startDate, 60))
  const dates = new Set(span)
  const candidates = await prisma.localListing.findMany({
    where: { city: i.city, status: { in: ['APPROVED', 'PENDING'] }, expiresAt: { gte: new Date() }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, title: true, address: true, suburb: true, startDate: true, endDate: true, recurrence: true, recurUntil: true },
    take: 500,
  })
  for (const c of candidates) {
    const sameAddr = normAddr(c.address) === normAddr(i.address) && c.suburb.toLowerCase() === i.suburb.toLowerCase()
    const sim = similarity(c.title, i.title)
    if (!(sameAddr || sim >= 0.6)) continue
    const theirs = occurrences(c, i.startDate, addDaysStr(i.startDate, 60))
    if (theirs.some((d) => dates.has(d))) return { id: c.id, title: c.title, kind: 'local' }
  }
  // Board events (e.g. curated markets) on the same first date
  const day = new Date(`${i.startDate}T00:00:00Z`)
  const evs = await prisma.event.findMany({
    where: { city: i.city, date: { gte: new Date(day.getTime() - 86400000), lte: new Date(day.getTime() + 2 * 86400000) } },
    select: { id: true, title: true }, take: 400,
  })
  const ev = evs.find((e) => similarity(e.title, i.title) >= 0.7)
  return ev ? { id: ev.id, title: ev.title, kind: 'event' } : null
}

/** Listing stays visible until the end of its last day (local time ≈ next day UTC). */
export const expiryFor = (i: LocalInput) => new Date(`${addDaysStr(lastDate(i), 1)}T14:00:00Z`)

export async function recentCount(hash: string, email: string) {
  const since = new Date(Date.now() - 86400000)
  const [byIp, byEmail] = await Promise.all([
    prisma.localListing.count({ where: { ipHash: hash, createdAt: { gte: since } } }),
    prisma.localListing.count({ where: { contactEmail: email, createdAt: { gte: since } } }),
  ])
  return Math.max(byIp, byEmail)
}
