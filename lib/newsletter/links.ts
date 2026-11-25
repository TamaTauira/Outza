import crypto from 'crypto'
import { siteUrl } from '@/lib/email'
import { stripTrackingParams } from '@/lib/listing-link'

/** Signing key for email links. Production refuses a missing secret instead of a brand-name fallback. */
export function emailLinkSecret(): string {
  const value = (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || '').trim()
  if (value) return value
  if (process.env.NODE_ENV === 'production') throw new Error('NEXTAUTH_SECRET is required to sign email links')
  return 'vibepeep-dev-link-secret'
}

const secret = () => emailLinkSecret()

export function sign(...parts: string[]) {
  return crypto.createHmac('sha256', secret()).update(parts.join('|')).digest('base64url').slice(0, 22)
}

export function verify(sig: string | null | undefined, ...parts: string[]) {
  if (!sig) return false
  const a = Buffer.from(sign(...parts))
  const b = Buffer.from(sig)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export type Placement = 'hero' | 'picks' | 'weekend' | 'because' | 'saved' | 'free' | 'popular' | 'wildcard' | 'sponsored' | 'explore' | 'footer'
export type Target = 'detail' | 'ticket' | 'explore' | 'prefs'

export interface UtmCtx { sendId: string; edition: string; issueDate: string; city: string }

export function utm(url: string, ctx: UtmCtx, placement: string) {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', 'vibepeep')
    u.searchParams.set('utm_medium', 'email')
    u.searchParams.set('utm_campaign', `${ctx.edition}-${ctx.issueDate}-${ctx.city.toLowerCase().replace(/\s+/g, '-')}`)
    u.searchParams.set('utm_content', placement)
    return u.toString()
  } catch {
    return url
  }
}

/** Direct link for someone who opted out of email-activity personalisation. UTM may remain. No click log. */
export function plainEmailUrl(ctx: UtmCtx, placement: Placement, target: Target, eventId = '', ticketUrl?: string | null) {
  let dest = siteUrl()
  if (target === 'explore') dest = exploreUrl(ctx.city)
  else if (target === 'prefs') dest = `${siteUrl()}/account`
  else if (target === 'ticket' && ticketUrl && /^https?:\/\//.test(ticketUrl)) dest = stripTrackingParams(ticketUrl) ?? ticketUrl
  else if (eventId) dest = `${siteUrl()}/events/${eventId}`
  if (target === 'prefs') return dest
  return utm(dest, ctx, placement)
}

/** Signed click-tracking URL. The redirect route logs the click then forwards with UTM tags. */
export function trackUrl(ctx: UtmCtx, placement: Placement, target: Target, eventId = '') {
  const q = new URLSearchParams({ s: ctx.sendId, p: placement, t: target })
  if (eventId) q.set('e', eventId)
  q.set('k', sign(ctx.sendId, placement, target, eventId))
  return `${siteUrl()}/api/nl/c?${q}`
}

export const openPixelUrl = (sendId: string) => `${siteUrl()}/api/nl/o?s=${sendId}&k=${sign(sendId, 'open')}`

export function unsubscribeUrl(userId: string, sendId?: string) {
  const q = new URLSearchParams({ u: userId, k: sign(userId, 'unsub') })
  if (sendId) q.set('s', sendId)
  return `${siteUrl()}/unsubscribe?${q}`
}

/** RFC 8058 target. The token stays in the query so a form POST can unsubscribe. */
export function unsubscribeApiUrl(userId: string, sendId?: string) {
  const q = new URLSearchParams({ u: userId, k: sign(userId, 'unsub') })
  if (sendId) q.set('s', sendId)
  return `${siteUrl()}/api/nl/unsubscribe?${q}`
}

/** Query string first, then a JSON or form body. One-click posts the token in the URL. */
export async function readUnsubscribeFields(req: Request): Promise<{ u: string; k: string; s: string }> {
  const url = new URL(req.url)
  let u = url.searchParams.get('u') ?? ''
  let k = url.searchParams.get('k') ?? ''
  let s = url.searchParams.get('s') ?? ''
  const type = req.headers.get('content-type') ?? ''
  if (!u || !k) {
    if (type.includes('application/json')) {
      const body = await req.json().catch(() => ({})) as { u?: unknown; k?: unknown; s?: unknown }
      if (!u && typeof body.u === 'string') u = body.u
      if (!k && typeof body.k === 'string') k = body.k
      if (!s && typeof body.s === 'string') s = body.s
    } else {
      const text = await req.text().catch(() => '')
      if (text) {
        const params = new URLSearchParams(text)
        if (!u) u = params.get('u') ?? ''
        if (!k) k = params.get('k') ?? ''
        if (!s) s = params.get('s') ?? ''
      }
    }
  }
  return { u, k, s }
}

export const exploreUrl = (city: string) => `${siteUrl()}/?city=${encodeURIComponent(city)}`
