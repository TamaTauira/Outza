/** Pure helpers for Outza Together. Safe to import from tests and the client. */
import { directionsUrl, fmtKm, fmtMin, planLeg, type TravelStop } from '@/lib/travel'

export function newPlanToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function validToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token)
}

export function cleanPlanName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, 80)
  return trimmed.length ? trimmed : null
}

export function cleanDisplayName(name: unknown, fallback = 'Guest'): string {
  if (typeof name !== 'string') return fallback
  const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, 40)
  return trimmed || fallback
}

/** One vote per person. The same option clears the vote. Another option moves it. */
export function nextVote(currentItemId: string | null, itemId: string): string | null {
  return currentItemId === itemId ? null : itemId
}

export function venueKey(name: string, city?: string | null): string {
  const venue = name.trim().toLowerCase().replace(/\s+/g, ' ')
  const where = (city ?? '').trim().toLowerCase()
  return `${where}|${venue}`.slice(0, 180)
}

export function planDateKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const key = value.trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null
}

export function clockTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${match[2]}`
}

export type PrivateStopInput = {
  title: string
  address: string
  note: string | null
  time: string
  endTime: string
  date: string
}

/** Name, start, finish, address, and a date so the stop can sit in time order. Not a public Event. */
export function cleanPrivateStop(input: { title?: unknown; address?: unknown; where?: unknown; note?: unknown; time?: unknown; endTime?: unknown; date?: unknown }): { error: string } | PrivateStopInput {
  const title = typeof input.title === 'string' ? input.title.trim().replace(/\s+/g, ' ').slice(0, 120) : ''
  const rawAddress = typeof input.address === 'string' ? input.address : input.where
  const address = typeof rawAddress === 'string' ? rawAddress.trim().replace(/\s+/g, ' ').slice(0, 200) : ''
  const note = typeof input.note === 'string' ? input.note.trim().replace(/\s+/g, ' ').slice(0, 300) : ''
  const time = clockTime(input.time)
  const endTime = clockTime(input.endTime)
  const date = planDateKey(input.date)
  if (!title) return { error: 'Give the stop a name' }
  if (!time || !endTime) return { error: 'Add a start and a finish time' }
  if (time === endTime) return { error: 'Finish time needs to be different from the start' }
  if (!address) return { error: 'Add an address so we can work out travel time' }
  if (!date) return { error: 'Add the date' }
  return { title, address, note: note || null, time, endTime, date }
}

export function stopSortKey(stop: { date?: string | null; time?: string | null }): string {
  const date = stop.date?.slice(0, 10) || '9999-12-31'
  return `${date} ${clockTime(stop.time) ?? '99:99'}`
}

/** Public listings and private stops in one line, earliest first. Untimed stops go last that day. */
export function orderPlanStops<T extends { date?: string | null; time?: string | null }>(stops: T[]): T[] {
  return [...stops].sort((a, b) => stopSortKey(a).localeCompare(stopSortKey(b)) || 0)
}

export function canChangePrivateStop(
  who: { userId?: string | null; guestKey?: string | null },
  stop: { addedById?: string | null; addedByGuest?: string | null },
  isCreator: boolean,
): boolean {
  if (isCreator) return true
  if (who.userId && stop.addedById === who.userId) return true
  if (who.guestKey && stop.addedByGuest === who.guestKey) return true
  return false
}

export type TogetherPlace = TravelStop & { title: string }

function placeLabel(stop: TogetherPlace): string {
  return [stop.place || stop.venueName || stop.title, stop.suburb, stop.city].filter(Boolean).join(', ')
}

function directionsHref(from: TogetherPlace, to: TogetherPlace, mode: string): string {
  if (from.lat != null && from.lng != null && to.lat != null && to.lng != null) {
    return directionsUrl({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, mode)
  }
  const origin = placeLabel(from)
  const destination = placeLabel(to)
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}`
}

/**
 * Always returns a line for the hop. Missing coordinates still get a transport link
 * and the words "Travel time unavailable" rather than a blank gap.
 */
export function togetherLeg(from: TogetherPlace, to: TogetherPlace): { kind: string; text: string; href: string } {
  const planned = planLeg(from, to)
  if (planned.kind === 'trip') {
    const leg = planned.leg
    return {
      kind: 'trip',
      text: `${fmtKm(leg.km)} · about ${fmtMin(leg.walkMin)} walk · about ${fmtMin(leg.driveMin)} drive`,
      href: directionsHref(from, to, leg.mode === 'walking' ? 'walking' : 'transit'),
    }
  }
  if (planned.kind === 'same') return { kind: 'same', text: 'Same location', href: directionsHref(from, to, 'walking') }
  if (planned.kind === 'different-city') {
    return {
      kind: 'different-city',
      text: `Travel time unavailable. These stops are in ${planned.fromCity} and ${planned.toCity}.`,
      href: directionsHref(from, to, 'transit'),
    }
  }
  if (planned.kind === 'unreliable') {
    return { kind: 'unreliable', text: 'Travel time unavailable. The map pins are too far apart to trust.', href: directionsHref(from, to, 'transit') }
  }
  return { kind: 'missing', text: 'Travel time unavailable.', href: directionsHref(from, to, 'transit') }
}
