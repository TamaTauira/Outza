import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { coordsFitCity } from '@/lib/travel'
import { geocode, geocodeCached, simplifyQuery, type Geo } from '@/lib/geocode'

export const dynamic = 'force-dynamic'

type Stop = { id: string; query?: string | null; city?: string | null }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const ok = (lat: number | null | undefined, lng: number | null | undefined): Geo => (lat != null && lng != null ? { lat, lng } : null)

/** Resolves coordinates for itinerary stops: VibePeep events and Local listings from the database, custom stops by address. */
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
      if (geo && !coordsFitCity(geo.lat, geo.lng, s.city)) geo = null
      const q = typeof s.query === 'string' ? s.query.trim().slice(0, 200) : ''
      if (!geo && q && lookups < 8) {
        const full = s.city && !q.toLowerCase().includes(s.city.toLowerCase()) ? `${q}, ${s.city}` : q
        if (!geocodeCached(full)) { if (lookups) await sleep(1100); lookups++ }
        geo = await geocode(full)
        const short = simplifyQuery(full)
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
