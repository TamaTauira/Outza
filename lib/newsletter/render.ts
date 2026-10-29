import { escapeHtml as x, siteUrl } from '@/lib/email'
import { formatTime } from '@/lib/board'
import { priceSummary } from '@/lib/quality'
import { ACKNOWLEDGEMENT_OF_COUNTRY } from '@/lib/cities'
import { categoryColor, categoryInk } from '@/lib/categories'
import { BRAND_MASCOT_EMAIL_HEIGHT, BRAND_MASCOT_EMAIL_WIDTH, BRAND_WORDMARK_DARK_SRC, BRAND_WORDMARK_HEIGHT, BRAND_WORDMARK_WIDTH } from '@/lib/brand'
import { CANONICAL_SITE_URL } from '@/lib/site-url'
import type { NlEvent } from './rank'
import { openPixelUrl, trackUrl, unsubscribeUrl, type Placement, type UtmCtx } from './links'
import { MASCOT_EMAIL_URL } from './images'
import { trustLine } from './taste'

const C = {
  ink: '#1c1c1e',
  head: '#141414',
  accent: '#FF4E6A',
  orange: '#FF8A1A',
  deep: '#E24B2A',
  page: '#f6f1ea',
  card: '#ffffff',
  muted: '#5e5e5e',
  line: '#efe6dc',
  spons: '#fff6ee',
  why: '#fff1ea',
  onDark: '#f7f7f7',
  onDarkMuted: '#c8c8c8',
}
const FONT = `'Helvetica Neue',Helvetica,Arial,sans-serif`
const THUMB = 104
const HERO_W = 552
const HERO_H = 311
const WORD_H = 36
const WORD_W = Math.round((WORD_H * BRAND_WORDMARK_WIDTH) / BRAND_WORDMARK_HEIGHT)
const MASCOT_W = 64
const MASCOT_H = Math.round((MASCOT_W * BRAND_MASCOT_EMAIL_HEIGHT) / BRAND_MASCOT_EMAIL_WIDTH)
const WORDMARK_URL = `${CANONICAL_SITE_URL}${BRAND_WORDMARK_DARK_SRC}`

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
const T = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'

function button(href: string, label: string) {
  const safe = x(label)
  const url = x(href)
  const width = Math.min(340, Math.max(168, label.length * 8 + 56))
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:46px;v-text-anchor:middle;width:${width}px;" arcsize="50%" strokecolor="${C.accent}" fillcolor="${C.accent}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;">${safe} &#8594;</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<table ${T}><tr><td bgcolor="${C.accent}" style="border-radius:999px;background:${C.accent};">
<a href="${url}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${safe} &rarr;</a>
</td></tr></table>
<!--<![endif]-->`
}

function wordmark() {
  return `<img src="${WORDMARK_URL}" alt="VibePeep" width="${WORD_W}" height="${WORD_H}" style="display:block;width:${WORD_W}px;height:${WORD_H}px;border:0;outline:none;text-decoration:none;" />`
}

function mascot() {
  return `<img src="${MASCOT_EMAIL_URL}" alt="VibePeep mascot" width="${MASCOT_W}" height="${MASCOT_H}" style="display:block;width:${MASCOT_W}px;height:${MASCOT_H}px;border:0;outline:none;text-decoration:none;" />`
}

function coverArt(src: string, alt: string, w: number, h: number, href: string, kind: 'hero' | 'thumb') {
  const url = x(href)
  const img = x(src)
  const cls = kind === 'hero' ? 'heroimg' : 'thumbimg'
  const box = kind === 'hero' ? 'heroBox' : 'thumbBox'
  const radius = kind === 'hero' ? 16 : 12
  const imgStyle = kind === 'hero'
    ? `display:block;width:${w}px;max-width:100%;height:${h}px;object-fit:cover;border:0;outline:none;text-decoration:none;border-radius:${radius}px;-ms-interpolation-mode:bicubic;`
    : `display:block;width:${w}px;height:${h}px;max-width:${w}px;object-fit:cover;border:0;outline:none;text-decoration:none;border-radius:${radius}px;-ms-interpolation-mode:bicubic;`
  return `<a href="${url}" style="text-decoration:none;">
<!--[if mso]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${w}px;height:${h}px;">
<v:fill type="frame" src="${img}" color="${C.line}" aspect="atleast" />
<v:textbox inset="0,0,0,0"><div style="font-size:0;line-height:0;">
<![endif]-->
<div class="${box}" style="width:${w}px;height:${h}px;max-width:100%;background-color:${C.line};background-image:url('${img}');background-repeat:no-repeat;background-position:center center;background-size:cover;border-radius:${radius}px;overflow:hidden;font-size:0;line-height:0;">
<!--[if !mso]><!-->
<img class="${cls}" src="${img}" alt="${x(alt)}" width="${w}" height="${h}" style="${imgStyle}" />
<!--<![endif]-->
</div>
<!--[if mso]></div></v:textbox></v:rect><![endif]-->
</a>`
}

function categoryBlock(category: string, w: number, h: number, href: string, kind: 'hero' | 'thumb') {
  const bg = categoryColor(category)
  const fg = categoryInk(bg)
  const size = kind === 'hero' ? 22 : 12
  const radius = kind === 'hero' ? 16 : 12
  const cls = kind === 'hero' ? 'heroBox heroPh' : 'thumbBox'
  return `<a href="${x(href)}" style="text-decoration:none;">
<table ${T} class="${cls}" width="${w}" height="${h}" bgcolor="${bg}" style="width:${w}px;height:${h}px;background:${bg};border-radius:${radius}px;">
<tr><td class="${kind === 'hero' ? 'heroPh' : ''}" align="center" valign="middle" width="${w}" height="${h}" bgcolor="${bg}" style="width:${w}px;height:${h}px;background:${bg};border-radius:${radius}px;font-family:${FONT};font-size:${size}px;line-height:1.3;font-weight:800;letter-spacing:1.2px;color:${fg};text-transform:uppercase;padding:10px;">
${x(category.trim() || 'Event')}
</td></tr></table></a>`
}

function art(src: string | null, alt: string, w: number, h: number, href: string, category: string, kind: 'hero' | 'thumb') {
  if (!src) return categoryBlock(category, w, h, href, kind)
  return coverArt(src, alt, w, h, href, kind)
}

function meta(e: NlEvent) {
  const note = statusNote(e)
  const trust = trustLine(e.source, e.lastVerifiedAt ?? e.updatedAt)
  return `<div class="mu" style="font-family:${FONT};font-size:14px;line-height:1.45;color:${C.muted};padding-top:6px;">${x(whenLine(e))}</div>
<div class="mu" style="font-family:${FONT};font-size:14px;line-height:1.45;color:${C.muted};">${x(whereLine(e))}</div>
<div class="price" style="font-family:${FONT};font-size:14px;line-height:1.45;font-weight:700;color:${C.deep};padding-top:2px;">${x(priceLine(e))}</div>
${note ? `<div style="font-family:${FONT};font-size:13px;line-height:1.4;color:#9a3412;padding-top:6px;">${x(note)}</div>` : ''}
${trust ? `<div class="mu" style="font-family:${FONT};font-size:12px;line-height:1.4;color:${C.muted};padding-top:6px;">${x(trust)}</div>` : ''}`
}

function whyBlock(e: NlEvent) {
  if (!e.whyLine && !e.travel) return ''
  const reason = e.whyLine
    ? `<table ${T} width="100%"><tr>
<td width="3" bgcolor="${C.accent}" style="width:3px;background:${C.accent};font-size:0;line-height:0;">&nbsp;</td>
<td class="why" bgcolor="${C.why}" style="background:${C.why};padding:8px 10px;">
<div style="font-family:${FONT};font-size:10px;line-height:1.3;letter-spacing:1.1px;font-weight:800;color:${C.deep};text-transform:uppercase;">Why you're seeing this</div>
<div class="whyTx tx" style="font-family:${FONT};font-size:13px;line-height:1.4;color:${C.ink};padding-top:2px;">${x(e.whyLine)}</div>
</td></tr></table>`
    : ''
  const travel = e.travel ? `<div class="mu" style="font-family:${FONT};font-size:13px;line-height:1.4;color:${C.muted};padding-top:6px;">${x(e.travel)}</div>` : ''
  return `<div style="padding-top:10px;">${reason}${travel}</div>`
}

function sectionHead(title: string, sub?: string) {
  return `<tr><td class="px" style="padding:28px 24px 12px;">
<div class="tx" style="font-family:${FONT};font-size:20px;line-height:1.25;font-weight:800;color:${C.ink};">${x(title)}</div>
${sub ? `<div class="mu" style="font-family:${FONT};font-size:14px;line-height:1.4;color:${C.muted};padding-top:4px;">${x(sub)}</div>` : ''}
</td></tr>`
}

function compactCard(r: RenderInput, s: Slot, placement: Placement, ctaLabel: string, bg = C.card) {
  const href = trackUrl(r.ctx, placement, 'detail', s.ev.id)
  const alt = `${s.ev.title} at ${s.ev.venueName}`
  const thumb = art(s.img, alt, THUMB, THUMB, href, s.ev.category, 'thumb')
  const nudge = placement === 'saved'
    ? `<div style="font-family:${FONT};font-size:13px;line-height:1.4;color:${C.accent};padding-top:8px;">${x(r.reminderOptIn ? 'Reminder: you asked for a nudge, and this one is coming up.' : 'Reminder: still on your list.')}</div>`
    : ''
  return `<tr><td class="px" style="padding:0 24px 12px;">
<table ${T} width="100%" class="card" bgcolor="${bg}" style="background:${bg};border:1px solid ${C.line};border-radius:16px;"><tr>
<td class="thumb" width="${THUMB}" valign="top" style="width:${THUMB}px;padding:12px 0 12px 12px;">${thumb}</td>
<td valign="top" style="padding:14px 16px 16px 12px;">
<div style="font-family:${FONT};font-size:11px;line-height:1.3;letter-spacing:1.2px;font-weight:800;color:${C.accent};text-transform:uppercase;">${x(s.ev.category)}</div>
<a href="${x(href)}" class="tx" style="font-family:${FONT};font-size:18px;line-height:1.25;font-weight:800;color:${C.ink};text-decoration:none;">${x(s.ev.title)}</a>
${meta(s.ev)}
${whyBlock(s.ev)}
${nudge}
<div class="tx" style="font-family:${FONT};font-size:14px;line-height:1.5;color:${C.ink};padding-top:8px;">${x(s.blurb)}</div>
<div style="padding-top:10px;"><a href="${x(href)}" style="font-family:${FONT};font-size:14px;font-weight:700;color:${C.accent};text-decoration:none;">${x(ctaLabel)} &rarr;</a></div>
</td></tr></table></td></tr>`
}

function bigCard(r: RenderInput, s: Slot, placement: Placement, ctaLabel: string) {
  const href = trackUrl(r.ctx, placement, 'detail', s.ev.id)
  const alt = `${s.ev.title} at ${s.ev.venueName}`
  const picture = art(s.img, alt, HERO_W, HERO_H, href, s.ev.category, 'hero')
  const tix = s.ev.ticketUrl
    ? `<td style="padding-left:16px;"><a href="${x(trackUrl(r.ctx, placement, 'ticket', s.ev.id))}" class="tx" style="font-family:${FONT};font-size:14px;font-weight:700;color:${C.ink};text-decoration:underline;">Tickets &amp; info</a></td>`
    : ''
  return `<tr><td class="px" style="padding:0 24px 8px;">
<table ${T} width="100%" class="card" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-radius:18px;">
<tr><td style="padding:0;font-size:0;line-height:0;">${picture}</td></tr>
<tr><td style="padding:18px 20px 22px;">
<div style="font-family:${FONT};font-size:11px;line-height:1.3;letter-spacing:1.2px;font-weight:800;color:${C.accent};text-transform:uppercase;">${x(s.ev.category)}</div>
<a href="${x(href)}" class="tx" style="font-family:${FONT};font-size:26px;line-height:1.2;font-weight:800;color:${C.ink};text-decoration:none;">${x(s.ev.title)}</a>
${meta(s.ev)}
${whyBlock(s.ev)}
<div class="tx" style="font-family:${FONT};font-size:16px;line-height:1.5;color:${C.ink};padding:12px 0 18px;">${x(s.blurb)}</div>
<table ${T}><tr><td>${button(href, ctaLabel)}</td>${tix}</tr></table>
</td></tr></table></td></tr>`
}

function sponsoredBlock(r: RenderInput) {
  if (!r.sponsored.length) return ''
  return `${sectionHead('Hot and promoted')}
<tr><td class="px" style="padding:0 24px 12px;"><span style="display:inline-block;font-family:${FONT};font-size:11px;letter-spacing:1.4px;font-weight:800;color:${C.ink};background:#f0e4d4;border-radius:999px;padding:4px 10px;">SPONSORED</span>
<span class="mu" style="font-family:${FONT};font-size:13px;color:${C.muted};padding-left:8px;">Paid placement from the organiser</span></td></tr>
${r.sponsored.map((s) => compactCard(r, s, 'sponsored', CTA_VARIANTS[r.cta].card, C.spons)).join('')}`
}

function section(r: RenderInput, slots: Slot[], placement: Placement, title: string, sub?: string) {
  if (!slots.length) return ''
  return `${sectionHead(title, sub)}${slots.map((s) => compactCard(r, s, placement, CTA_VARIANTS[r.cta].card)).join('')}`
}

export function renderHtml(r: RenderInput): string {
  const ed = EDITION_NAME[r.editionKey] ?? 'THE WEEKENDER'
  const last = new Date(r.to.getTime() - 86400e3)
  const range = `${day(r.from, { weekday: 'short', day: 'numeric', month: 'short' })} – ${day(last, { weekday: 'short', day: 'numeric', month: 'short' })}`
  const prefs = trackUrl(r.ctx, 'footer', 'prefs')
  const unsub = unsubscribeUrl(r.userId, r.ctx.sendId)
  const cta = CTA_VARIANTS[r.cta]
  const link = (href: string, label: string) => `<a class="flink" href="${x(href)}" style="color:#e4e4e4;text-decoration:underline;">${label}</a>`
  const because = r.becauseTitle ?? 'Because you liked it'
  const home = siteUrl()

  return `<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="color-scheme" content="light dark"/><meta name="supported-color-schemes" content="light dark"/><title>${x(r.subject)}</title>
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;}
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (max-width:620px){
  .w100{width:100%!important;max-width:600px!important}
  .px{padding-left:16px!important;padding-right:16px!important}
  .h1{font-size:28px!important;line-height:1.15!important}
  .heroBox,.heroimg,.heroPh{width:100%!important;height:auto!important;max-width:100%!important}
  .heroPh{height:200px!important}
  .flink{display:block!important;padding:3px 0!important}
  .fdot{display:none!important}
}
@media (prefers-color-scheme: dark){
  .bg{background-color:#121212!important}
  .head{background-color:#101010!important}
  .card{background-color:#1c1c1e!important;border-color:#2c2c2c!important}
  .tx{color:#f4f4f4!important}
  .mu{color:#c8c8c8!important}
  .why{background-color:#2a211c!important}
  .whyTx{color:#f6f0ea!important}
  .price{color:#ffb08a!important}
}
[data-ogsc] .tx{color:#f4f4f4!important}
[data-ogsc] .mu{color:#c8c8c8!important}
[data-ogsb] .card{background-color:#1c1c1e!important}
</style></head>
<body class="bg" style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${x(r.preview)}${'&#8204;&nbsp;'.repeat(40)}</div>
<table ${T} width="100%" class="bg" bgcolor="${C.page}" style="background:${C.page};"><tr><td align="center" style="padding:16px 8px;">
<table ${T} width="600" class="w100 bg" bgcolor="${C.page}" style="width:600px;max-width:600px;background:${C.page};">

<tr><td class="px head" bgcolor="${C.head}" style="background:${C.head};border-radius:20px 20px 0 0;padding:26px 24px 28px;">
<table ${T} width="100%"><tr>
<td valign="middle"><a href="${x(home)}" style="text-decoration:none;">${wordmark()}</a></td>
<td align="right" valign="middle" style="font-family:${FONT};font-size:11px;line-height:1.3;letter-spacing:1.6px;font-weight:800;color:${C.accent};">${x(ed)}</td>
</tr></table>
<table ${T} style="margin-top:18px;"><tr>
<td width="28" height="4" bgcolor="${C.orange}" style="width:28px;height:4px;background:${C.orange};font-size:0;line-height:4px;">&nbsp;</td>
<td width="28" height="4" bgcolor="${C.accent}" style="width:28px;height:4px;background:${C.accent};font-size:0;line-height:4px;">&nbsp;</td>
<td>&nbsp;</td>
</tr></table>
<div style="font-family:${FONT};font-size:12px;line-height:1.4;letter-spacing:1.4px;font-weight:700;color:${C.onDarkMuted};padding-top:18px;text-transform:uppercase;">${x(r.city)} &nbsp;&middot;&nbsp; ${x(range)}</div>
<div class="h1" style="font-family:${FONT};font-size:32px;line-height:1.15;font-weight:800;color:${C.onDark};padding-top:8px;">${x(r.greeting)}</div>
<div style="font-family:${FONT};font-size:16px;line-height:1.55;color:#e6e6e6;padding-top:10px;">${x(r.intro)}</div>
</td></tr>

${r.hero ? `<tr><td class="px" style="padding:26px 24px 12px;"><div style="font-family:${FONT};font-size:12px;line-height:1.3;letter-spacing:1.6px;font-weight:800;color:${C.accent};">YOUR TOP PICK</div></td></tr>${bigCard(r, r.hero, 'hero', cta.hero)}` : ''}
${section(r, r.weekend, 'weekend', r.nearTitle)}
${section(r, r.because, 'because', because)}
${r.sponsoredPos === 'mid' ? sponsoredBlock(r) : ''}
${section(r, r.saved, 'saved', 'Saved events coming up', 'Still on your list')}
${section(r, r.free, 'free', 'Free or cheap')}
${section(r, r.popular, 'popular', `Popular in ${r.city}`, 'A starting point while we learn your taste')}
${r.sponsoredPos === 'end' ? sponsoredBlock(r) : ''}

<tr><td class="px" style="padding:20px 24px 8px;"><table ${T} width="100%" bgcolor="${C.head}" style="background:${C.head};border-radius:18px;"><tr><td align="center" style="padding:28px 22px;">
<div style="font-family:${FONT};font-size:22px;line-height:1.25;font-weight:800;color:#ffffff;">Still got room in your calendar?</div>
<div style="font-family:${FONT};font-size:15px;line-height:1.5;color:#d0d0d0;padding:8px 0 18px;">There’s plenty more happening. Go on, make some plans.</div>
${button(trackUrl(r.ctx, 'explore', 'explore'), `Explore what’s on in ${r.city}`)}
</td></tr></table></td></tr>

<tr><td class="px head" bgcolor="${C.head}" style="background:${C.head};border-radius:0 0 20px 20px;padding:28px 24px 32px;">
<table ${T} width="100%"><tr>
<td width="${MASCOT_W}" valign="middle" style="width:${MASCOT_W}px;">${mascot()}</td>
<td valign="middle" style="padding-left:14px;">
<div style="font-family:${FONT};font-size:16px;line-height:1.3;font-weight:800;color:#ffffff;">See you out there.</div>
<div style="font-family:${FONT};font-size:13px;line-height:1.45;color:${C.onDarkMuted};padding-top:4px;">Two eyes on your city. Only the nights you asked for.</div>
</td></tr></table>
<div style="font-family:${FONT};font-size:13px;line-height:1.7;color:#e4e4e4;padding-top:18px;">${link(prefs, 'Manage preferences')}<span class="fdot"> &middot; </span>${link(prefs, 'Change frequency')}<span class="fdot"> &middot; </span>${link(unsub, 'Unsubscribe')}<span class="fdot"> &middot; </span>${link(`${home}/privacy`, 'Privacy policy')}<span class="fdot"> &middot; </span>${link(`${home}/disclaimer`, 'Disclaimer')}</div>
<div style="font-family:${FONT};font-size:12px;line-height:1.6;color:#b5b5b5;padding-top:12px;">You’re receiving ${x(ed.toLowerCase().replace(/^the /, 'The '))} (${x(r.editionKey)}) because you opted in to VibePeep emails as <span style="color:#e4e4e4;">${x(r.email)}</span>. Sent by VibePeep, an independent events guide. Sponsored placements are paid for by event organisers and are always labelled. Listings come from organisers and ticketing sites and can change: prices are as last listed and may exclude booking fees, so always confirm with the organiser or ticket seller before you go.</div>
<div style="font-family:${FONT};font-size:12px;line-height:1.6;color:#b5b5b5;padding-top:14px;border-top:1px solid #2a2a2a;margin-top:16px;"><strong style="color:#e4e4e4;">Acknowledgement of Country.</strong> ${x(ACKNOWLEDGEMENT_OF_COUNTRY)}</div>
</td></tr>
</table></td></tr></table>
${r.trackOpens ? `<img src="${x(openPixelUrl(r.ctx.sendId))}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;"/>` : ''}
</body></html>`
}

export function renderText(r: RenderInput): string {
  const ed = EDITION_NAME[r.editionKey] ?? 'THE WEEKENDER'
  const block = (s: Slot, p: Placement) => {
    const trust = trustLine(s.ev.source, s.ev.lastVerifiedAt ?? s.ev.updatedAt)
    const reminder = p === 'saved' ? (r.reminderOptIn ? 'Reminder: you asked for a nudge, and this one is coming up.' : 'Reminder: still on your list.') : ''
    const why = s.ev.whyLine ? `Why you're seeing this: ${s.ev.whyLine}` : ''
    return [s.ev.title, why, s.ev.travel, reminder, `${s.ev.category} | ${whenLine(s.ev)}`, whereLine(s.ev), priceLine(s.ev), trust, statusNote(s.ev), s.blurb, trackUrl(r.ctx, p, 'detail', s.ev.id)].filter(Boolean).join('\n')
  }
  const chunk = (title: string, slots: Slot[], p: Placement) => slots.length ? `${title}\n\n${slots.map((s) => block(s, p)).join('\n\n')}` : ''
  const parts = [
    `VibePeep. Take a peep at what's happening.\nEvents · Experiences · Local discoveries.\n${ed} - ${r.city}`,
    r.greeting,
    r.intro,
    r.hero && `YOUR TOP PICK\n\n${block(r.hero, 'hero')}`,
    chunk(r.nearTitle.toUpperCase(), r.weekend, 'weekend'),
    chunk((r.becauseTitle ?? 'BECAUSE YOU LIKED IT').toUpperCase(), r.because, 'because'),
    r.sponsoredPos === 'mid' && r.sponsored.length && `HOT AND PROMOTED - SPONSORED (paid placement)\n\n${r.sponsored.map((s) => block(s, 'sponsored')).join('\n\n')}`,
    chunk('SAVED EVENTS COMING UP', r.saved, 'saved'),
    chunk('FREE OR CHEAP', r.free, 'free'),
    chunk(`POPULAR IN ${r.city.toUpperCase()}`, r.popular, 'popular'),
    r.sponsoredPos === 'end' && r.sponsored.length && `HOT AND PROMOTED - SPONSORED (paid placement)\n\n${r.sponsored.map((s) => block(s, 'sponsored')).join('\n\n')}`,
    `Still got room in your calendar? There's plenty more happening.\nExplore what's on in ${r.city}: ${trackUrl(r.ctx, 'explore', 'explore')}`,
    `---\nVibePeep. Take a peep at what's happening.\nSee you out there.\nManage preferences / change frequency: ${trackUrl(r.ctx, 'footer', 'prefs')}\nUnsubscribe: ${unsubscribeUrl(r.userId, r.ctx.sendId)}\nPrivacy policy: ${siteUrl()}/privacy\nYou're receiving this because you opted in to VibePeep emails as ${r.email}. Sponsored placements are paid and always labelled. Details can change - confirm with the organiser before you go.\n\nAcknowledgement of Country. ${ACKNOWLEDGEMENT_OF_COUNTRY}`,
  ]
  return parts.filter(Boolean).join('\n\n')
}
