/**
 * Frontier publishes one MusicEvent per tour date in the homepage JSON-LD.
 * The page URL is the tour, so the date has to travel with the source id.
 */
import { CITIES } from '@/lib/cities'

export type FrontierShow = {
  title: string
  description: string | null
  imageUrl: string | null
  organiserUrl: string | null
  date: string
  time: string | null
  city: string
  venueName: string
  venueAddress: string
  url: string
  externalId: string
}

export function frontierExternalId(url: string, date: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '')
    if (!path || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    return `${path}|${date}`
  } catch {
    return null
  }
}

function when(start: string): { date: string; time: string | null } | null {
  const date = start.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const clock = start.match(/T(\d{2}):(\d{2})/)
  if (!clock || clock[1] === '00' && clock[2] === '00') return { date, time: null }
  return { date, time: `${clock[1]}:${clock[2]}` }
}

export function frontierShowsFromHtml(html: string): FrontierShow[] {
  const shows: FrontierShow[] = []
  const blocks = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
  for (const block of blocks) {
    let items: any[] = []
    try {
      const parsed = JSON.parse(block[1])
      items = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ?? [parsed]
    } catch {
      continue
    }
    for (const item of items) {
      if (!/Event$/.test(item?.['@type'] ?? '')) continue
      const loc = String(item?.location?.name ?? '').trim()
      const city = CITIES.find((row) => row.match.test(loc))
      const start = when(String(item?.startDate ?? ''))
      const url = typeof item?.url === 'string' ? item.url.trim() : ''
      if (!city || !start || !url) continue
      const externalId = frontierExternalId(url, start.date)
      if (!externalId) continue
      const organiser = item?.organizer
      const organiserUrl = typeof organiser?.url === 'string' ? organiser.url : typeof organiser?.sameAs === 'string' ? organiser.sameAs : null
      shows.push({
        title: String(item.name ?? '').replace(/\s+20\d\d$/, '').trim(),
        description: typeof item?.description === 'string' && item.description.trim() ? item.description.trim() : null,
        imageUrl: typeof item?.image === 'string' ? item.image : null,
        organiserUrl,
        date: start.date,
        time: start.time,
        city: city.name,
        venueName: loc.replace(new RegExp(`,\\s*${city.name}\\s*$`, 'i'), '').trim(),
        venueAddress: loc,
        url,
        externalId,
      })
    }
  }
  return shows
}
