import { BRAND_DEEP, BRAND_MASCOT_EMAIL, BRAND_MASCOT_EMAIL_HEIGHT, BRAND_MASCOT_EMAIL_WIDTH, BRAND_ORANGE, BRAND_PINK, BRAND_TAGLINE, BRAND_WORDMARK_DARK_SRC, BRAND_WORDMARK_HEIGHT, BRAND_WORDMARK_SRC, BRAND_WORDMARK_WIDTH } from '@/lib/brand'
import { CLAIMED_TICK_COPY } from '@/lib/ownership'
import { CANONICAL_SITE_URL } from '@/lib/site-url'

/**
 * Email chrome. Images are PNG files on the production host.
 * Gmail drops SVG and WebP, so the header is the mascot PNG plus one wordmark PNG.
 * Display sizes are about a third of the file size, so the same files stay sharp on retina screens.
 * The app icon is not repeated here. It was showing up as a second, tiny wordmark.
 */

export const EMAIL_FONT = "'Plus Jakarta Sans','DM Sans','Helvetica Neue',Helvetica,Arial,sans-serif"

export const EMAIL_C = {
  page: '#f6f4ee',
  ink: '#161a16',
  muted: '#5c615c',
  line: '#e7e2d6',
  card: '#ffffff',
  head: '#141414',
  accent: BRAND_PINK,
  orange: BRAND_ORANGE,
  deep: BRAND_DEEP,
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

const MASCOT_W = 88
const MASCOT_H = Math.round((MASCOT_W * BRAND_MASCOT_EMAIL_HEIGHT) / BRAND_MASCOT_EMAIL_WIDTH)
const WORD_H = 40
const WORD_W = Math.round((WORD_H * BRAND_WORDMARK_WIDTH) / BRAND_WORDMARK_HEIGHT)
const TICK_W = 16
const TICK_H = 16

export const EMAIL_MASCOT_DISPLAY = { width: MASCOT_W, height: MASCOT_H }
export const EMAIL_WORDMARK_DISPLAY = { width: WORD_W, height: WORD_H }

const T = 'role="presentation" cellpadding="0" cellspacing="0" border="0"'

export function emailEscape(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}

/** Absolute https URL for a file in /public. Always the production host, so a preview deploy still loads the artwork. */
export function emailAssetUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  return `${CANONICAL_SITE_URL}${clean}`
}

function img(src: string, alt: string, w: number, h: number): string {
  const url = emailEscape(src)
  const label = emailEscape(alt)
  return `<img src="${url}" alt="${label}" width="${w}" height="${h}" style="display:block;width:${w}px;height:${h}px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"/>`
}

/** Mascot plus the wordmark and tagline. One of each. No icon, no second wordmark, no text logo. */
export function emailLockup(opts: { dark?: boolean } = {}): string {
  const wordSrc = emailAssetUrl(opts.dark ? BRAND_WORDMARK_DARK_SRC : BRAND_WORDMARK_SRC)
  const mascotSrc = emailAssetUrl(BRAND_MASCOT_EMAIL)
  const tagline = opts.dark ? EMAIL_C.onDarkMuted : '#6b6b6b'
  return `<table ${T}><tr>
<td style="padding-right:14px;vertical-align:middle;line-height:0;font-size:0;">${img(mascotSrc, 'VibePeep mascot', MASCOT_W, MASCOT_H)}</td>
<td style="vertical-align:middle;">
${img(wordSrc, 'VibePeep', WORD_W, WORD_H)}
<div style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.35;color:${tagline};padding-top:6px;">${emailEscape(BRAND_TAGLINE)}</div>
</td>
</tr></table>`
}

/** The same shield used on the site. Alt text is the claim label, never the word verified. */
export function emailTick(kind: keyof typeof CLAIMED_TICK_COPY): string {
  const copy = CLAIMED_TICK_COPY[kind]
  const src = emailAssetUrl('/email-claimed-tick.png')
  return `<img src="${emailEscape(src)}" alt="${emailEscape(copy.label)}" width="${TICK_W}" height="${TICK_H}" style="display:inline-block;width:${TICK_W}px;height:${TICK_H}px;border:0;outline:none;text-decoration:none;vertical-align:middle;"/>`
}

export function emailButton(href: string, label: string): string {
  const safe = emailEscape(label)
  const url = emailEscape(href)
  const width = Math.min(280, Math.max(148, label.length * 8 + 48))
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:40px;v-text-anchor:middle;width:${width}px;" arcsize="50%" strokecolor="${EMAIL_C.deep}" fillcolor="${EMAIL_C.deep}">
<w:anchorlock/>
<center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;">${safe}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<table ${T}><tr><td bgcolor="${EMAIL_C.deep}" style="border-radius:999px;background:${EMAIL_C.deep};">
<a href="${url}" style="display:inline-block;padding:11px 18px;font-family:${EMAIL_FONT};font-size:14px;line-height:18px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${safe}</a>
</td></tr></table>
<!--<![endif]-->`
}

export function emailBodyCell(html: string): string {
  return `<tr><td class="px tx" style="padding:22px 24px 8px;font-family:${EMAIL_FONT};font-size:16px;line-height:1.55;color:${EMAIL_C.ink};">${html}</td></tr>`
}

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,600;0,700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap'

/**
 * Table shell shared by user-facing mail: dark header band, 600px column, footer links.
 * `rows` are the <tr> elements that sit between the header and the footer.
 */
export function emailDocument(opts: {
  title: string
  preheader?: string
  rows: string
  manageHref: string
  unsubscribeHref?: string
  homeHref?: string
  disclaimer?: string
  reason?: string
}): string {
  const home = opts.homeHref ?? CANONICAL_SITE_URL
  const link = (href: string, label: string) => `<a class="flink" href="${emailEscape(href)}" style="color:#e4e4e4;text-decoration:underline;">${emailEscape(label)}</a>`
  const links = [
    link(opts.manageHref, 'Manage preferences'),
    opts.unsubscribeHref ? link(opts.unsubscribeHref, 'Unsubscribe') : '',
    link(home, 'VibePeep'),
  ].filter(Boolean).join('<span class="fdot"> &middot; </span>')
  const pre = opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${emailEscape(opts.preheader)}${'&#8204;&nbsp;'.repeat(24)}</div>` : ''
  const disclaimer = opts.disclaimer
    ? `<div style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.55;color:#b5b5b5;padding-top:4px;">${emailEscape(opts.disclaimer)}</div>`
    : ''
  const reason = opts.reason
    ? `<div style="font-family:${EMAIL_FONT};font-size:12px;line-height:1.55;color:#9a9a9a;padding-top:10px;">${emailEscape(opts.reason)}</div>`
    : ''

  return `<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="color-scheme" content="light dark"/><meta name="supported-color-schemes" content="light dark"/><title>${emailEscape(opts.title)}</title>
<link href="${FONT_LINK}" rel="stylesheet" type="text/css"/>
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;}
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (max-width:620px){
  .w100{width:100%!important;max-width:600px!important}
  .px{padding-left:16px!important;padding-right:16px!important}
  .stack,.stack tr,.stack td{display:block!important;width:100%!important;box-sizing:border-box!important}
  .thumb{width:100%!important;padding:12px 12px 0 12px!important}
  .thumbimg,.thumbBox{width:100%!important;max-width:100%!important;height:180px!important}
  .flink{display:block!important;padding:3px 0!important}
  .fdot{display:none!important}
}
@media (prefers-color-scheme: dark){
  .bg{background-color:${EMAIL_C.darkPage}!important}
  .card{background-color:${EMAIL_C.darkCard}!important;border-color:${EMAIL_C.darkLine}!important}
  .tx{color:${EMAIL_C.darkInk}!important}
  .mu{color:${EMAIL_C.darkMuted}!important}
  .chipPaid{background-color:${EMAIL_C.darkPriceBg}!important}
  .chipPaid span{color:${EMAIL_C.darkPriceInk}!important}
  .chipFree{background-color:${EMAIL_C.darkFreeBg}!important}
  .chipFree span{color:${EMAIL_C.darkFreeInk}!important}
  .head{background-color:#101010!important}
}
[data-ogsc] .tx{color:${EMAIL_C.darkInk}!important}
[data-ogsc] .mu{color:${EMAIL_C.darkMuted}!important}
[data-ogsb] .bg{background-color:${EMAIL_C.darkPage}!important}
[data-ogsb] .card{background-color:${EMAIL_C.darkCard}!important}
</style></head>
<body class="bg" style="margin:0;padding:0;background:${EMAIL_C.page};">
${pre}
<table ${T} width="100%" class="bg" bgcolor="${EMAIL_C.page}" style="background:${EMAIL_C.page};"><tr><td align="center" style="padding:16px 8px;">
<table ${T} width="600" class="w100" style="width:600px;max-width:600px;">
<tr><td class="px head" bgcolor="${EMAIL_C.head}" style="background:${EMAIL_C.head};border-radius:20px 20px 0 0;padding:22px 24px 24px;">
<a href="${emailEscape(home)}" style="text-decoration:none;">${emailLockup({ dark: true })}</a>
<table ${T} style="margin-top:16px;"><tr>
<td width="28" height="4" bgcolor="${EMAIL_C.orange}" style="width:28px;height:4px;background:${EMAIL_C.orange};font-size:0;line-height:4px;">&nbsp;</td>
<td width="28" height="4" bgcolor="${EMAIL_C.accent}" style="width:28px;height:4px;background:${EMAIL_C.accent};font-size:0;line-height:4px;">&nbsp;</td>
<td>&nbsp;</td>
</tr></table>
</td></tr>
${opts.rows}
<tr><td class="px head" bgcolor="${EMAIL_C.head}" style="background:${EMAIL_C.head};border-radius:0 0 20px 20px;padding:22px 24px 26px;">
${disclaimer}
<div style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.7;color:#e4e4e4;padding-top:14px;">${links}</div>
${reason}
</td></tr>
</table></td></tr></table>
</body></html>`
}
