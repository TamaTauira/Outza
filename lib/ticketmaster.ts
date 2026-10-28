import { saveEvent, sleep } from '@/lib/event-store'
import { CITIES, type CityDef } from '@/lib/cities'

export async function fetchTicketmasterEvents(): Promise<number> {
  const apiKey = process.env.TICKETMASTER_API_KEY
  if (!apiKey) {
    console.error('TICKETMASTER_API_KEY not set')
    return 0
  }
  let total = 0
  for (const city of CITIES) {
    total += await fetchCity(city, apiKey)
  }
  console.log(`Ticketmaster: added/updated ${total} events across Australia`)
  return total
}

async function fetchCity(city: CityDef, apiKey: string): Promise<number> {
  const AREA = `latlong=${city.lat},${city.lng}&radius=${city.radiusKm}&unit=km&countryCode=AU`
  let saved = 0
  // The API caps deep paging at 1,000 results, so walk the list from both ends.
  for (const sort of ['date,asc', 'date,desc']) {
    for (let page = 0; page < city.tmPages; page++) {
      try {
        const url = `https://app.ticketmaster.com/discovery/v2/events.json?${AREA}&size=200&page=${page}&sort=${sort}&apikey=${apiKey}`
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
        if (!res.ok) {
          console.error(`Ticketmaster ${sort} page ${page} returned ${res.status}`)
          break
        }
        const data = await res.json()
        const events: any[] = data?._embedded?.events ?? []
        if (events.length === 0) break

        for (const ev of events) {
          try {
            const venue = ev?._embedded?.venues?.[0]
            const genres: string[] = []
            for (const c of ev?.classifications ?? []) {
              for (const k of ['segment', 'genre', 'subGenre']) {
                const n = c?.[k]?.name
                if (n && n !== 'Undefined') genres.push(n)
              }
            }
            const ranges: any[] = ev?.priceRanges ?? []
            const pr = ranges.find((r) => /including fees/i.test(r?.type ?? '')) ?? ranges[0]
            const code = String(ev?.dates?.status?.code ?? '').toLowerCase()
            const status = code === 'cancelled' || code === 'canceled' ? 'CANCELLED' : code === 'postponed' ? 'POSTPONED' : code === 'rescheduled' ? 'RESCHEDULED' : 'SCHEDULED'
            let price: string | null = null
            if (pr) {
              const min = pr.min ?? 0
              const max = pr.max ?? 0
              price = min === 0 && max === 0 ? 'Free' : min === max ? `$${min.toFixed(0)}` : `$${min.toFixed(0)} - $${max.toFixed(0)}`
            }
            const images: any[] = ev?.images ?? []
            // Highest-resolution artwork, never a thumbnail (largest 16:9 first - stable URL across refreshes)
            const usable = images.filter((i) => i?.url && !i?.fallback)
            const widest = (list: any[]) => [...list].sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0))[0]?.url
            const imageUrl = widest(usable.filter((i) => i?.ratio === '16_9')) ?? widest(usable) ?? images[0]?.url ?? null
            const venueCity = venue?.city?.name ?? city.name
            // Gallery: distinct artworks only (TM serves one artwork in many sizes - keep the widest of each)
            const attractionImages: any[] = (ev?._embedded?.attractions ?? []).flatMap((a: any) => a?.images ?? [])
            const byArtwork = new Map<string, { url: string; width: number }>()
            for (const im of [...usable, ...attractionImages.filter((i) => i?.url && !i?.fallback)]) {
              const base = String(im.url).replace(/_(RETINA|TABLET|EVENT|RECOMENDATION|ARTIST|CUSTOM|SOURCE|PORTRAIT|LANDSCAPE)[^/]*$/i, '').replace(/\?.*$/, '')
              const prev = byArtwork.get(base)
              if (!prev || (im.width ?? 0) > prev.width) byArtwork.set(base, { url: im.url, width: im.width ?? 0 })
            }
            const galleryUrls = [...byArtwork.values()].map((v) => v.url).filter((u) => u !== imageUrl)
            const promoterName: string | null = ev?.promoter?.name ?? ev?.promoters?.[0]?.name ?? null
            const ok = await saveEvent({
              title: ev?.name ?? 'Untitled Event',
              description: ev?.info ?? ev?.pleaseNote ?? '',
              date: ev?.dates?.start?.localDate ?? '',
              time: ev?.dates?.start?.timeTBA || ev?.dates?.start?.noSpecificTime ? null : ev?.dates?.start?.localTime,
              endDate: ev?.dates?.end?.localDate ?? null,
              endTime: ev?.dates?.end?.localTime ?? null,
              venueName: venue?.name ?? 'TBA',
              venueAddress: `${venue?.address?.line1 ?? ''}, ${venueCity}`.replace(/^, /, ''),
              genres,
              price,
              imageUrl,
              ticketUrl: ev?.url ?? null,
              latitude: parseFloat(venue?.location?.latitude ?? '') || null,
              longitude: parseFloat(venue?.location?.longitude ?? '') || null,
              source: 'ticketmaster',
              status,
              feesIncluded: pr ? /including fees/i.test(pr?.type ?? '') : null,
              city: city.name,
              galleryUrls,
              accessibilityInfo: ev?.accessibility?.info ?? venue?.accessibleSeatingDetail ?? null,
              ageRestriction: ev?.ageRestrictions?.legalAgeEnforced ? '18+ (legal age enforced)' : null,
              organiserName: promoterName && !/^promoter$/i.test(promoterName) ? promoterName : null,
            })
            if (ok) saved++
          } catch (evErr: any) {
            console.error(`Error processing TM event: ${evErr?.message}`)
          }
        }
        if (events.length < 200) break
        await sleep(300)
      } catch (pageErr: any) {
        console.error(`Error fetching TM page ${page}: ${pageErr?.message}`)
        break
      }
    }
  }

  console.log(`Ticketmaster ${city.name}: added/updated ${saved} events`)
  return saved
}
