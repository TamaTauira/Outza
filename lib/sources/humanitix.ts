import { saveEvent, extractNextData, sleep, toSydneyParts, BROWSER_UA, type RawEvent } from '@/lib/event-store'
import { readJobMark, writeJobCursor } from '@/lib/job-watermark'
import { attachSweepProgress } from '@/lib/refresh-plan'
import { isAbortLike, noteSourceSaved, remainingBudgetMs, sourceFetchSignal, sourceOverBudget, yieldIfBudget } from '@/lib/source-budget'
import { CITIES, type CityDef } from '@/lib/cities'
import { cityFromPlace } from '@/lib/venue-city'
import { humanitixEventUrl } from '@/lib/listing-link'
import { moneyNumber, priceFromAmounts } from '@/lib/price'
import {
  HUMANITIX_FEATURED_BUDGET_MS,
  HUMANITIX_FEATURED_PAGES_PER_RUN,
  HUMANITIX_GAP_MS,
  HUMANITIX_SHARD_GAP_MS,
  featuredSlice,
  featuredSlotAfter,
  humanitixAuShardUrls,
  humanitixCarouselUrls,
  humanitixEventUrlsFromShard,
  humanitixListingsFromJson,
  humanitixResume,
  orderHumanitixUrls,
  type HumanitixListing,
} from '@/lib/humanitix-refresh'

const SITEMAP_INDEX = 'https://events.humanitix.com/sitemaps/sitemap.xml'
const EVENT_HEADROOM_MS = 10_000
/** One broken page is skipped. A run of empty payloads means the page shape changed, so the cursor stays. */
const PARSE_MISS_LIMIT = 12

type FetchResult = { status: number; body: string | null; pause: boolean }

function sydneyToday(): string {
  return toSydneyParts(new Date(), 'Australia/Sydney').date
}

function featuredPages(): { city: CityDef; path: '' | '/music' }[] {
  const pages: { city: CityDef; path: '' | '/music' }[] = []
  for (const city of CITIES) for (const path of ['', '/music'] as const) pages.push({ city, path })
  return pages
}

function stopForBudget(label: string): boolean {
  if (yieldIfBudget(label) || sourceOverBudget()) return true
  return remainingBudgetMs(EVENT_HEADROOM_MS + 1_000) < EVENT_HEADROOM_MS
}

async function politeGet(url: string): Promise<FetchResult> {
  if (stopForBudget('requests')) return { status: 0, body: null, pause: true }
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json,application/xml,text/html;q=0.9' },
      signal: sourceFetchSignal(20_000),
      redirect: 'follow',
      cache: 'no-store',
    })
    if (res.status === 429 || res.status === 503) {
      console.warn(`[humanitix] ${res.status} ${url}`)
      return { status: res.status, body: null, pause: true }
    }
    if (!res.ok) return { status: res.status, body: null, pause: false }
    return { status: res.status, body: await res.text(), pause: false }
  } catch (err) {
    const timedOut = isAbortLike(err) && (sourceOverBudget() || remainingBudgetMs(8_000) < 4_000)
    if (!timedOut) console.warn(`[humanitix] fetch failed ${url}: ${err instanceof Error ? err.message : err}`)
    return { status: 0, body: null, pause: true }
  }
}

function australia(listing: HumanitixListing): boolean {
  const country = (listing.country ?? '').trim().toLowerCase()
  if (!country) return true
  return country === 'au' || country === 'australia'
}

function listingToEvent(listing: HumanitixListing): RawEvent | null {
  if (!listing.listed || listing.passed) return null
  if (!australia(listing)) return null
  const city = cityFromPlace({
    name: listing.venueName,
    address: listing.venueAddress,
    locality: listing.locality,
    region: listing.region,
    postcode: listing.postcode,
    lat: listing.lat,
    lng: listing.lng,
  })
  if (!city) return null
  const start = toSydneyParts(listing.start, city.tz)
  if (start.date < sydneyToday()) return null
  const end = listing.end ? toSydneyParts(listing.end, city.tz) : null
  const min = listing.prices.length ? Math.min(...listing.prices) : null
  const max = listing.prices.length ? Math.max(...listing.prices) : null
  const priced = priceFromAmounts(min, max)
  return {
    title: listing.title,
    description: listing.description,
    date: start.date,
    time: start.time,
    endDate: end?.date ?? null,
    endTime: end?.time ?? null,
    venueName: listing.venueName,
    venueAddress: listing.venueAddress,
    genres: listing.genres,
    price: priced.price,
    isFree: priced.isFree,
    imageUrl: listing.imageUrl,
    ticketUrl: listing.url,
    sourceUrl: listing.url,
    latitude: listing.lat,
    longitude: listing.lng,
    status: listing.status,
    source: 'humanitix',
    city: city.name,
  }
}

async function saveListing(listing: HumanitixListing): Promise<boolean> {
  const event = listingToEvent(listing)
  if (!event) return false
  return saveEvent(event).catch((err) => {
    console.error(`[humanitix] event error: ${err instanceof Error ? err.message : err}`)
    return false
  })
}

/** 'saved' counts a write. 'skip' moves on. 'pause' retries this URL next run. 'miss' is a page with no event. */
async function ingestEventUrl(url: string): Promise<'saved' | 'skip' | 'pause' | 'miss'> {
  const res = await politeGet(`${url}/__data.json`)
  if (res.pause) return 'pause'
  if (!res.body) return res.status === 404 || res.status === 410 ? 'skip' : 'pause'
  const trimmed = res.body.trimStart()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return 'pause'
  const listings = humanitixListingsFromJson(res.body)
  if (!listings.length) return 'miss'
  let saved = false
  for (const listing of listings) {
    if (await saveListing(listing)) saved = true
  }
  return saved ? 'saved' : 'skip'
}

async function saveVertical(e: any, city: CityDef, path: string): Promise<boolean> {
  const sd = e?.date?.startDate ? new Date(e.date.startDate) : null
  if (!sd || Number.isNaN(sd.getTime())) return false
  const ed = e?.date?.endDate ? new Date(e.date.endDate) : null
  const s = toSydneyParts(sd, city.tz)
  if (s.date < sydneyToday()) return false
  const en = ed && !Number.isNaN(ed.getTime()) ? toSydneyParts(ed, city.tz) : null
  const min = moneyNumber(e?.pricing?.minimumPrice ?? e?.pricing?.minPrice)
  const max = moneyNumber(e?.pricing?.maximumPrice ?? e?.pricing?.maxPrice)
  const priced = priceFromAmounts(min, max, { fromOnly: min != null && max == null && min > 0 })
  const page = humanitixEventUrl(e.hostname ?? e.url, e.slug ?? e.url)
  const card = typeof e?.description === 'string' && e.description.trim()
    ? e.description
    : typeof e?.summary === 'string' && e.summary.trim() ? e.summary : null
  // Featured cards omit the write-up. The event page has it.
  if (!card && page) {
    const outcome = await ingestEventUrl(page)
    return outcome === 'saved'
  }
  return saveEvent({
    title: e.name,
    description: card,
    date: s.date,
    time: s.time,
    endDate: en?.date,
    endTime: en?.time,
    venueName: e?.eventLocation?.venueName ?? 'TBA',
    venueAddress: e?.eventLocation?.address ?? null,
    genres: [e?.category, e?.subcategory, path === '/music' ? 'Music' : ''].filter(Boolean),
    price: priced.price,
    isFree: priced.isFree,
    feesIncluded: e?.pricing?.plusBuyerFee === true ? false : e?.pricing?.plusBuyerFee === false ? true : null,
    imageUrl: e?.bannerImage?.handle ? `https://images.humanitix.com/i/${e.bannerImage.handle}@original` : null,
    ticketUrl: page,
    sourceUrl: page,
    source: 'humanitix',
    city: city.name,
  }).catch(() => false)
}

/**
 * Featured city pages, then the sitemap from the saved index.
 * Returns sweep flags so a short chunk is not compared with a finished run.
 */
export async function fetchHumanitixEvents(): Promise<{ saved: number; continuation: boolean; more: boolean }> {
  const mark = await readJobMark('humanitix').catch((err) => {
    console.error('[humanitix] cursor read failed', err instanceof Error ? err.message : err)
    return null
  })
  const startIndex = mark?.page ?? 0
  const startSlot = mark?.pageSize ?? 0
  const continuation = startIndex > 0
  let saved = 0
  let done = false
  let nextIndex = startIndex
  let nextSlot = startSlot
  const seen = new Set<string>()
  const note = () => noteSourceSaved(saved)
  const checkpoint = async () => {
    await writeJobCursor('humanitix', new Date(), nextIndex, nextSlot).catch((err) => {
      console.error('[humanitix] cursor write failed', err instanceof Error ? err.message : err)
    })
  }

  try {
    const pages = featuredPages()
    let holdSitemap = false
    if (remainingBudgetMs(70_000) >= 70_000) {
      const featuredUntil = Date.now() + HUMANITIX_FEATURED_BUDGET_MS
      const featuredTight = () => Date.now() >= featuredUntil || stopForBudget('featured')
      let taken = 0
      let paused = false
      for (const pageIndex of featuredSlice(startSlot, HUMANITIX_FEATURED_PAGES_PER_RUN, pages.length)) {
        if (paused || featuredTight()) break
        const page = pages[pageIndex]
        const htmlRes = await politeGet(`https://humanitix.com/au/events/${page.city.humanitix}${page.path}`)
        if (htmlRes.pause) break
        taken++
        nextSlot = featuredSlotAfter(startSlot, taken, pages.length)
        const data = htmlRes.body ? extractNextData(htmlRes.body) : null
        const featured = data?.props?.pageProps?.featuredCarouselEntries ?? {}
        for (const event of featured.verticalEvents ?? []) {
          if (featuredTight()) break
          if (await saveVertical(event, page.city, page.path)) saved++
          note()
        }
        for (const url of humanitixCarouselUrls(featured.carouselEntries)) {
          if (featuredTight()) break
          if (seen.has(url)) continue
          seen.add(url)
          const outcome = await ingestEventUrl(url)
          if (outcome === 'pause') {
            paused = true
            holdSitemap = true
            break
          }
          if (outcome === 'saved') saved++
          note()
          await sleep(HUMANITIX_GAP_MS)
        }
        await sleep(HUMANITIX_SHARD_GAP_MS)
      }
    }

    if (!holdSitemap && !stopForBudget('sitemap')) {
      const ordered = await loadOrderedUrls(sydneyToday())
      if (!ordered) {
        if (saved === 0) throw new Error('Humanitix sitemap was unavailable')
        console.warn('[humanitix] sitemap unavailable; continuing next run')
      } else {
        const resume = humanitixResume(nextIndex, ordered.length)
        console.log(`[humanitix] ${ordered.length} event urls, from ${resume.index}${resume.continuation ? ' (continued)' : ''}`)
        if (resume.done) {
          done = true
          nextIndex = 0
        } else {
          let misses = 0
          let firstMiss = resume.index
          for (let i = resume.index; i < ordered.length; i++) {
            if (stopForBudget('event pages')) {
              nextIndex = i
              break
            }
            const url = ordered[i]
            nextIndex = i
            if (seen.has(url)) {
              nextIndex = i + 1
              misses = 0
              continue
            }
            seen.add(url)
            const outcome = await ingestEventUrl(url)
            if (outcome === 'pause') break
            if (outcome === 'miss') {
              if (misses === 0) firstMiss = i
              misses++
              if (misses >= PARSE_MISS_LIMIT) {
                nextIndex = firstMiss
                throw new Error('Humanitix event pages no longer include a listing')
              }
            } else {
              misses = 0
              if (outcome === 'saved') saved++
            }
            nextIndex = i + 1
            note()
            if (nextIndex === ordered.length) done = true
            if (nextIndex % 25 === 0) console.log(`[humanitix] saved ${saved} (sitemap ${nextIndex}/${ordered.length})`)
            if (done || nextIndex % 5 === 0) await checkpoint()
            if (done) break
            await sleep(HUMANITIX_GAP_MS)
          }
          if (done) nextIndex = 0
        }
      }
    }
  } catch (err) {
    throw attachSweepProgress(err, { continuation, more: !done })
  } finally {
    await checkpoint()
  }

  console.log(`[humanitix] saved ${saved} events${done ? '' : ' (more next run)'}`)
  return { saved, continuation, more: !done }
}

async function loadOrderedUrls(today: string): Promise<string[] | null> {
  const index = await politeGet(SITEMAP_INDEX)
  if (index.pause || !index.body || !index.body.includes('<loc>')) return null
  const shards = humanitixAuShardUrls(index.body)
  if (!shards.length) return null
  const urls: string[] = []
  for (const shard of shards) {
    if (stopForBudget('sitemap shards')) return null
    await sleep(HUMANITIX_SHARD_GAP_MS)
    const xml = await politeGet(shard)
    if (xml.pause || !xml.body || !xml.body.includes('<loc>')) return null
    urls.push(...humanitixEventUrlsFromShard(xml.body))
  }
  const ordered = orderHumanitixUrls(urls, today)
  return ordered.length ? ordered : null
}
