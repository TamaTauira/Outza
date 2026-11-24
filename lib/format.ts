import { formatPrice as priceParts } from '@/lib/price'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const PRICE_FALLBACK = 'See website'
export const TIME_UNLISTED = 'Time not listed'

/** "7:30 pm". Keeps :00. Empty when the listing has no clock time. */
export function formatTime(t: string | null | undefined): string {
  if (!t) return ''
  const match = t.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  const hour = Number(match[1])
  if (!Number.isFinite(hour)) return ''
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${match[2]} ${hour < 12 ? 'am' : 'pm'}`
}

/** "Sat 21 Nov" on a card, "Saturday 21 November" on a detail page. */
export function formatDate(iso: string | null | undefined, style: 'card' | 'detail' = 'card'): string {
  const key = iso?.slice(0, 10) ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return ''
  const date = new Date(`${key}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.getUTCDate()
  if (style === 'detail') return `${WEEKDAYS_LONG[date.getUTCDay()]} ${day} ${MONTHS_LONG[date.getUTCMonth()]}`
  return `${WEEKDAYS[date.getUTCDay()]} ${day} ${MONTHS[date.getUTCMonth()]}`
}

export function formatPrice(
  isFree: boolean,
  price: string | null,
  priceMin?: number | null,
  priceMax?: number | null,
) {
  const parts = priceParts(isFree, price, priceMin, priceMax)
  if (parts.kind === 'unknown') return { ...parts, value: PRICE_FALLBACK }
  return parts
}
