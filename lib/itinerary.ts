'use client'

import { useCallback, useEffect, useState } from 'react'
import { isPastEvent } from '@/lib/seo'

/** One stop in the visitor's itinerary: an Outza event or their own custom stop (dinner, meet-up…). */
export interface ItineraryItem {
  id: string // event id, or `custom-…`
  kind: 'event' | 'custom'
  title: string
  date: string // YYYY-MM-DD
  time: string | null
  endTime: string | null
  venueName: string | null
  suburb: string | null
  note: string | null
  addedAt: number
  /** Detail link for non-board stops (e.g. OUTZA Local listings); defaults to the event page. */
  href?: string | null
  /** Full address / place text, used for maps and travel times. */
  place?: string | null
  city?: string | null
  lat?: number | null
  lng?: number | null
  /** Set once a location lookup failed, so it isn't retried on every visit. */
  geoFailed?: boolean
  /** Ids of stops the visitor said are fine to overlap with this one (they'll leave early / pop in). */
  okWith?: string[]
  /** Set when the stop came from a paid local recommendation (shown with a Sponsored label). */
  adId?: string | null
}

const KEY = 'outza-itinerary-v1'
const EVT = 'outza-itinerary-change'

function read(): ItineraryItem[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function write(list: ItineraryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    window.dispatchEvent(new Event(EVT))
  } catch (err) {
    console.error('Could not save itinerary:', err)
  }
}

export const sortItinerary = (list: ItineraryItem[]) =>
  [...list].sort((a, b) => `${a.date} ${a.time ?? '99:99'}`.localeCompare(`${b.date} ${b.time ?? '99:99'}`))

const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null)

/** Stops open for this long (markets, fairs, exhibitions) are drop-in windows, not fixed sessions. */
const OPEN_WINDOW_MIN = 180
/** A drop-in window still works if this much of it is free around the other stop. */
const MIN_VISIT_MIN = 60

/** End minute of a stop; an end time earlier than the start means it runs past midnight. */
const endMin = (s: number, end: string | null) => {
  const e = toMin(end)
  if (e === null) return s + 120
  return e <= s ? e + 1440 : e
}

/** Whether two stops' times genuinely conflict on the same day.
 *  Long drop-in windows (e.g. a market open 10:00–16:00) only clash when the other stop leaves too little free time to visit. */
function pairClashes(a: ItineraryItem, b: ItineraryItem): boolean {
  const as = toMin(a.time), bs = toMin(b.time)
  if (a.date !== b.date || as === null || bs === null) return false
  const ae = endMin(as, a.endTime), be = endMin(bs, b.endTime)
  if (!(as < be && bs < ae)) return false
  // Free time left in a window once the other stop is taken out of it (the longest gap before or after).
  const freeIn = (s: number, e: number, os: number, oe: number) => Math.max(Math.max(0, Math.min(e, os) - s), Math.max(0, e - Math.max(s, oe)))
  const aOpen = ae - as >= OPEN_WINDOW_MIN && freeIn(as, ae, bs, be) >= MIN_VISIT_MIN
  const bOpen = be - bs >= OPEN_WINDOW_MIN && freeIn(bs, be, as, ae) >= MIN_VISIT_MIN
  return !(aOpen || bOpen)
}

/** For each stop, the ids of other stops it overlaps with. Pairs the visitor dismissed (okWith) are left out. */
export function clashMap(list: ItineraryItem[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const push = (k: string, v: string) => out.set(k, [...(out.get(k) ?? []), v])
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j]
    if (a.okWith?.includes(b.id) || b.okWith?.includes(a.id)) continue
    if (pairClashes(a, b)) { push(a.id, b.id); push(b.id, a.id) }
  }
  return out
}

/** The visitor's itinerary, kept on this device and in sync across components and tabs. Separate from saved favourites. */
export function useItinerary() {
  const [items, setItems] = useState<ItineraryItem[]>([])
  useEffect(() => {
    // Stops on days before today are never shown
    const sync = () => setItems(read().filter((i) => !i.date || !isPastEvent(i)))
    sync()
    window.addEventListener(EVT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync) }
  }, [])

  const has = useCallback((id: string) => items.some((i) => i.id === id), [items])
  const add = useCallback((item: Omit<ItineraryItem, 'addedAt'>) => {
    const list = read()
    if (list.some((i) => i.id === item.id)) return
    write([...list, { ...item, addedAt: Date.now() }])
    if (item.kind === 'event') {
      fetch(`/api/events/${encodeURIComponent(item.id)}/signal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'ITINERARY' }), keepalive: true })
        .catch((err) => console.error('Itinerary count failed:', err))
    }
  }, [])
  const remove = useCallback((id: string) => write(read().filter((i) => i.id !== id)), [])
  const update = useCallback((id: string, patch: Partial<ItineraryItem>) => write(read().map((i) => (i.id === id ? { ...i, ...patch } : i))), [])
  const clear = useCallback(() => write([]), [])

  return { items, has, add, remove, update, clear }
}

/** Builds an itinerary entry from an event as returned by the APIs. */
export function eventToItem(ev: { id: string; title: string; date: string; time?: string | null; endTime?: string | null; venueName?: string | null; venueAddress?: string | null; suburb?: string | null; city?: string | null; href?: string | null; latitude?: number | null; longitude?: number | null; lat?: number | null; lng?: number | null }): Omit<ItineraryItem, 'addedAt'> {
  const lat = ev.lat ?? ev.latitude ?? null, lng = ev.lng ?? ev.longitude ?? null
  const place = [ev.venueName, ev.venueAddress, ev.suburb].filter(Boolean).join(', ') || null
  return {
    id: ev.id, kind: 'event', title: ev.title, date: String(ev.date).slice(0, 10), time: ev.time ?? null, endTime: ev.endTime ?? null,
    venueName: ev.venueName ?? null, suburb: ev.suburb ?? null, note: null, ...(ev.href ? { href: ev.href } : {}),
    place, city: ev.city ?? null, ...(lat != null && lng != null ? { lat, lng } : {}),
  }
}
