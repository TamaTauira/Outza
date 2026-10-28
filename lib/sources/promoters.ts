import { fetchHtml, saveEvent, extractNextData, toSydneyParts } from '@/lib/event-store'
import { CITIES } from '@/lib/cities'

/** Frontier Touring – schema.org MusicEvent JSON-LD for every tour date nationally. */
export async function fetchFrontierEvents(): Promise<number> {
  const html = await fetchHtml('https://www.frontiertouring.com/')
  if (!html) return 0
  let saved = 0
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  for (const b of blocks) {
    let items: any[] = []
    try {
      const d = JSON.parse(b[1])
      items = Array.isArray(d) ? d : d?.['@graph'] ?? [d]
    } catch {
      continue
    }
    for (const it of items) {
      const loc: string = it?.location?.name ?? ''
      const city = CITIES.find((c) => c.match.test(loc))
      if (!/Event$/.test(it?.['@type'] ?? '') || !city) continue
      const ok = await saveEvent({
        title: String(it.name ?? '').replace(/\s+20\d\d$/, ''),
        description: it.description || `${it?.performer?.name ?? it.name} live in ${city.name}, presented by Frontier Touring.`,
        date: String(it.startDate ?? '').slice(0, 10),
        city: city.name,
        venueName: loc.replace(new RegExp(`,\\s*${city.name}$`, 'i'), ''),
        venueAddress: loc,
        genres: ['Music', 'Concert'],
        imageUrl: it.image ?? null,
        ticketUrl: it.url ?? null,
        source: 'frontier',
      }).catch(() => false)
      if (ok) saved++
    }
  }
  console.log(`[frontier] saved ${saved} events`)
  return saved
}

function parse12h(s: string): string | null {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$/)
  if (!m) return null
  let h = parseInt(m[1]) % 12
  if (m[3] === 'pm') h += 12
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`
}

/** City of Sydney "What's On" guide – includes many free community events. */
export async function fetchCityOfSydneyEvents(): Promise<number> {
  const html = await fetchHtml('https://whatson.cityofsydney.nsw.gov.au/')
  const data = html ? extractNextData(html) : null
  if (!data) return 0
  const hits = new Map<string, any>()
  const walk = (o: any) => {
    if (Array.isArray(o)) o.forEach(walk)
    else if (o && typeof o === 'object') {
      if (o.type === 'Event' && o.objectID && Array.isArray(o.dates)) hits.set(o.objectID, o)
      Object.values(o).forEach(walk)
    }
  }
  walk(data?.props?.pageProps?.sectionAdditionalData)
  let saved = 0
  for (const h of hits.values()) {
    const [start, end] = String(h.eventUpcomingTime ?? '').split(/\s+to\s+/)
    const ok = await saveEvent({
      title: h.name,
      description: h.strapline,
      date: h.upcomingDate ?? h.dates?.[0],
      time: start ? parse12h(start) : null,
      endTime: end ? parse12h(end) : null,
      venueName: h.venueName ?? 'Sydney',
      venueAddress: h.suburbName ? `${h.suburbName}, NSW` : null,
      genres: [...(h.categories ?? []), ...(h.tags ?? [])].map((t: string) => t.replace(/-/g, ' ')),
      isFree: h.freeEvent === 'true' || h.freeEvent === true,
      imageUrl: h.tileImageCloudinary?.[0]?.secure_url ?? null,
      ticketUrl: `https://whatson.cityofsydney.nsw.gov.au/events/${h.slug}`,
      source: 'cityofsydney',
    }).catch(() => false)
    if (ok) saved++
  }
  console.log(`[cityofsydney] saved ${saved} events`)
  return saved
}

/** Humanitix – featured events per city (location + music listing pages). */
export async function fetchHumanitixEvents(): Promise<number> {
  let saved = 0
  for (const city of CITIES) for (const path of ['', '/music']) {
    const html = await fetchHtml(`https://humanitix.com/au/events/${city.humanitix}${path}`)
    const data = html ? extractNextData(html) : null
    const f = data?.props?.pageProps?.featuredCarouselEntries ?? {}
    const list: any[] = [...(f.carouselEntries ?? []), ...(f.verticalEvents ?? [])]
    for (const e of list) {
      const sd = e?.date?.startDate ? new Date(e.date.startDate) : null
      if (!sd || isNaN(sd.getTime())) continue
      const ed = e?.date?.endDate ? new Date(e.date.endDate) : null
      const s = toSydneyParts(sd, city.tz)
      const en = ed && !isNaN(ed.getTime()) ? toSydneyParts(ed, city.tz) : null
      const min = e?.pricing?.minimumPrice ?? null
      const max = e?.pricing?.maximumPrice ?? null
      const price = min === null ? null : max === 0 ? 'Free' : min === max ? `$${min}` : `$${min} - $${max}`
      const ok = await saveEvent({
        title: e.name,
        description: e.description ?? e.summary ?? null,
        date: s.date,
        time: s.time,
        endDate: en?.date,
        endTime: en?.time,
        venueName: e?.eventLocation?.venueName ?? 'TBA',
        venueAddress: e?.eventLocation?.address ?? null,
        genres: [e?.category, e?.subcategory, path === '/music' ? 'Music' : ''].filter(Boolean),
        price,
        isFree: max === 0,
        imageUrl: e?.bannerImage?.handle ? `https://images.humanitix.com/i/${e.bannerImage.handle}@original` : null,
        ticketUrl: `${e.hostname ?? 'https://events.humanitix.com/'}${e.slug}`,
        source: 'humanitix',
        city: city.name,
      }).catch(() => false)
      if (ok) saved++
    }
  }
  console.log(`[humanitix] saved ${saved} events`)
  return saved
}
