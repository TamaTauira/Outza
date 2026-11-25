import { BRAND_ICON_512, BRAND_TAGLINE, BRAND_WORDMARK_DARK_SRC, BRAND_WORDMARK_HEIGHT, BRAND_WORDMARK_SRC, BRAND_WORDMARK_WIDTH } from '@/lib/brand'
import { ACKNOWLEDGEMENT_OF_COUNTRY } from '@/lib/cities'
import { categoryColor, categoryInk } from '@/lib/categories'
import headerCopy from '@/lib/email-header-copy.json'
import { CLAIMED_TICK_COPY } from '@/lib/ownership'
import { businessAbn, legalEntity, supportEmail } from '@/lib/site'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

/**
 * Shared email chrome. Every template uses this header, button, card and footer.
 * The header is one opaque image, so light mode, Apple dark and full inversion match.
 */

export const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export const EMAIL_ORANGE = '#FF7A35'
export const EMAIL_PINK = '#F05A9D'
/** Orange pill. #1A1408 on this orange is 7.05:1. White on orange fails contrast. */
export const EMAIL_BUTTON = '#FF7A35'
const EMAIL_BUTTON_INK = '#1A1408'
/** Postal line until a street address is supplied. */
export const EMAIL_ADDRESS = 'VibePeep, Australia'

/** One disclaimer. Times stay as listed; VibePeep does not sell the ticket. */
export const EMAIL_DISCLAIMER = 'Times and prices can change. Confirm with the organiser before you go. VibePeep does not sell tickets and does not show live availability.'

export const EMAIL_SPACE = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24 } as const
export const EMAIL_RADIUS = { container: 12, card: 12, panel: 12, pill: 999 } as const
export const EMAIL_TYPE = { h1: 26, h2: 20, body: 16, small: 14, meta: 12 } as const

export const EMAIL_C = {
  page: '#f6f4ee',
  ink: '#161a16',
  muted: '#5c615c',
  line: '#e7e2d6',
  card: '#ffffff',
  head: '#141414',
  accent: EMAIL_PINK,
  orange: EMAIL_ORANGE,
  /** Small pink text. #F05A9D is 3.16:1 on white, so labels use this darker tint. */
  accentText: '#C2185B',
  darkAccentText: '#FF8CC0',
  /** Small orange text. #FF7A35 is 2.60:1 on white. */
  orangeText: '#B34700',
  darkOrangeText: '#FF9A66',
  danger: '#B42318',
  darkDanger: '#FF8A80',
  dangerBg: '#fdecea',
  darkDangerBg: '#3a1714',
  /** Paid price chip. Separate from the pill so a button change cannot recolour it. */
  deep: '#141414',
  freeBg: '#e5f6ee',
  freeInk: '#0d6b45',
  priceBg: '#fff1ea',
  onDark: '#f7f7f7',
  onDarkMuted: '#c8c8c8',
  darkPage: '#0c0f0e',
  darkCard: '#171c19',
  darkLine: '#2a302c',
  darkInk: '#f4f1e8',
  darkMuted: '#c5c8c0',
  darkFreeBg: '#143028',
  darkFreeInk: '#8ee0b8',
  darkPriceBg: '#3a241c',
  darkPriceInk: '#ffb08a',
} as const

const HEADER_HEADLINES = headerCopy as Record<string, string>

/** Same geometry as .vp-lockup. Kept for callers that still draw the site lockup. Emails use the baked header. */
const MARK = 40
const CAP = MARK * 0.56
const WORD_H = Math.round(CAP * (1974 / 1440))
const WORD_W = Math.round(WORD_H * (BRAND_WORDMARK_WIDTH / BRAND_WORDMARK_HEIGHT))
const WORD_TOP = Math.round(CAP * (42 / 1440))
const TICK_W = 16
const TICK_H = 16

export const EMAIL_MASCOT_DISPLAY = { width: MARK, height: MARK }
export const EMAIL_WORDMARK_DISPLAY = { width: WORD_W, height: WORD_H }

const T = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function emailEscape(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}

/** Plain-text safe. Mail parts must not contain HTML entities such as &middot;. */
export function emailPlain(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&middot;/gi, ' · ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
}

export function emailAssetUrl(file: string): string {
  const clean = file.startsWith('/') ? file : `/${file}`
  return `${CANONICAL_SITE_URL}${clean}`
}

export function emailHeadline(kind: string | null | undefined): string {
  const safe = (kind || 'general').replace(/[^a-z0-9-]/gi, '') || 'general'
  return HEADER_HEADLINES[safe] || HEADER_HEADLINES.general || 'VibePeep'
}

/** "WED, 25 NOV". UTC, matching the dates stored on listings. */
export function emailDateStamp(date: Date): string {
  return `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

/** `toExclusive` is the day after the last day. A one-day window does not repeat the date. */
export function emailDateRange(from: Date, toExclusive: Date): string {
  const lastMs = toExclusive.getTime() - 86400000
  const last = new Date(lastMs < from.getTime() ? from.getTime() : lastMs)
  const start = emailDateStamp(from)
  const end = emailDateStamp(last)
  return start === end ? start : `${start} – ${end}`
}

/** "SYDNEY · WED, 25 NOV – THU, 26 NOV". Sits directly under the banner. */
export function emailMetaLine(city: string, range: string): string {
  return `${city.trim().toUpperCase()} · ${range}`
}

/** "The Imperial" stays as it is. "Enmore Theatre" gains one "the". */
export function emailVenueName(venue: string | null | undefined): string {
  const name = String(venue ?? '').trim()
  if (!name) return 'the venue'
  if (/^the\s/i.test(name)) return name
  return `the ${name}`
}

/** First letter up, so a reason after a full stop does not start in lowercase. */
export function emailSentence(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim().replace(/[.]+$/, '')
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** Shorter acknowledgement for mail that does not list events (password reset, receipts). */
export const EMAIL_ACK_SHORT =
  'We acknowledge the Traditional Custodians of the lands across Australia, and pay our respects to Elders past and present. Always was, always will be Aboriginal land.'

/** Name, Australia, and a contact only when one is already configured. No invented ABN or address. */
export function emailSenderLine(): string {
  const entity = legalEntity()
  const abnRaw = (businessAbn() ?? '').replace(/\s+/g, '')
  const abn = /^\d{11}$/.test(abnRaw) ? `ABN ${abnRaw.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4')}` : ''
  const support = supportEmail()
  const contact = support && !/outza/i.test(support) ? support : ''
  const name = entity || 'VibePeep'
  const place = EMAIL_ADDRESS.replace(/^VibePeep,\s*/i, '') || 'Australia'
  const who = [name, abn, place].filter(Boolean).join(', ')
  if (contact) return `${who}. Questions: ${contact}.`
  return `${who}. Questions go through the contact page on this site.`
}

/** HTML footer line. "contact page" is a real link, and the URL is printed beside it. */
export function emailSenderHtml(home: string): string {
  const line = emailSenderLine()
  const href = `${home.replace(/\/$/, '')}/contact`
  const needle = 'contact page'
  const at = line.indexOf(needle)
  if (at === -1) return emailEscape(line)
  const link = `<a class="lk" href="${emailEscape(href)}" style="color:${EMAIL_C.orangeText};font-family:${EMAIL_FONT};font-weight:700;text-decoration:underline;">${needle}</a>`
  return `${emailEscape(line.slice(0, at))}${link}${emailEscape(line.slice(at + needle.length))} (${emailEscape(href)})`
}

/** Plain-text footer shared with the HTML footer: acknowledgement plus the contact URL. */
export function emailPlainFooter(home: string, acknowledgement = ACKNOWLEDGEMENT_OF_COUNTRY): string {
  const href = `${home.replace(/\/$/, '')}/contact`
  const who = emailSenderLine().replace('the contact page on this site.', `the contact page: ${href}`)
  return `Acknowledgement of Country. ${acknowledgement}\n${who}`
}

function img(src: string, alt: string, w: number, h: number): string {
  const url = emailEscape(src)
  const label = emailEscape(alt)
  return `<img src="${url}" alt="${label}" width="${w}" height="${h}" style="display:block;width:${w}px;height:${h}px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"/>`
}

/** Icon, wordmark and tagline. Emails do not use this. The header image carries the logo once. */
export function emailLockup(opts: { dark?: boolean } = {}): string {
  const wordSrc = emailAssetUrl(opts.dark ? BRAND_WORDMARK_DARK_SRC : BRAND_WORDMARK_SRC)
  const iconSrc = emailAssetUrl(BRAND_ICON_512.split('?')[0])
  const tagline = opts.dark ? EMAIL_C.onDarkMuted : '#6b6b6b'
  return `<table ${T}><tr>
<td width="${MARK}" style="width:${MARK}px;padding-right:9px;vertical-align:top;line-height:0;font-size:0;">${img(iconSrc, 'VibePeep', MARK, MARK)}</td>
<td style="vertical-align:top;">
<div style="height:${MARK}px;">
<img src="${emailEscape(wordSrc)}" alt="VibePeep" width="${WORD_W}" height="${WORD_H}" style="display:block;width:${WORD_W}px;height:${WORD_H}px;border:0;margin-top:-${WORD_TOP}px;"/>
<div style="font-family:${EMAIL_FONT};font-size:12px;line-height:12px;color:${tagline};margin-top:2px;">${emailEscape(BRAND_TAGLINE)}</div>
</div>
</td>
</tr></table>`
}

export function emailTick(kind: keyof typeof CLAIMED_TICK_COPY): string {
  const copy = CLAIMED_TICK_COPY[kind]
  const src = emailAssetUrl('/email-claimed-tick.png')
  return `<img src="${emailEscape(src)}" alt="${emailEscape(copy.label)}" width="${TICK_W}" height="${TICK_H}" style="display:inline-block;width:${TICK_W}px;height:${TICK_H}px;border:0;outline:none;text-decoration:none;vertical-align:middle;"/>`
}

export function emailBrandRule(): string {
  return `<table ${T} width="100%" style="width:100%;margin-top:24px;"><tr>
<td width="50%" height="2" bgcolor="${EMAIL_ORANGE}" style="width:50%;height:2px;background:${EMAIL_ORANGE};font-size:0;line-height:2px;">&nbsp;</td>
<td width="50%" height="2" bgcolor="${EMAIL_PINK}" style="width:50%;height:2px;background:${EMAIL_PINK};font-size:0;line-height:2px;">&nbsp;</td>
</tr></table>`
}

const EMAIL_BUTTON_PAD_Y = 13
const EMAIL_BUTTON_LINE = 18
const EMAIL_BUTTON_HEIGHT = EMAIL_BUTTON_PAD_Y + EMAIL_BUTTON_LINE + EMAIL_BUTTON_PAD_Y

export function emailButton(href: string, label: string, variant: 'primary' | 'secondary' = 'primary'): string {
  const safe = emailEscape(label)
  const url = emailEscape(href)
  const width = Math.min(280, Math.max(148, label.length * 8 + 48))
  if (variant === 'secondary') {
    return `<table ${T}><tr><td class="email-btn-sec" height="${EMAIL_BUTTON_HEIGHT}" style="height:${EMAIL_BUTTON_HEIGHT}px;border-radius:999px;border:2px solid ${EMAIL_BUTTON_INK};background:transparent;">
<a class="email-btn-sec" href="${url}" style="display:inline-block;padding:${EMAIL_BUTTON_PAD_Y - 2}px 22px;font-family:${EMAIL_FONT};font-size:14px;line-height:${EMAIL_BUTTON_LINE}px;font-weight:700;color:${EMAIL_BUTTON_INK};text-decoration:none;border-radius:999px;">${safe}</a>
</td></tr></table>`
  }
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:${EMAIL_BUTTON_HEIGHT}px;v-text-anchor:middle;width:${width}px;" arcsize="50%" strokecolor="${EMAIL_BUTTON}" fillcolor="${EMAIL_BUTTON}">
<w:anchorlock/>
<center style="color:${EMAIL_BUTTON_INK};font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;">${safe}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<table ${T}><tr><td class="email-btn" height="${EMAIL_BUTTON_HEIGHT}" bgcolor="${EMAIL_BUTTON}" style="height:${EMAIL_BUTTON_HEIGHT}px;border-radius:999px;background:${EMAIL_BUTTON};">
<a class="email-btn" href="${url}" style="display:inline-block;padding:${EMAIL_BUTTON_PAD_Y}px 22px;font-family:${EMAIL_FONT};font-size:14px;line-height:${EMAIL_BUTTON_LINE}px;font-weight:700;color:${EMAIL_BUTTON_INK};background:${EMAIL_BUTTON};text-decoration:none;border-radius:999px;">${safe}</a>
</td></tr></table>
<!--<![endif]-->`
}

export function emailButtonColorLock(scope = ''): string {
  const target = scope ? `${scope} .email-btn,${scope} .email-btn a` : '.email-btn,.email-btn a'
  return `${target}{background-color:${EMAIL_BUTTON}!important;color:${EMAIL_BUTTON_INK}!important}`
}

/** Every text link. Colour and the shared font are pinned so Apple dark mode does not fall back to blue or a serif. */
export function emailLink(href: string, label: string, opts?: { wrap?: boolean }): string {
  const wrap = opts?.wrap ? 'overflow-wrap:anywhere;word-break:break-all;' : ''
  const cls = opts?.wrap ? 'lk paste' : 'lk'
  return `<a class="${cls}" href="${emailEscape(href)}" style="color:${EMAIL_C.orangeText};font-family:${EMAIL_FONT};font-weight:700;text-decoration:underline;${wrap}">${emailEscape(label)}</a>`
}

/** The raw URL under a confirm, sign-in or reset button. It wraps inside the phone padding. */
export function emailPasteLink(href: string): string {
  return `<p class="mu paste" style="margin:12px 0 0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.45;color:${EMAIL_C.muted};overflow-wrap:anywhere;word-break:break-word;">Or paste this link:<br/>${emailLink(href, href, { wrap: true })}</p>`
}

/**
 * One opaque banner. Logo, headline, mascot and the 160×4 gradient are baked in.
 * With images blocked, the styled alt sits on the dark cell.
 */
export function emailHeader(opts: { kind?: string | null; homeHref: string }): string {
  const raw = (opts.kind || 'general').replace(/[^a-z0-9-]/gi, '') || 'general'
  const kind = HEADER_HEADLINES[raw] ? raw : 'general'
  const headline = HEADER_HEADLINES[kind] || 'VibePeep'
  const alt = `VibePeep: ${headline}`
  const inner = `<img src="${emailEscape(emailAssetUrl(`/email-headers/${kind}.png`))}" alt="${emailEscape(alt)}" width="600" height="120" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:${EMAIL_RADIUS.container}px ${EMAIL_RADIUS.container}px 0 0;outline:none;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;font-weight:700;color:#F7F7F7;-ms-interpolation-mode:bicubic;"/>`
  return `<a href="${emailEscape(opts.homeHref)}" style="text-decoration:none;color:#F7F7F7;font-family:${EMAIL_FONT};">${inner}</a>`
}

/** @deprecated The shell uses emailHeader. Kept so a missing call site still compiles. */
export function emailBanner(kind: string): string {
  return emailHeader({ kind, homeHref: CANONICAL_SITE_URL })
}

export function emailBodyCell(html: string): string {
  return `<tr><td class="px tx" style="padding:${EMAIL_SPACE.lg}px ${EMAIL_SPACE.lg}px 8px;font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.body}px;line-height:1.55;color:${EMAIL_C.ink};">${html}</td></tr>`
}

export function emailSectionHeading(text: string, sub?: string): string {
  return `<tr><td class="px" style="padding:20px ${EMAIL_SPACE.lg}px 10px;"><div class="tx" style="font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.h2}px;line-height:1.25;font-weight:800;color:${EMAIL_C.ink};">${emailEscape(text)}</div>${sub ? `<div class="mu" style="font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.small}px;line-height:1.4;color:${EMAIL_C.muted};padding-top:4px;">${emailEscape(sub)}</div>` : ''}</td></tr>`
}

export function emailPanel(html: string, tone: 'neutral' | 'danger' = 'neutral'): string {
  const danger = tone === 'danger'
  const bg = danger ? EMAIL_C.dangerBg : '#f6f4ee'
  const border = danger ? EMAIL_C.danger : EMAIL_C.line
  const cls = danger ? 'card panel panelDanger' : 'card panel'
  return `<div class="${cls}" style="background:${bg};border:1px solid ${border};${danger ? `border-left:4px solid ${EMAIL_C.danger};` : ''}padding:16px;border-radius:${EMAIL_RADIUS.panel}px;margin:0 0 12px;">${html}</div>`
}

export function emailCode(code: string, expiresMinutes = 30): string {
  return `<p class="tx" style="margin:0 0 8px;font-family:${EMAIL_FONT};font-size:32px;line-height:1.2;letter-spacing:0.28em;font-weight:800;color:${EMAIL_C.ink};">${emailEscape(code)}</p>
<p class="mu" style="margin:0 0 16px;font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.small}px;line-height:1.45;color:${EMAIL_C.muted};">It expires in ${expiresMinutes} minutes.</p>`
}

export function emailStatTable(headers: string[], rows: string[][]): string {
  const head = headers.map((label, index) => `<th class="mu" style="padding:8px 6px;font-family:${EMAIL_FONT};font-size:12px;line-height:1.3;font-weight:700;color:${EMAIL_C.muted};text-align:${index === 0 ? 'left' : 'right'};border-bottom:1px solid ${EMAIL_C.line};">${emailEscape(label)}</th>`).join('')
  const body = rows.map((row) => `<tr>${row.map((cell, index) => `<td class="tx" style="padding:8px 6px;font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.small}px;line-height:1.4;color:${EMAIL_C.ink};text-align:${index === 0 ? 'left' : 'right'};border-bottom:1px solid ${EMAIL_C.line};${index === 0 ? 'font-weight:700;' : ''}">${emailEscape(cell)}</td>`).join('')}</tr>`).join('')
  const table = `<table class="stats" ${T} width="100%" style="width:100%;border-collapse:collapse;margin:0 0 12px;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
  const cards = rows.map((row) => {
    const title = emailEscape(row[0] ?? '')
    const facts = headers.slice(1).map((label, index) => `<div style="padding:3px 0;font-family:${EMAIL_FONT};font-size:14px;line-height:1.4;"><span class="mu" style="color:${EMAIL_C.muted};">${emailEscape(label)}: </span><span class="tx" style="color:${EMAIL_C.ink};font-weight:700;">${emailEscape(row[index + 1] ?? '')}</span></div>`).join('')
    return `<div class="statCard card" style="border:1px solid ${EMAIL_C.line};border-radius:${EMAIL_RADIUS.card}px;padding:12px;margin:0 0 10px;"><div class="tx" style="font-family:${EMAIL_FONT};font-size:15px;line-height:1.3;font-weight:800;color:${EMAIL_C.ink};">${title}</div>${facts}</div>`
  }).join('')
  return `<div class="statsWide">${table}</div><!--[if !mso]><!--><div class="statsStack">${cards}</div><!--<![endif]-->`
}

export type EmailCardInput = {
  href: string
  title: string
  when: string
  place: string
  price?: string | null
  priceKind?: 'free' | 'paid' | null
  image?: string | null
  category?: string
  blurb?: string
  why?: string
  travel?: string
  note?: string
  /** Already-safe HTML, such as a claim tick. */
  tickHtml?: string
  cta?: string
  ticketHref?: string
  variant?: 'row' | 'hero'
}

function priceChip(text: string, kind: 'free' | 'paid'): string {
  const free = kind === 'free'
  const bg = free ? EMAIL_C.freeBg : EMAIL_C.priceBg
  const fg = free ? EMAIL_C.freeInk : EMAIL_C.deep
  const cls = free ? 'chipFree' : 'chipPaid'
  return `<table ${T} style="margin-top:8px;"><tr><td class="${cls}" bgcolor="${bg}" style="background:${bg};border-radius:999px;padding:3px 10px;"><span style="font-family:${EMAIL_FONT};font-size:12px;line-height:16px;font-weight:700;color:${fg};">${emailEscape(text)}</span></td></tr></table>`
}

function artBlock(row: EmailCardInput, w: number, h: number, kind: 'row' | 'hero'): string {
  const alt = emailEscape(`${row.title}${row.place ? ` at ${row.place}` : ''}`)
  const radius = EMAIL_RADIUS.card
  if (row.image && /^https:\/\//i.test(row.image)) {
    const src = emailEscape(row.image)
    const cls = kind === 'hero' ? 'heroimg' : 'thumbimg'
    const box = kind === 'hero' ? 'heroBox' : 'thumbBox'
    return `<a href="${emailEscape(row.href)}" style="text-decoration:none;">
<div class="${box}" style="width:${w}px;max-width:100%;height:${h}px;background-color:${EMAIL_C.line};background-image:url('${src}');background-repeat:no-repeat;background-position:center center;background-size:cover;border-radius:${radius}px;overflow:hidden;font-size:0;line-height:0;">
<img class="${cls}" src="${src}" alt="${alt}" width="${w}" height="${h}" style="display:block;width:${w}px;max-width:100%;height:${h}px;object-fit:cover;border:0;border-radius:${radius}px;-ms-interpolation-mode:bicubic;"/>
</div></a>`
  }
  const raw = categoryColor(row.category || 'Event')
  const bg = raw.toUpperCase() === '#FF5A3C' ? EMAIL_ORANGE : raw
  const fg = categoryInk(bg)
  const label = emailEscape((row.category || 'Event').trim() || 'Event')
  const size = kind === 'hero' ? 18 : 13
  return `<a href="${emailEscape(row.href)}" style="text-decoration:none;"><table ${T} class="${kind === 'hero' ? 'heroBox' : 'thumbBox'}" width="${w}" height="${h}" bgcolor="${bg}" style="width:${w}px;height:${h}px;background:${bg};border-radius:${radius}px;"><tr><td align="center" valign="middle" width="${w}" height="${h}" bgcolor="${bg}" style="width:${w}px;height:${h}px;background:${bg};border-radius:${radius}px;font-family:${EMAIL_FONT};font-size:${size}px;line-height:1.3;font-weight:800;letter-spacing:0.6px;color:${fg};text-transform:uppercase;padding:8px;">${label}</td></tr></table></a>`
}

function whyBlock(why?: string, travel?: string): string {
  if (!why && !travel) return ''
  const reason = why
    ? `<table ${T} width="100%"><tr>
<td width="3" bgcolor="${EMAIL_C.accent}" style="width:3px;background:${EMAIL_C.accent};font-size:0;line-height:0;">&nbsp;</td>
<td class="why" bgcolor="${EMAIL_C.priceBg}" style="background:${EMAIL_C.priceBg};padding:8px 10px;">
<div class="whyLabel" style="font-family:${EMAIL_FONT};font-size:12px;line-height:1.3;letter-spacing:0.6px;font-weight:800;color:${EMAIL_C.accentText};text-transform:uppercase;">Why you're seeing this</div>
<div class="whyTx tx" style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.4;color:${EMAIL_C.ink};padding-top:2px;">${emailEscape(why)}</div>
</td></tr></table>`
    : ''
  const trip = travel ? `<div class="mu" style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.4;color:${EMAIL_C.muted};padding-top:6px;">${emailEscape(travel)}</div>` : ''
  return `<div style="padding-top:10px;">${reason}${trip}</div>`
}

/** One event card. `row` keeps the thumb beside the copy. `hero` is the large top pick. */
export function emailEventCard(row: EmailCardInput): string {
  const variant = row.variant ?? 'row'
  const when = `<div class="mu" style="font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.small}px;line-height:1.45;color:${EMAIL_C.muted};padding-top:6px;">${emailEscape(row.when)}</div>`
  const place = `<div class="mu" style="font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.small}px;line-height:1.45;color:${EMAIL_C.muted};padding-top:2px;">${emailEscape(row.place)}${row.tickHtml ? `&nbsp;${row.tickHtml}` : ''}</div>`
  const chip = row.price && row.priceKind ? priceChip(row.price, row.priceKind) : ''
  const blurb = row.blurb ? `<div class="tx" style="font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.small}px;line-height:1.5;color:${EMAIL_C.ink};padding-top:8px;">${emailEscape(row.blurb)}</div>` : ''
  const note = row.note ? `<div class="mu" style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.4;color:${EMAIL_C.muted};padding-top:6px;">${emailEscape(row.note)}</div>` : ''
  const cta = row.cta ? `<div style="padding-top:12px;">${emailButton(row.href, row.cta)}</div>` : ''
  const tickets = row.ticketHref ? `<div style="padding-top:8px;">${emailLink(row.ticketHref, 'Tickets and info')}</div>` : ''
  const eyebrow = row.category ? `<div class="accent" style="font-family:${EMAIL_FONT};font-size:12px;line-height:1.3;letter-spacing:0.8px;font-weight:800;color:${EMAIL_C.accentText};text-transform:uppercase;">${emailEscape(row.category)}</div>` : ''
  if (variant === 'hero') {
    return `<tr><td class="px" style="padding:0 ${EMAIL_SPACE.lg}px 12px;">
<table ${T} width="100%" class="card" bgcolor="${EMAIL_C.card}" style="width:100%;background:${EMAIL_C.card};border:1px solid ${EMAIL_C.line};border-radius:${EMAIL_RADIUS.card}px;">
<tr><td style="padding:0;font-size:0;line-height:0;">${artBlock(row, 552, 311, 'hero')}</td></tr>
<tr><td style="padding:16px 20px 20px;">
${eyebrow}
<a href="${emailEscape(row.href)}" class="tx" style="font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.h1}px;line-height:1.2;font-weight:800;color:${EMAIL_C.ink};text-decoration:none;">${emailEscape(row.title)}</a>
${when}${place}${chip}${whyBlock(row.why, row.travel)}${note}
${blurb ? `<div class="tx" style="font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.body}px;line-height:1.5;color:${EMAIL_C.ink};padding-top:12px;">${emailEscape(row.blurb)}</div>` : ''}
${cta}${tickets}
</td></tr></table></td></tr>`
  }
  return `<tr><td class="px" style="padding:0 ${EMAIL_SPACE.lg}px 12px;">
<table ${T} width="100%" class="card" bgcolor="${EMAIL_C.card}" style="width:100%;background:${EMAIL_C.card};border:1px solid ${EMAIL_C.line};border-radius:${EMAIL_RADIUS.card}px;"><tr>
<td class="thumb" width="112" valign="top" style="width:112px;padding:12px 0 12px 12px;">${artBlock(row, 112, 112, 'row')}</td>
<td class="copy" valign="top" style="padding:14px 16px 16px 14px;">
${eyebrow}
<a href="${emailEscape(row.href)}" class="tx" style="font-family:${EMAIL_FONT};font-size:18px;line-height:1.3;font-weight:800;color:${EMAIL_C.ink};text-decoration:none;">${emailEscape(row.title)}</a>
${when}${place}${chip}${whyBlock(row.why, row.travel)}${note}${blurb}${cta}${tickets}
</td></tr></table></td></tr>`
}

function footerLink(href: string, label: string): string {
  return `<a class="flink lk" href="${emailEscape(href)}" style="color:${EMAIL_C.orangeText};text-decoration:underline;">${emailEscape(label)}</a>`
}

function shellCss(): string {
  return `body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;}
:root{color-scheme:light dark;supported-color-schemes:light dark;}
.statsStack{display:none;max-height:0;overflow:hidden;mso-hide:all;}
.paste,.paste a{overflow-wrap:anywhere!important;word-break:break-word!important;}
.sponsor{background-color:#F3E6D4!important;color:#1A1408!important;}
@media (max-width:620px){
  .w100{width:100%!important;max-width:600px!important}
  .px{padding-left:16px!important;padding-right:16px!important}
  .heroBox,.heroimg{width:100%!important;max-width:100%!important;height:auto!important}
  .flink{display:block!important;padding:3px 0!important}
  .fdot{display:none!important}
  .thumb,.copy{display:block!important;width:auto!important;max-width:100%!important;box-sizing:border-box!important;}
  .thumb{padding:12px 12px 0 12px!important;}
  .thumb .thumbBox,.thumb table{width:100%!important;max-width:100%!important;height:140px!important;}
  .why{display:block!important;width:auto!important;max-width:100%!important;box-sizing:border-box!important;}
  .statsWide{display:none!important;}
  .statsStack{display:block!important;max-height:none!important;overflow:visible!important;}
}
@media (prefers-color-scheme: dark){
  .bg{background-color:${EMAIL_C.darkPage}!important}
  .card{background-color:${EMAIL_C.darkCard}!important;border-color:${EMAIL_C.darkLine}!important}
  .tx{color:${EMAIL_C.darkInk}!important}
  .mu{color:${EMAIL_C.darkMuted}!important}
  .lk{color:${EMAIL_C.darkOrangeText}!important}
  .accent{color:${EMAIL_C.darkAccentText}!important}
  .whyLabel{color:${EMAIL_C.darkAccentText}!important}
  .danger{color:${EMAIL_C.darkDanger}!important}
  .panel{background-color:${EMAIL_C.darkCard}!important;border-color:${EMAIL_C.darkLine}!important}
  .panelDanger{background-color:${EMAIL_C.darkDangerBg}!important;border-color:${EMAIL_C.darkDanger}!important}
  .why{background-color:#2a211c!important}
  .whyTx{color:${EMAIL_C.darkInk}!important}
  .chipPaid{background-color:${EMAIL_C.darkPriceBg}!important}
  .chipPaid span{color:${EMAIL_C.darkPriceInk}!important}
  .chipFree{background-color:${EMAIL_C.darkFreeBg}!important}
  .chipFree span{color:${EMAIL_C.darkFreeInk}!important}
  .sponsor{background-color:#3A2418!important;color:#F6E6D4!important}
  .email-btn-sec{border-color:${EMAIL_C.onDark}!important}
  .email-btn-sec a{color:${EMAIL_C.onDark}!important}
  ${emailButtonColorLock()}
}
[data-ogsc] .tx,[data-ogsb] .tx{color:${EMAIL_C.darkInk}!important}
[data-ogsc] .mu,[data-ogsb] .mu{color:${EMAIL_C.darkMuted}!important}
[data-ogsc] .lk,[data-ogsb] .lk{color:${EMAIL_C.darkOrangeText}!important}
[data-ogsc] .accent,[data-ogsb] .accent,[data-ogsc] .whyLabel,[data-ogsb] .whyLabel{color:${EMAIL_C.darkAccentText}!important}
[data-ogsc] .danger,[data-ogsb] .danger{color:${EMAIL_C.darkDanger}!important}
[data-ogsc] .why,[data-ogsb] .why{background-color:#2a211c!important}
[data-ogsc] .panel,[data-ogsb] .panel{background-color:${EMAIL_C.darkCard}!important}
[data-ogsc] .panelDanger,[data-ogsb] .panelDanger{background-color:${EMAIL_C.darkDangerBg}!important}
[data-ogsc] .sponsor,[data-ogsb] .sponsor{background-color:#3A2418!important;color:#F6E6D4!important}
${emailButtonColorLock('[data-ogsc]')}
${emailButtonColorLock('[data-ogsb]')}
[data-ogsb] .bg{background-color:${EMAIL_C.darkPage}!important}
[data-ogsb] .card{background-color:${EMAIL_C.darkCard}!important}`
}

export function emailDocument(opts: {
  title: string
  preheader?: string
  rows: string
  manageHref?: string
  /** Visible footer link. The one-click header is a separate API URL. */
  unsubscribeHref?: string
  homeHref?: string
  disclaimer?: string
  reason?: string
  /** File stem under public/email-headers/. Null leaves the banner out. */
  banner?: string | null
  /** City and date line, directly under the banner. */
  meta?: string
  manageLabel?: string
  /** Markup after the document, such as an open pixel. */
  after?: string
  /** Replaces the event acknowledgement in mail that lists no events. */
  acknowledgement?: string
}): string {
  const home = opts.homeHref ?? CANONICAL_SITE_URL
  const privacy = `${home.replace(/\/$/, '')}/privacy`
  const links = [
    footerLink(home, 'Home'),
    footerLink(privacy, 'Privacy'),
    opts.manageHref ? footerLink(opts.manageHref, opts.manageLabel || 'Manage preferences') : '',
    opts.unsubscribeHref ? footerLink(opts.unsubscribeHref, 'Unsubscribe') : '',
  ].filter(Boolean).join('<span class="fdot"> · </span>')
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${emailEscape(opts.preheader)}${'&#8204;&nbsp;'.repeat(24)}</div>`
    : ''
  const disclaimer = opts.disclaimer
    ? `<div class="mu" style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.55;color:${EMAIL_C.muted};padding-top:4px;">${emailEscape(opts.disclaimer)}</div>`
    : ''
  const reason = opts.reason
    ? `<div class="mu" style="font-family:${EMAIL_FONT};font-size:12px;line-height:1.55;color:${EMAIL_C.muted};padding-top:10px;">${emailEscape(opts.reason)}</div>`
    : ''
  const meta = opts.meta
    ? `<tr><td class="px meta mu" style="padding:${EMAIL_SPACE.lg}px ${EMAIL_SPACE.lg}px 0;font-family:${EMAIL_FONT};font-size:${EMAIL_TYPE.small}px;line-height:1.4;letter-spacing:0.6px;font-weight:700;color:${EMAIL_C.muted};text-transform:uppercase;">${emailEscape(opts.meta)}</td></tr>`
    : ''
  const header = opts.banner === null
    ? ''
    : `<tr><td class="hdr" bgcolor="${EMAIL_C.head}" style="background:${EMAIL_C.head};border-radius:${EMAIL_RADIUS.container}px ${EMAIL_RADIUS.container}px 0 0;padding:0;line-height:0;font-size:0;">${emailHeader({ kind: opts.banner ?? 'general', homeHref: home })}</td></tr>`

  return `<!DOCTYPE html><html lang="en-AU" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="color-scheme" content="light dark"/><meta name="supported-color-schemes" content="light dark"/><title>${emailEscape(opts.title)}</title>
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
${shellCss()}
</style></head>
<body class="bg" style="margin:0;padding:0;background:${EMAIL_C.page};">
${pre}
<table ${T} width="100%" class="bg" bgcolor="${EMAIL_C.page}" style="background:${EMAIL_C.page};"><tr><td align="center" style="padding:16px 8px;">
<table ${T} width="600" class="w100 bg" bgcolor="${EMAIL_C.page}" style="width:600px;max-width:600px;background:${EMAIL_C.page};border-radius:${EMAIL_RADIUS.container}px;">
${header}
${meta}
${opts.rows}
<tr><td class="px foot bg" bgcolor="${EMAIL_C.page}" style="background:${EMAIL_C.page};border-radius:0 0 ${EMAIL_RADIUS.container}px ${EMAIL_RADIUS.container}px;padding:8px ${EMAIL_SPACE.lg}px 22px;">
${disclaimer}
<div style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.7;padding-top:14px;">${links}</div>
${reason}
<div class="mu" style="font-family:${EMAIL_FONT};font-size:12px;line-height:1.55;color:${EMAIL_C.muted};padding-top:12px;"><strong class="tx" style="color:${EMAIL_C.ink};">Acknowledgement of Country.</strong> ${emailEscape(opts.acknowledgement || ACKNOWLEDGEMENT_OF_COUNTRY)}</div>
<div class="mu" style="font-family:${EMAIL_FONT};font-size:12px;line-height:1.55;color:${EMAIL_C.muted};padding-top:10px;">${emailSenderHtml(home)}</div>
</td></tr>
</table></td></tr></table>
${opts.after ?? ''}
</body></html>`
}
