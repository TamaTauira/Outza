import { MIN_GROUP, areaForPostcode, includeInAudience } from '@/lib/profile-shared'
import { distanceKm } from '@/lib/travel'

const NIGHTS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export type VenueActivity = {
  views: number
  saves: number
  itineraryAdds: number
  ticketClicks: number
  bestNights: { label: string; views: number }[]
  categories: { category: string; views: number }[]
  areas: { label: string; people: number }[]
  hiddenAreas: number
  note: string
}

/** Shapes stored counts. Groups under MIN_GROUP people are left out. */
export function shapeVenueActivity(input: {
  views: number
  saves: number
  itineraryAdds: number
  ticketClicks: number
  nights: { dow: number; views: number }[]
  categories: { category: string; views: number }[]
  people: { postcode: string | null; birthYear: number | null; people: number }[]
  now?: Date
}): VenueActivity {
  const areas = new Map<string, number>()
  for (const row of input.people) {
    if (!includeInAudience(row.birthYear, input.now)) continue
    const label = areaForPostcode(row.postcode)
    if (!label) continue
    areas.set(label, (areas.get(label) ?? 0) + row.people)
  }
  const visible = [...areas.entries()].filter(([, people]) => people >= MIN_GROUP)
  const bestNights = input.nights
    .filter((row) => row.views > 0 && row.dow >= 0 && row.dow <= 6)
    .sort((a, b) => b.views - a.views || a.dow - b.dow)
    .slice(0, 3)
    .map((row) => ({ label: NIGHTS[row.dow], views: row.views }))
  return {
    views: input.views,
    saves: input.saves,
    itineraryAdds: input.itineraryAdds,
    ticketClicks: input.ticketClicks,
    bestNights,
    categories: input.categories.filter((row) => row.category && row.views > 0).slice(0, 6),
    areas: visible.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([label, people]) => ({ label, people })),
    hiddenAreas: areas.size - visible.length,
    note: 'These are counts stored for this period. Views and clicks are not attendance. Home areas come from the postcode people gave us, and a group under 10 is hidden.',
  }
}

export type NearbyEvent = {
  id: string
  title: string
  date: string
  time: string | null
  venueName: string
  category: string
  lat: number | null
  lng: number | null
}

/** Other listings on the venue’s nights. Distance is used only when both sides have a pin. */
export function nearbyDemand(input: {
  lat: number | null
  lng: number | null
  dates: string[]
  others: NearbyEvent[]
  radiusKm?: number
}) {
  const radius = input.radiusKm ?? 3
  const measured = input.lat != null && input.lng != null
  const nights = input.dates.map((date) => {
    const same = input.others.filter((row) => row.date.slice(0, 10) === date)
    const events = measured
      ? same.filter((row) => row.lat != null && row.lng != null && distanceKm({ lat: input.lat as number, lng: input.lng as number }, { lat: row.lat, lng: row.lng }) <= radius)
      : same
    return { date, events, gap: events.length === 0 }
  })
  return {
    basis: measured ? `Within ${radius} km` : 'Same city, because this venue has no pin',
    nights,
  }
}
