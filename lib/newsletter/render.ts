import { siteUrl } from '@/lib/email'
import { displayClock, formatDate } from '@/lib/format'
import { formatAddress } from '@/lib/place'
import { priceSummary } from '@/lib/quality'
import { EMAIL_ADDRESS, EMAIL_C, EMAIL_DISCLAIMER, EMAIL_FONT, emailBodyCell, emailButton, emailDateRange, emailDocument, emailEscape, emailEventCard, emailMetaLine, emailSectionHeading } from '@/lib/email-brand'
import type { NlEvent } from './rank'
import { openPixelUrl, plainEmailUrl, trackUrl, unsubscribeUrl, type Placement, type Target, type UtmCtx } from './links'
import { trustLine } from './taste'

export const EDITION_NAME: Record<string, string> = { weekly: 'The Weekender', daily: 'The Daily Drop', monthly: 'The Big Month' }
export const CTA_VARIANTS = { A: { hero: 'Check it out', card: 'View event' }, B: { hero: 'See the experience', card: 'Take a look' } } as const
export type CtaVariant = keyof typeof CTA_VARIANTS

export interface Slot { ev: NlEvent; img: string | null; blurb: string }
export interface RenderInput {
  ctx: UtmCtx
  userId: string
  email: string
  editionKey: string
  city: string
  from: Date
  to: Date
  greeting: string
  intro: string
  preview: string
  subject: string
  cta: CtaVariant
  nearTitle: string
  becauseTitle: string | null
  reminderOptIn: boolean
  hero: Slot | null
  weekend: Slot[]
  because: Slot[]
  saved: Slot[]
  free: Slot[]
  popular: Slot[]
  sponsored: Slot[]
  sponsoredPos: 'mid' | 'end'
  trackOpens: boolean
  /** False skips the click logger. Omitted means the existing tracked links. */
  trackClicks?: boolean
}

function go(r: RenderInput, placement: Placement, target: Target, eventId = '', ticketUrl?: string | null) {
  if (r.trackClicks === false) return plainEmailUrl(r.ctx, placement, target, eventId, ticketUrl)
  return trackUrl(r.ctx, placement, target, eventId)
}

export function whenLine(e: NlEvent) {
  const date = formatDate(e.date.toISOString())
  const clock = e.time ? displayClock(e.time, e.endTime) : ''
  return clock ? `${date} · ${clock}` : date
}

/** Venue, then suburb, then city. A name that already includes the place is not repeated. */
export function whereLine(e: NlEvent) {
  return formatAddress({ venueName: e.venueName, suburb: e.suburb, city: e.city })
}

export function priceLine(e: NlEvent) {
  const p = priceSummary(e)
  return p.range === 'Price not published' ? 'See website' : p.range
}

const statusNote = (e: NlEvent) => (e.status === 'RESCHEDULED' ? 'Rescheduled. Double-check the new date before you go.' : '')

function bannerKind(editionKey: string): string {
  if (editionKey === 'daily') return 'daily-drop'
  if (editionKey === 'monthly') return 'big-month'
  return 'newsletter'
}

function priceKind(e: NlEvent): { text: string; kind: 'free' | 'paid' } | null {
  const text = priceLine(e)
  if (!text || text === 'See website') return null
  if (e.isFree || /^free$/i.test(text)) return { text: 'Free', kind: 'free' }
  return { text, kind: 'paid' }
}

function card(r: RenderInput, s: Slot, placement: Placement, ctaLabel: string, variant: 'row' | 'hero') {
  const priced = priceKind(s.ev)
  const nudge = placement === 'saved'
    ? (r.reminderOptIn ? 'You asked for a nudge. This one’s coming up.' : 'Don’t forget this one.')
    : ''
  return emailEventCard({
    href: go(r, placement, 'detail', s.ev.id),
    title: s.ev.title,
    when: whenLine(s.ev),
    place: whereLine(s.ev),
    price: priced?.text,
    priceKind: priced?.kind ?? null,
    image: s.img,
    category: s.ev.category,
    blurb: s.blurb,
    why: s.ev.whyLine || undefined,
    travel: s.ev.travel || undefined,
    note: [statusNote(s.ev), trustLine(s.ev.source, s.ev.lastVerifiedAt ?? s.ev.updatedAt), nudge].filter(Boolean).join(' '),
    cta: ctaLabel,
    ticketHref: variant === 'hero' && s.ev.ticketUrl ? go(r, placement, 'ticket', s.ev.id, s.ev.ticketUrl) : undefined,
    variant,
  })
}

function section(r: RenderInput, slots: Slot[], placement: Placement, title: string, sub?: string) {
  if (!slots.length) return ''
  return `${emailSectionHeading(title, sub)}${slots.map((s) => card(r, s, placement, CTA_VARIANTS[r.cta].card, 'row')).join('')}`
}

function sponsoredBlock(r: RenderInput) {
  if (!r.sponsored.length) return ''
  const label = `<tr><td class="px" style="padding:0 20px 12px;"><span class="tx" style="display:inline-block;font-family:${EMAIL_FONT};font-size:12px;letter-spacing:1.4px;font-weight:800;color:${EMAIL_C.ink};background:#f0e4d4;border-radius:999px;padding:4px 10px;">SPONSORED</span>
<span class="mu" style="font-family:${EMAIL_FONT};font-size:13px;color:${EMAIL_C.muted};padding-left:8px;">Paid placement from the organiser</span></td></tr>`
  return `${emailSectionHeading('From a promoter')}${label}${r.sponsored.map((s) => card(r, s, 'sponsored', CTA_VARIANTS[r.cta].card, 'row')).join('')}`
}

export function renderHtml(r: RenderInput): string {
  const ed = EDITION_NAME[r.editionKey] ?? 'The Weekender'
  const prefs = go(r, 'footer', 'prefs')
  const unsub = unsubscribeUrl(r.userId, r.ctx.sendId)
  const cta = CTA_VARIANTS[r.cta]
  const because = r.becauseTitle ?? 'Because you liked it'
  const home = siteUrl()
  const rows = [
    emailBodyCell(`<p class="tx" style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:20px;line-height:1.3;font-weight:800;color:${EMAIL_C.ink};">${emailEscape(r.greeting)}</p>
<p class="tx" style="margin:0;font-family:${EMAIL_FONT};font-size:16px;line-height:1.55;color:${EMAIL_C.ink};">${emailEscape(r.intro)}</p>`),
    r.hero ? `${emailSectionHeading('Your top pick')}${card(r, r.hero, 'hero', cta.hero, 'hero')}` : '',
    section(r, r.weekend, 'weekend', r.nearTitle),
    section(r, r.because, 'because', because),
    r.sponsoredPos === 'mid' ? sponsoredBlock(r) : '',
    section(r, r.saved, 'saved', 'Don’t forget these', 'Still yours.'),
    section(r, r.free, 'free', 'Free or cheap'),
    section(r, r.popular, 'popular', `Hot picks in ${r.city}`, 'A starting point while we learn your taste'),
    r.sponsoredPos === 'end' ? sponsoredBlock(r) : '',
    emailBodyCell(`<p class="tx" style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:20px;line-height:1.3;font-weight:800;color:${EMAIL_C.ink};">Still got room in your calendar?</p>
<p class="mu" style="margin:0 0 16px;font-family:${EMAIL_FONT};font-size:15px;line-height:1.5;color:${EMAIL_C.muted};">There’s plenty more happening. Go on, make some plans.</p>
${emailButton(go(r, 'explore', 'explore'), `Explore what’s on in ${r.city}`)}
<p class="tx" style="margin:20px 0 0;font-family:${EMAIL_FONT};font-size:16px;line-height:1.3;font-weight:800;color:${EMAIL_C.ink};">See you out there.</p>`),
  ].join('')

  return emailDocument({
    title: r.subject,
    preheader: r.preview,
    banner: bannerKind(r.editionKey),
    meta: emailMetaLine(r.city, emailDateRange(r.from, r.to)),
    rows,
    homeHref: home,
    manageHref: prefs,
    unsubscribeHref: unsub,
    disclaimer: EMAIL_DISCLAIMER,
    reason: `You’re receiving ${ed} because you opted in to VibePeep emails as ${r.email}. Sponsored placements are paid and always labelled.`,
    after: r.trackOpens ? `<img src="${emailEscape(openPixelUrl(r.ctx.sendId))}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;"/>` : '',
  })
}

export function renderText(r: RenderInput): string {
  const ed = EDITION_NAME[r.editionKey] ?? 'The Weekender'
  const block = (s: Slot, p: Placement) => {
    const trust = trustLine(s.ev.source, s.ev.lastVerifiedAt ?? s.ev.updatedAt)
    const reminder = p === 'saved' ? (r.reminderOptIn ? 'You asked for a nudge. This one\'s coming up.' : 'Don\'t forget this one.') : ''
    const why = s.ev.whyLine ? `Why you're seeing this: ${s.ev.whyLine}` : ''
    return [s.ev.title, why, s.ev.travel, reminder, `${s.ev.category} | ${whenLine(s.ev)}`, whereLine(s.ev), priceLine(s.ev), trust, statusNote(s.ev), s.blurb, go(r, p, 'detail', s.ev.id)].filter(Boolean).join('\n')
  }
  const chunk = (title: string, slots: Slot[], p: Placement) => slots.length ? `${title}\n\n${slots.map((s) => block(s, p)).join('\n\n')}` : ''
  const parts = [
    `${ed} - ${r.city}`,
    emailMetaLine(r.city, emailDateRange(r.from, r.to)),
    r.greeting,
    r.intro,
    r.hero && `YOUR TOP PICK\n\n${block(r.hero, 'hero')}`,
    chunk(r.nearTitle.toUpperCase(), r.weekend, 'weekend'),
    chunk((r.becauseTitle ?? 'BECAUSE YOU LIKED IT').toUpperCase(), r.because, 'because'),
    r.sponsoredPos === 'mid' && r.sponsored.length && `FROM A PROMOTER - SPONSORED (paid placement)\n\n${r.sponsored.map((s) => block(s, 'sponsored')).join('\n\n')}`,
    chunk('DON\'T FORGET THESE', r.saved, 'saved'),
    chunk('FREE OR CHEAP', r.free, 'free'),
    chunk(`HOT PICKS IN ${r.city.toUpperCase()}`, r.popular, 'popular'),
    r.sponsoredPos === 'end' && r.sponsored.length && `FROM A PROMOTER - SPONSORED (paid placement)\n\n${r.sponsored.map((s) => block(s, 'sponsored')).join('\n\n')}`,
    `Still got room in your calendar? There's plenty more happening.\nExplore what's on in ${r.city}: ${go(r, 'explore', 'explore')}`,
    `See you out there.\nManage preferences: ${go(r, 'footer', 'prefs')}\nUnsubscribe: ${unsubscribeUrl(r.userId, r.ctx.sendId)}\nPrivacy: ${siteUrl()}/privacy\n${EMAIL_ADDRESS}\n${EMAIL_DISCLAIMER}\nYou're receiving this because you opted in to VibePeep emails as ${r.email}. Sponsored placements are paid and always labelled.`,
  ]
  return parts.filter(Boolean).join('\n\n')
}
