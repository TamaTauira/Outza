/**
 * Canonical venue identity for places that have been renamed or that share a precinct.
 * Aliases are names only. An address is never enough to treat two venues as one.
 * Room names keep separate stages inside one venue from collapsing into each other.
 */
import { normalizeVenue } from '@/lib/quality'

export type VenueRoom = {
  id: string
  /** Names as the venue publishes them. */
  names: string[]
  /** True when this room name, on its own, identifies the venue. */
  distinctive?: boolean
}

export type CanonicalVenue = {
  id: string
  officialName: string
  city: string
  aliases: string[]
  rooms: VenueRoom[]
}

/**
 * Priority venues from the national source brief.
 * Afterpay Arena is the Sydney Olympic Park arena formerly called Qudos Bank Arena
 * (official name change 23 July 2026). TikTok Entertainment Centre is a different
 * room in the ICC Sydney precinct, not a former name of that arena.
 */
export const CANONICAL_VENUES: CanonicalVenue[] = [
  {
    id: 'sydney-opera-house',
    officialName: 'Sydney Opera House',
    city: 'Sydney',
    aliases: ['Sydney Opera House', 'Opera House'],
    rooms: [
      { id: 'concert-hall', names: ['Concert Hall'] },
      { id: 'joan-sutherland', names: ['Joan Sutherland Theatre'], distinctive: true },
      { id: 'drama-theatre', names: ['Drama Theatre'] },
      { id: 'playhouse', names: ['Playhouse'] },
      { id: 'studio', names: ['The Studio', 'Studio'] },
      { id: 'utzon', names: ['Utzon Room'], distinctive: true },
      { id: 'forecourt', names: ['Forecourt', 'Monumental Steps'] },
    ],
  },
  {
    id: 'enmore-theatre',
    officialName: 'Enmore Theatre',
    city: 'Sydney',
    aliases: ['Enmore Theatre', 'The Enmore Theatre'],
    rooms: [],
  },
  {
    id: 'factory-theatre',
    officialName: 'Factory Theatre',
    city: 'Sydney',
    aliases: ['Factory Theatre', 'The Factory Theatre'],
    rooms: [],
  },
  {
    id: 'icc-sydney',
    officialName: 'ICC Sydney',
    city: 'Sydney',
    aliases: ['ICC Sydney', 'International Convention Centre Sydney', 'International Convention Centre'],
    rooms: [
      { id: 'darling-harbour-theatre', names: ['Darling Harbour Theatre'] },
      { id: 'pyrmont-theatre', names: ['Pyrmont Theatre'] },
    ],
  },
  {
    id: 'tiktok-entertainment-centre',
    officialName: 'TikTok Entertainment Centre',
    city: 'Sydney',
    aliases: ['TikTok Entertainment Centre'],
    rooms: [],
  },
  {
    id: 'afterpay-arena',
    officialName: 'Afterpay Arena',
    city: 'Sydney',
    aliases: [
      'Afterpay Arena',
      'Qudos Bank Arena',
      'Allphones Arena',
      'Acer Arena',
      'Sydney SuperDome',
      'Sydney Super Dome',
    ],
    rooms: [],
  },
  {
    id: 'accor-stadium',
    officialName: 'Accor Stadium',
    city: 'Sydney',
    aliases: ['Accor Stadium', 'Stadium Australia', 'ANZ Stadium', 'Telstra Stadium'],
    rooms: [],
  },
  {
    id: 'allianz-stadium',
    officialName: 'Allianz Stadium',
    city: 'Sydney',
    aliases: ['Allianz Stadium', 'Sydney Football Stadium'],
    rooms: [],
  },
  {
    id: 'scg',
    officialName: 'Sydney Cricket Ground',
    city: 'Sydney',
    aliases: ['Sydney Cricket Ground', 'SCG'],
    rooms: [],
  },
  {
    id: 'commbank-stadium',
    officialName: 'CommBank Stadium',
    city: 'Sydney',
    aliases: ['CommBank Stadium', 'Bankwest Stadium', 'Western Sydney Stadium'],
    rooms: [],
  },
  {
    id: 'mcdonald-jones-stadium',
    officialName: 'McDonald Jones Stadium',
    city: 'Newcastle',
    aliases: ['McDonald Jones Stadium', 'Hunter Stadium', 'EnergyAustralia Stadium', 'Ausgrid Stadium'],
    rooms: [],
  },
  {
    id: 'win-stadium',
    officialName: 'WIN Stadium',
    city: 'Sydney',
    aliases: ['WIN Stadium', 'Wollongong Stadium'],
    rooms: [],
  },
  {
    id: 'win-entertainment-centre',
    officialName: 'WIN Entertainment Centre',
    city: 'Sydney',
    aliases: ['WIN Entertainment Centre'],
    rooms: [],
  },
  {
    id: 'state-theatre-sydney',
    officialName: 'State Theatre Sydney',
    city: 'Sydney',
    aliases: ['State Theatre', 'State Theatre Sydney'],
    rooms: [],
  },
]

export type VenueIdentity = {
  id: string
  officialName: string
  city: string
  roomId: string | null
}

function aliasHit(name: string, alias: string): boolean {
  const left = normalizeVenue(name)
  const right = normalizeVenue(alias)
  if (!left || !right) return false
  if (left === right) return true
  if (right.length < 10) return false
  return left.startsWith(`${right} `)
}

function cityOk(venueCity: string, eventCity?: string | null): boolean {
  if (!eventCity) return true
  return venueCity.toLowerCase() === eventCity.trim().toLowerCase()
}

function roomIn(name: string, room: VenueRoom): boolean {
  return room.names.some((label) => {
    const roomName = normalizeVenue(label)
    const hay = normalizeVenue(name)
    if (!roomName || !hay) return false
    if (hay === roomName) return true
    return ` ${hay} `.includes(` ${roomName} `)
  })
}

/**
 * Resolve a listing's venue name to a canonical venue and, when the name says so, a room.
 * Unknown names return null. They are not merged by address.
 */
export function resolveVenueIdentity(name: string | null | undefined, city?: string | null): VenueIdentity | null {
  const raw = (name ?? '').trim()
  if (!raw) return null
  let best: { venue: CanonicalVenue; aliasLength: number } | null = null
  for (const venue of CANONICAL_VENUES) {
    if (!cityOk(venue.city, city)) continue
    for (const alias of venue.aliases) {
      if (!aliasHit(raw, alias)) continue
      const aliasLength = normalizeVenue(alias).length
      if (!best || aliasLength > best.aliasLength) best = { venue, aliasLength }
    }
    for (const room of venue.rooms) {
      if (!room.distinctive || !roomIn(raw, room)) continue
      const aliasLength = Math.max(...room.names.map((label) => normalizeVenue(label).length))
      if (!best || aliasLength > best.aliasLength) best = { venue, aliasLength }
    }
  }
  if (!best) return null
  const room = best.venue.rooms.find((item) => roomIn(raw, item)) ?? null
  return {
    id: best.venue.id,
    officialName: best.venue.officialName,
    city: best.venue.city,
    roomId: room?.id ?? null,
  }
}

/**
 * Same canonical venue and no conflicting rooms.
 * A missing room does not contradict a named room. Two named rooms do.
 * Null identities are not a match.
 */
export function sameVenueIdentity(a: VenueIdentity | null, b: VenueIdentity | null): boolean {
  if (!a || !b) return false
  if (a.id !== b.id) return false
  if (a.roomId && b.roomId && a.roomId !== b.roomId) return false
  return true
}

export function conflictingRooms(a: VenueIdentity | null, b: VenueIdentity | null): boolean {
  return !!a && !!b && a.id === b.id && !!a.roomId && !!b.roomId && a.roomId !== b.roomId
}
