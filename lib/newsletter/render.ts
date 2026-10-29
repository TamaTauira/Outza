import { escapeHtml as x, siteUrl } from '@/lib/email'
import { formatTime } from '@/lib/board'
import { priceSummary } from '@/lib/quality'
import { ACKNOWLEDGEMENT_OF_COUNTRY } from '@/lib/cities'
import { CATEGORIES } from '@/lib/categories'
import type { NlEvent } from './rank'
import { exploreUrl, openPixelUrl, trackUrl, unsubscribeUrl, type Placement, type UtmCtx } from './links'
import { emailLockup } from '@/lib/email-brand'
import { BRAND_TAGLINE, BRAND_WORDMARK_HEIGHT, BRAND_WORDMARK_SRC, BRAND_WORDMARK_WIDTH } from '@/lib/brand'

const C = { ink: '#1c1c1e', head: '#141414', accent: '#FF4E6A', page: '#f6f2ec', card: '#ffffff', muted: '#6b6b6b', line: '#ebe5dc', spons: '#f1ece4' }
const FONT = `'Helvetica Neue',Helvetica,Arial,sans-serif`

export const EDITION_NAME: Record<string, string> = { weekly: 'THE WEEKENDER', daily: 'THE DAILY DROP', monthly: 'THE BIG MONTH' }
export const CTA_VARIANTS = { A: { hero: 'Check it out', card: 'See details' }, B: { hero: 'See the experience', card: 'Take a look' } } as const
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
  headline: string
  intro: string
  preview: string
  subject: string
  cta: CtaVariant
  hero: Slot | null
  picks: Slot[]
  wildcard: Slot | null
  sponsored: Slot[]
  sponsoredPos: 'mid' | 'end'
  trackOpens: boolean
}

const day = (d: Date, o: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) => d.toLocaleDateString('en-AU', { ...o, timeZone: 'UTC' })
export function whenLine(e: NlEvent) {
  const t = e.time ? formatTime(e.time) : null
  return `${day(e.date)}${t ? ` · ${t.hm}${t.ampm}` : ''}`
}
export const whereLine = (e: NlEvent) => `${e.venueName}${e.suburb && !e.venueName.toLowerCase().includes(e.suburb.toLowerCase()) ? `, ${e.suburb}` : ''}`
export function priceLine(e: NlEvent) {
  const p = priceSummary(e)
  return p.range === 'Price not published' ? 'Prices on the ticket site' : p.range
}
const statusNote = (e: NlEvent) => (e.status === 'RESCHEDULED' ? 'Rescheduled - double-check the new date before you go.' : '')

function button(href: string, label: string, solid = true) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${solid ? C.accent : C.card}" style="border-radius:999px;${solid ? '' : `border:2px solid ${C.accent};`}">
<a href="${href}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:${solid ? '#ffffff' : C.accent};text-decoration:none;border-radius:999px;">${x(label)} &rarr;</a></td></tr></table>`
}

function fallbackArt(category: string, h: number, w: number | '100%') {
  const cat = CATEGORIES.find((c) => c.name === category)
  const wordH = h > 150 ? 22 : 14
  const wordW = Math.round((wordH * BRAND_WORDMARK_WIDTH) / BRAND_WORDMARK_HEIGHT)
  const lockup = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FBF8F3" style="background:#FBF8F3;border-radius:4px;padding:3px 6px;line-height:0;"><img src="${siteUrl()}${BRAND_WORDMARK_SRC}" width="${wordW}" height="${wordH}" alt="VibePeep" style="display:block;width:${wordW}px;height:${wordH}px;border:0;"/></td></tr></table>`
  return `<table role="presentation" width="${w}" cellpadding="0" cellspacing="0" border="0" style="width:${w === '100%' ? '100%' : `${w}px`};"><tr>
<td height="${h}" bgcolor="${C.head}" valign="bottom" style="height:${h}px;background:${C.head};border-radius:14px;padding:${h > 150 ? 22 : 12}px;border-bottom:4px solid ${cat?.color ?? C.accent};">
${lockup}
<div style="font-family:${FONT};font-size:${h > 150 ? 10 : 8}px;color:#a3a3a3;padding-top:6px;padding-bottom:${h > 150 ? 8 : 4}px;">${BRAND_TAGLINE}</div>
<div style="font-family:${FONT};font-size:${h > 150 ? 30 : 15}px;line-height:1.1;font-weight:800;color:#ffffff;">${x(category)}</div></td></tr></table>`
}

const img = (src: string, alt: string, w: number, h: number | null, radius: number) =>
  `<img src="${src}" alt="${x(alt)}" width="${w}" ${h ? `height="${h}"` : ''} style="display:block;width:100%;max-width:${w}px;${h ? `height:${h}px;object-fit:cover;` : 'height:auto;'}border:0;border-radius:${radius}px;outline:none;text-decoration:none;" />`

function meta(e: NlEvent, size = 14) {
  const note = statusNote(e)
  return `<div class="mu" style="font-family:${FONT};font-size:${size}px;line-height:1.5;color:${C.muted};">${x(whenLine(e))}<br/>${x(whereLine(e))}</div>
<div style="font-family:${FONT};font-size:${size}px;font-weight:700;color:${C.accent};padding-top:4px;">${x(priceLine(e))}</div>${note ? `<div style="font-family:${FONT};font-size:12px;color:#b45309;padding-top:4px;">${x(note)}</div>` : ''}`
}

function kicker(label: string, sub?: string) {
  return `<tr><td class="px" style="padding:34px 32px 12px;"><div style="font-family:${FONT};font-size:12px;letter-spacing:3px;font-weight:800;color:${C.accent};">${x(label)}</div>${sub ? `<div class="tx" style="font-family:${FONT};font-size:20px;font-weight:800;color:${C.ink};padding-top:4px;">${x(sub)}</div>` : ''}</td></tr>`
}

function compactCard(r: RenderInput, s: Slot, placement: Placement, ctaLabel: string, bg = C.card) {
  const href = trackUrl(r.ctx, placement, 'detail', s.ev.id)
  const thumb = s.img ? `<a href="${href}">${img(s.img, `${s.ev.title} - event image`, 120, 120, 12)}</a>` : `<a href="${href}" style="text-decoration:none;">${fallbackArt(s.ev.category, 120, 120)}</a>`
  return `<tr><td class="px" style="padding:0 32px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card" bgcolor="${bg}" style="background:${bg};border-radius:16px;"><tr>
<td width="120" valign="top" style="padding:14px 0 14px 14px;width:120px;">${thumb}</td>
<td valign="top" style="padding:14px 16px 14px 14px;">
<div style="font-family:${FONT};font-size:11px;letter-spacing:1.5px;font-weight:700;color:${C.accent};text-transform:uppercase;">${x(s.ev.category)}</div>
<a href="${href}" class="tx" style="font-family:${FONT};font-size:17px;line-height:1.25;font-weight:800;color:${C.ink};text-decoration:none;">${x(s.ev.title)}</a>
${meta(s.ev, 13)}
<div class="tx" style="font-family:${FONT};font-size:14px;line-height:1.45;color:${C.ink};padding-top:6px;">${x(s.blurb)}</div>
<div style="padding-top:8px;"><a href="${href}" style="font-family:${FONT};font-size:14px;font-weight:700;color:${C.accent};text-decoration:none;">${x(ctaLabel)} &rarr;</a></div>
</td></tr></table></td></tr>`
}

function bigCard(r: RenderInput, s: Slot, placement: Placement, ctaLabel: string, solid: boolean) {
  const href = trackUrl(r.ctx, placement, 'detail', s.ev.id)
  const art = s.img ? `<a href="${href}">${img(s.img, `${s.ev.title} - event image`, 536, null, 14)}</a>` : `<a href="${href}" style="text-decoration:none;">${fallbackArt(s.ev.category, 240, '100%')}</a>`
  const tix = s.ev.ticketUrl ? `<td style="padding-left:16px;"><a href="${trackUrl(r.ctx, placement, 'ticket', s.ev.id)}" style="font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink};text-decoration:underline;" class="tx">Tickets &amp; info</a></td>` : ''
  return `<tr><td class="px" style="padding:0 32px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card" bgcolor="${C.card}" style="background:${C.card};border-radius:18px;">
<tr><td style="padding:16px 16px 0;">${art}</td></tr>
<tr><td style="padding:18px 22px 22px;">
<div style="font-family:${FONT};font-size:11px;letter-spacing:1.5px;font-weight:700;color:${C.accent};text-transform:uppercase;">${x(s.ev.category)}</div>
<a href="${href}" class="tx" style="font-family:${FONT};font-size:24px;line-height:1.2;font-weight:800;color:${C.ink};text-decoration:none;">${x(s.ev.title)}</a>
<div style="padding-top:6px;">${meta(s.ev, 14)}</div>
<div class="tx" style="font-family:${FONT};font-size:16px;line-height:1.5;color:${C.ink};padding:12px 0 18px;">${x(s.blurb)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td>${button(href, ctaLabel, solid)}</td>${tix}</tr></table>
</td></tr></table></td></tr>`
}

function sponsoredBlock(r: RenderInput) {
  if (!r.sponsored.length) return ''
  return `<tr><td class="px" style="padding:30px 32px 0;"><div style="font-family:${FONT};font-size:12px;letter-spacing:3px;font-weight:800;color:${C.accent};">HOT &amp; PROMOTED</div></td></tr>
<tr><td class="px" style="padding:8px 32px 10px;"><span style="display:inline-block;font-family:${FONT};font-size:10px;letter-spacing:2px;font-weight:800;color:${C.ink};background:#e3dccf;border-radius:999px;padding:4px 10px;">SPONSORED</span>
<span class="mu" style="font-family:${FONT};font-size:12px;color:${C.muted};padding-left:6px;">Paid placement from the organiser</span></td></tr>
${r.sponsored.map((s) => compactCard(r, s, 'sponsored', CTA_VARIANTS[r.cta].card, C.spons)).join('')}`
}

export function renderHtml(r: RenderInput): string {
  const ed = EDITION_NAME[r.editionKey] ?? 'THE WEEKENDER'
  const last = new Date(r.to.getTime() - 86400e3)
  const range = `${day(r.from, { weekday: 'short', day: 'numeric', month: 'short' })} – ${day(last, { weekday: 'short', day: 'numeric', month: 'short' })}`
  const prefs = trackUrl(r.ctx, 'footer', 'prefs')
  const unsub = unsubscribeUrl(r.userId, r.ctx.sendId)
  const cta = CTA_VARIANTS[r.cta]
  const link = (href: string, label: string) => `<a href="${href}" style="color:#d6d6d6;text-decoration:underline;">${label}</a>`

  return `<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="color-scheme" content="light dark"/><meta name="supported-color-schemes" content="light dark"/><title>${x(r.subject)}</title>
<style>
body{margin:0;padding:0;-webkit-text-size-adjust:100%;}
@media (max-width:620px){.w100{width:100%!important}.px{padding-left:18px!important;padding-right:18px!important}.h1{font-size:30px!important}}
@media (prefers-color-scheme:dark){.bg{background:#0f0f10!important}.card{background:#1f1f22!important}.tx{color:#f3f3f3!important}.mu{color:#b8b8b8!important}}
</style></head>
<body class="bg" style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${x(r.preview)}${'&#8204;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" bgcolor="${C.page}" style="background:${C.page};"><tr><td align="center" style="padding:20px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="w100 bg" style="width:600px;max-width:600px;background:${C.page};">

<tr><td class="px" bgcolor="${C.head}" style="background:${C.head};border-radius:20px 20px 0 0;padding:28px 32px 34px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td><a href="${siteUrl()}" style="text-decoration:none;color:inherit;">${emailLockup({ dark: true })}</a></td>
<td align="right" style="font-family:${FONT};font-size:11px;letter-spacing:3px;font-weight:800;color:${C.accent};">${x(ed)}</td></tr></table>
<div style="font-family:${FONT};font-size:12px;letter-spacing:2px;color:#a3a3a3;padding-top:26px;text-transform:uppercase;">${x(r.city)} &nbsp;·&nbsp; ${x(range)}</div>
<div class="h1" style="font-family:${FONT};font-size:36px;line-height:1.08;font-weight:900;color:#ffffff;padding-top:10px;letter-spacing:-0.5px;">${x(r.headline)}</div>
<div style="font-family:${FONT};font-size:16px;line-height:1.55;color:#d4d4d4;padding-top:12px;">${x(r.intro)}</div>
<div style="height:4px;width:56px;background:${C.accent};margin-top:22px;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
</td></tr>

${r.hero ? `${kicker('THE BIG ONE')}${bigCard(r, r.hero, 'hero', cta.hero, true)}` : ''}
${r.picks.length ? `${kicker('PICKED FOR YOU', r.picks.length === 1 ? 'One more we reckon you’ll like' : 'A few more we reckon you’ll like')}${r.picks.map((s) => compactCard(r, s, 'picks', cta.card)).join('')}` : ''}
${r.sponsoredPos === 'mid' ? sponsoredBlock(r) : ''}
${r.wildcard ? `${kicker('THE VIBEPEEP WILDCARD', 'Something different? Don’t mind if we do.')}${bigCard(r, r.wildcard, 'wildcard', 'Try something new', false)}` : ''}
${r.sponsoredPos === 'end' ? sponsoredBlock(r) : ''}

<tr><td class="px" style="padding:30px 32px 34px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ink}" style="background:${C.ink};border-radius:18px;"><tr><td align="center" style="padding:30px 24px;">
<div style="font-family:${FONT};font-size:22px;font-weight:900;color:#ffffff;">Still got room in your calendar?</div>
<div style="font-family:${FONT};font-size:15px;line-height:1.5;color:#cfcfcf;padding:8px 0 20px;">There’s plenty more happening. Go on, make some plans.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>${button(trackUrl(r.ctx, 'explore', 'explore'), `Explore what’s on in ${r.city}`)}</td></tr></table>
</td></tr></table></td></tr>

<tr><td class="px" bgcolor="${C.head}" style="background:${C.head};border-radius:0 0 20px 20px;padding:30px 32px;">
<div style="padding-bottom:4px;">${emailLockup({ dark: true })}</div>
<div style="font-family:${FONT};font-size:13px;line-height:2;color:#d6d6d6;padding-top:16px;">${link(prefs, 'Manage preferences')} &nbsp;·&nbsp; ${link(prefs, 'Change frequency')} &nbsp;·&nbsp; ${link(unsub, 'Unsubscribe')} &nbsp;·&nbsp; ${link(`${siteUrl()}/privacy`, 'Privacy policy')} &nbsp;·&nbsp; ${link(`${siteUrl()}/disclaimer`, 'Disclaimer')}</div>
<div style="font-family:${FONT};font-size:12px;line-height:1.6;color:#9a9a9a;padding-top:14px;">You’re receiving ${x(ed.toLowerCase().replace(/^the /, 'The '))} (${x(r.editionKey)}) because you opted in to VibePeep emails as <span style="color:#d6d6d6;">${x(r.email)}</span>. Sent by VibePeep, an independent events guide. Sponsored placements are paid for by event organisers and are always labelled. Listings come from organisers and ticketing sites and can change: prices are as last listed and may exclude booking fees, so always confirm with the organiser or ticket seller before you go.</div>
<div style="font-family:${FONT};font-size:12px;line-height:1.6;color:#9a9a9a;padding-top:14px;border-top:1px solid #2a2a2a;margin-top:16px;"><strong style="color:#d6d6d6;">Acknowledgement of Country.</strong> ${x(ACKNOWLEDGEMENT_OF_COUNTRY)}</div>
</td></tr>
</table></td></tr></table>
${r.trackOpens ? `<img src="${openPixelUrl(r.ctx.sendId)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;"/>` : ''}
</body></html>`
}

export function renderText(r: RenderInput): string {
  const ed = EDITION_NAME[r.editionKey] ?? 'THE WEEKENDER'
  const block = (s: Slot, p: Placement) =>
    [s.ev.title, `${s.ev.category} | ${whenLine(s.ev)}`, whereLine(s.ev), priceLine(s.ev), statusNote(s.ev), s.blurb, trackUrl(r.ctx, p, 'detail', s.ev.id)].filter(Boolean).join('\n')
  const parts = [
    `VibePeep. Take a peep at what's happening.\nEvents · Experiences · Local discoveries.\n${ed} - ${r.city}`,
    r.headline,
    r.intro,
    r.hero && `THE BIG ONE\n\n${block(r.hero, 'hero')}`,
    r.picks.length && `PICKED FOR YOU\n\n${r.picks.map((s) => block(s, 'picks')).join('\n\n')}`,
    r.sponsoredPos === 'mid' && r.sponsored.length && `HOT & PROMOTED - SPONSORED (paid placement)\n\n${r.sponsored.map((s) => block(s, 'sponsored')).join('\n\n')}`,
    r.wildcard && `THE VIBEPEEP WILDCARD - Something different? Don't mind if we do.\n\n${block(r.wildcard, 'wildcard')}`,
    r.sponsoredPos === 'end' && r.sponsored.length && `HOT & PROMOTED - SPONSORED (paid placement)\n\n${r.sponsored.map((s) => block(s, 'sponsored')).join('\n\n')}`,
    `Still got room in your calendar? There's plenty more happening.\nExplore what's on in ${r.city}: ${trackUrl(r.ctx, 'explore', 'explore')}`,
    `---\nVibePeep. Take a peep at what's happening.\nManage preferences / change frequency: ${trackUrl(r.ctx, 'footer', 'prefs')}\nUnsubscribe: ${unsubscribeUrl(r.userId, r.ctx.sendId)}\nPrivacy policy: ${siteUrl()}/privacy\nYou're receiving this because you opted in to VibePeep emails as ${r.email}. Sponsored placements are paid and always labelled. Details can change - confirm with the organiser before you go.\n\nAcknowledgement of Country. ${ACKNOWLEDGEMENT_OF_COUNTRY}`,
  ]
  return parts.filter(Boolean).join('\n\n')
}

export { exploreUrl }
