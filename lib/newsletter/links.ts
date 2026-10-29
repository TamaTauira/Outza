import crypto from 'crypto'
import { siteUrl } from '@/lib/email'

const secret = () => process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'outza'

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
    u.searchParams.set('utm_source', 'outza')
    u.searchParams.set('utm_medium', 'email')
    u.searchParams.set('utm_campaign', `${ctx.edition}-${ctx.issueDate}-${ctx.city.toLowerCase().replace(/\s+/g, '-')}`)
    u.searchParams.set('utm_content', placement)
    return u.toString()
  } catch {
    return url
  }
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

export const exploreUrl = (city: string) => `${siteUrl()}/?city=${encodeURIComponent(city)}`
