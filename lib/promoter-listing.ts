/**
 * Shared checks for a promoter-created or promoter-edited listing.
 * Invalid ticket links and prices are rejected instead of being dropped.
 */
import { CATEGORIES } from '@/lib/categories'
import { CITY_NAMES, cityDef } from '@/lib/cities'
import { readPrice } from '@/lib/price'
import { cityToday } from '@/lib/seo'
import { bestSourceUrl } from '@/lib/images/source-url-client'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/
const IMAGE_EXT = /\.(avif|gif|jpe?g|png|svg|webp)(\?|#|$)/i
const IMAGE_HOST = /(ticketm\.net|evbuc\.com|cloudinary\.com|humanitix\.com|imgix\.net|googleusercontent\.com|unsplash\.com|twimg\.com|fbcdn\.net|shopify\.com|amazonaws\.com|windows\.net|cloudfront\.net|wixstatic\.com|squarespace-cdn\.com)/i

export interface ParsedListing {
  title: string
  date: string
  endDate: string | null
  time: string | null
  endTime: string | null
  overnight: boolean
  venueName: string
  venueAddress: string | null
  city: string
  category: string
  subTags: string[]
  isLGBTI: boolean
  description: string | null
  price: string | null
  isFree: boolean
  priceMin: number | null
  priceMax: number | null
  ticketUrl: string | null
  imageUrl: string | null
  galleryUrls: string[]
  organiserName: string | null
  organiserUrl: string | null
  accessibilityInfo: string | null
  ageRestriction: string | null
  transportInfo: string | null
}

export type ParseResult = { ok: true; listing: ParsedListing } | { ok: false; error: string }

const txt = (v: unknown, max: number) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ')
  return s ? s.slice(0, max) : null
}

function httpsUrl(v: unknown, label: string): { url: string | null } | { error: string } {
  const raw = String(v ?? '').trim()
  if (!raw) return { url: null }
  if (!/^https:\/\//i.test(raw)) return { error: `${label} must start with https://` }
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return { error: `${label} doesn’t look like a web address` }
    return { url: u.toString().slice(0, 500) }
  } catch {
    return { error: `${label} doesn’t look like a web address` }
  }
}

export function parsePromoterListing(b: Record<string, unknown>, now = new Date()): ParseResult {
  const title = String(b.title ?? '').trim().replace(/\s+/g, ' ')
  if (!title) return { ok: false, error: 'Title is required' }
  if (title.length > 180) return { ok: false, error: 'Title must be 180 characters or fewer' }
  const date = String(b.date ?? '')
  if (!DAY.test(date)) return { ok: false, error: 'Choose a date' }
  const endRaw = String(b.endDate ?? '').trim()
  const endDate = endRaw ? endRaw : null
  if (endDate && !DAY.test(endDate)) return { ok: false, error: 'End date must be a real date' }
  if (endDate && endDate < date) return { ok: false, error: 'End date can’t be before the start date' }
  const venueName = String(b.venueName ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
  if (!venueName) return { ok: false, error: 'Venue is required' }
  const city = CITY_NAMES.includes(String(b.city)) ? String(b.city) : ''
  if (!city) return { ok: false, error: 'Choose a city' }
  const today = cityToday(cityDef(city), now)
  const lastDay = endDate ?? date
  if (lastDay < today) return { ok: false, error: `That date has already passed in ${city}. Pick today or a later date.` }

  const time = TIME.test(String(b.time ?? '')) ? String(b.time) : null
  const endTime = TIME.test(String(b.endTime ?? '')) ? String(b.endTime) : null
  const overnight = !!(time && endTime && endTime < time)
  if (time && endTime && endTime === time) return { ok: false, error: 'Finish time needs to be different from the start time' }

  const category = CATEGORIES.some((c) => c.name === b.category) ? String(b.category) : 'Community'
  const allowed = new Set(CATEGORIES.find((c) => c.name === category)?.subTags ?? [])
  const subTags = (Array.isArray(b.subTags) ? b.subTags : typeof b.subTag === 'string' && b.subTag ? [b.subTag] : [])
    .filter((t): t is string => typeof t === 'string' && allowed.has(t))
    .slice(0, 6)

  const priceText = String(b.price ?? '').trim()
  if (priceText && /[-−]\s*\$?\s*\d/.test(priceText)) return { ok: false, error: 'Price can’t be negative' }
  const wantFree = b.isFree === true || b.isFree === 'true'
  const read = readPrice(wantFree ? null : priceText, wantFree)
  const isFree = read.isFree
  if (!isFree && priceText && read.min == null) return { ok: false, error: 'Enter a price like $25, or tick Free' }

  const ticket = httpsUrl(b.ticketUrl, 'Ticket link')
  if ('error' in ticket) return { ok: false, error: ticket.error }
  const imageRaw = String(b.imageUrl ?? '').trim()
  let imageUrl: string | null = null
  if (imageRaw) {
    const image = httpsUrl(imageRaw, 'Image link')
    if ('error' in image) return { ok: false, error: image.error }
    if (image.url && !IMAGE_EXT.test(image.url) && !IMAGE_HOST.test(image.url)) {
      return { ok: false, error: 'Image link should be a direct picture (jpg, png or webp) or a link from your ticket site' }
    }
    imageUrl = image.url ? bestSourceUrl(image.url) : null
  }
  const organiser = httpsUrl(b.organiserUrl, 'Organiser website')
  if ('error' in organiser) return { ok: false, error: organiser.error }
  const galleryUrls = String(b.galleryUrls ?? '').split(/[\s,]+/).flatMap((u) => {
    const parsed = httpsUrl(u, 'Image link')
    return 'url' in parsed && parsed.url ? [parsed.url.slice(0, 500)] : []
  }).slice(0, 8)

  return {
    ok: true,
    listing: {
      title: title.slice(0, 180),
      date,
      endDate,
      time,
      endTime,
      overnight,
      venueName,
      venueAddress: txt(b.venueAddress, 300),
      city,
      category,
      subTags,
      isLGBTI: b.isLGBTI === true || b.isLGBTI === 'true',
      description: txt(b.description, 2000),
      price: isFree ? 'Free' : read.price,
      isFree,
      priceMin: read.min,
      priceMax: read.max,
      ticketUrl: ticket.url,
      imageUrl,
      galleryUrls,
      organiserName: txt(b.organiserName, 160),
      organiserUrl: organiser.url,
      accessibilityInfo: txt(b.accessibilityInfo, 1000),
      ageRestriction: txt(b.ageRestriction, 120),
      transportInfo: txt(b.transportInfo, 1000),
    },
  }
}

/** A campaign that finishes before the event date will not be on the board for the show. */
export function campaignEndsBeforeEvent(eventDate: string, days: number, now = Date.now()): boolean {
  if (!DAY.test(eventDate.slice(0, 10)) || !Number.isFinite(days)) return false
  const ends = new Date(now + days * 86400000)
  const endsKey = ends.toISOString().slice(0, 10)
  return endsKey < eventDate.slice(0, 10)
}
