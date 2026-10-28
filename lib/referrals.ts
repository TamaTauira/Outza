import { prisma } from '@/lib/prisma'
import { REFERRAL_LABELS, REFERRAL_SOURCES, type ReferralSource } from '@/lib/referral-labels'

export { REFERRAL_LABELS, REFERRAL_SOURCES, type ReferralSource }

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|startpage|brave)\./i
const SOCIAL = /(^|\.)(facebook|fb|instagram|t\.co|x\.com|twitter|tiktok|linkedin|reddit|threads|pinterest|youtube|lnkd)\b/i
const MAIL = /(^|\.)(mail\.google|outlook\.live|mail\.yahoo|mail\.|webmail)/i

/** Classifies where a visit came from using the Referer header and utm_* parameters. */
export function classifyReferral(referer: string | null, ownHost: string | null, utm: { source?: string; medium?: string }): ReferralSource {
  const medium = (utm.medium ?? '').toLowerCase()
  const source = (utm.source ?? '').toLowerCase()
  if (medium === 'email' || /newsletter|weekender|digest|email/.test(source)) return 'EMAIL'
  if (medium === 'social' || SOCIAL.test(source)) return 'SOCIAL'
  if (medium === 'organic' || medium === 'cpc' || SEARCH.test(`${source}.`)) return 'SEARCH'
  if (!referer) return 'DIRECT'
  let host = ''
  try { host = new URL(referer).hostname.toLowerCase() } catch { return 'OTHER' }
  if (ownHost && host === ownHost.toLowerCase().split(':')[0]) return 'OUTZA'
  if (SEARCH.test(host)) return 'SEARCH'
  if (SOCIAL.test(host)) return 'SOCIAL'
  if (MAIL.test(host)) return 'EMAIL'
  return 'OTHER'
}

/** Fire-and-forget counter bump; never blocks or breaks a page render. */
export function recordReferral(eventId: string, source: ReferralSource) {
  prisma.eventReferral
    .upsert({ where: { eventId_source: { eventId, source } }, create: { eventId, source, count: 1 }, update: { count: { increment: 1 } } })
    .catch((err) => console.error('Referral tracking failed:', err))
}
