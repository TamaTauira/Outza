import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Stop = { id: string; query?: string | null; city?: string | null }
type Geo = { lat: number; lng: number } | null

const cache = new Map<string, Geo>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const inAu = (lat: number, lng: number) => lat > -44.5 && lat < -9 && lng > 112 && lng < 154.5

/** Photon (komoot, OSM data): free, keyless, Australia bounding box. */
async function photon(q: string): Promise<Geo> {
  const res = await fetch(`https://photon.komoot.io/api/?limit=1&lang=en&bbox=112,-44.5,154.5,-9&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'Outza venue maps (events platform)' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Photon ${res.status}`)
  const c = (await res.json())?.features?.[0]?.geometry?.coordinates
  return Array.isArray(c) && inAu(Number(c[1]), Number(c[0])) ? { lat: Number(c[1]), lng: Number(c[0]) } : null
}

/** OpenStreetMap Nominatim fallback (Australia only, ~1 request/second per their usage policy). */
async function nominatim(q: string): Promise<Geo> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=au&q=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': 'Outza itinerary (events platform)', 'Accept-Language': 'en-AU' },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const rows = await res.json()
  return rows?.[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null
}

/** Free-text geocode: Photon first, Nominatim as backup. Only successful lookups are cached. */
async function geocode(q: string): Promise<Geo> {
  const key = q.toLowerCase().trim()
  if (cache.has(key)) return cache.get(key) ?? null
  for (const provider of [photon, nominatim]) {
    try {
      const geo = await provider(q)
      if (geo) { cache.set(key, geo); return geo }
    } catch (err) {
      console.error('Itinerary geocode failed:', err)
    }
  }
  return null
}

/** Shorter retry query: drop the venue name/street and keep the last parts (suburb, city). */
const simplify = (q: string) => {
  const parts = q.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.length > 2 ? parts.slice(-2).join(', ') : ''
}

const ok = (lat: number | null | undefined, lng: number | null | undefined): Geo => (lat != null && lng != null ? { lat, lng } : null)

/** Resolves coordinates for itinerary stops: Outza events and Local listings from the database, custom stops by address. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const stops: Stop[] = (Array.isArray(body?.stops) ? body.stops : []).filter((s: Stop) => typeof s?.id === 'string').slice(0, 20)
    const out: Record<string, Geo> = {}

    const eventIds = stops.filter((s) => !s.id.startsWith('custom-') && !s.id.startsWith('local-')).map((s) => s.id)
    const localIds = stops.filter((s) => s.id.startsWith('local-')).map((s) => s.id.split('-')[1])
    const [events, locals] = await Promise.all([
      eventIds.length ? prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, latitude: true, longitude: true } }) : [],
      localIds.length ? prisma.localListing.findMany({ where: { id: { in: localIds } }, select: { id: true, lat: true, lng: true } }) : [],
    ])
    const evMap = new Map(events.map((e) => [e.id, ok(e.latitude, e.longitude)]))
    const loMap = new Map(locals.map((l) => [l.id, ok(l.lat, l.lng)]))

    let lookups = 0
    for (const s of stops) {
      let geo: Geo = s.id.startsWith('local-') ? loMap.get(s.id.split('-')[1]) ?? null : evMap.get(s.id) ?? null
      const q = typeof s.query === 'string' ? s.query.trim().slice(0, 200) : ''
      if (!geo && q && lookups < 8) {
        const full = s.city && !q.toLowerCase().includes(s.city.toLowerCase()) ? `${q}, ${s.city}` : q
        if (!cache.has(full.toLowerCase().trim())) { if (lookups) await sleep(1100); lookups++ }
        geo = await geocode(full)
        const short = simplify(full)
        if (!geo && short && lookups < 8) { lookups++; geo = await geocode(short) }
      }
      out[s.id] = geo
    }
    return NextResponse.json({ locations: out })
  } catch (err) {
    console.error('Itinerary locate error:', err)
    return NextResponse.json({ error: 'Could not locate stops' }, { status: 500 })
  }
}
