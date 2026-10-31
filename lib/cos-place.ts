/**
 * City of Sydney search hits carry an event suburb tag. That tag is not the venue.
 * Central Station's venue address is Haymarket, while the event tag says Glebe.
 * A stated venue address that names a suburb wins. The tag is only the fallback.
 */
import { suburbFromAddress } from '@/lib/cities'
import { isStreetAddress, pinFitsCity, statedPlaceAddress } from '@/lib/listing-venue'

export interface CityOfSydneyPlace {
  venueAddress: string | null
  lat: number | null
  lng: number | null
}

export function cityOfSydneyPlace(input: {
  listedAddress?: string | null
  listedLat?: number | null
  listedLng?: number | null
  suburbName?: string | null
}): CityOfSydneyPlace {
  const stated = statedPlaceAddress(input.listedAddress)
  const street = isStreetAddress(stated) ? stated : null
  const named = stated && suburbFromAddress(stated) ? stated : null
  const tag = (input.suburbName ?? '').replace(/\s+/g, ' ').trim()
  const venueAddress = street || named || (tag ? `${tag}, NSW` : null) || stated
  const suburb = suburbFromAddress(venueAddress) || tag || null
  const lat = input.listedLat
  const lng = input.listedLng
  const pinOk = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
    && pinFitsCity(lat, lng, 'Sydney', venueAddress, suburb)
  return {
    venueAddress,
    lat: pinOk ? lat! : null,
    lng: pinOk ? lng! : null,
  }
}
