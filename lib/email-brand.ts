import { BRAND_DEEP, BRAND_ICON_192, BRAND_MASCOT_EMAIL, BRAND_MASCOT_EMAIL_HEIGHT, BRAND_MASCOT_EMAIL_WIDTH, BRAND_SUBLINE, BRAND_TAGLINE, BRAND_WORDMARK_DARK_SRC, BRAND_WORDMARK_HEIGHT, BRAND_WORDMARK_SRC, BRAND_WORDMARK_WIDTH } from '@/lib/brand'
import { siteUrl } from '@/lib/site-url'

const WORD_H = 28
const WORD_W = Math.round((WORD_H * BRAND_WORDMARK_WIDTH) / BRAND_WORDMARK_HEIGHT)
const MASCOT_W = 72
const MASCOT_H = Math.round((MASCOT_W * BRAND_MASCOT_EMAIL_HEIGHT) / BRAND_MASCOT_EMAIL_WIDTH)

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
}

/** Icon, wordmark and mascot for Resend HTML. Dark mail uses white Vibe, with no plate behind the wordmark. */
export function emailLockup(opts: { dark?: boolean; origin?: string; quip?: string } = {}): string {
  const origin = opts.origin ?? siteUrl()
  const muted = opts.dark ? '#b5b5b5' : '#6b6b6b'
  const wordSrc = opts.dark ? BRAND_WORDMARK_DARK_SRC : BRAND_WORDMARK_SRC
  const word = `<img src="${origin}${wordSrc}" width="${WORD_W}" height="${WORD_H}" alt="VibePeep" style="display:block;width:${WORD_W}px;height:${WORD_H}px;border:0;outline:none;text-decoration:none;"/>`
  const quip = opts.quip
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.35;color:${opts.dark ? '#ffb4a6' : BRAND_DEEP};padding-top:3px">${esc(opts.quip)}</div>`
    : ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:8px;vertical-align:middle;line-height:0;"><img src="${origin}${BRAND_MASCOT_EMAIL}" width="${MASCOT_W}" height="${MASCOT_H}" alt="" style="display:block;width:${MASCOT_W}px;height:${MASCOT_H}px;border:0;"/></td>
<td style="padding-right:10px;vertical-align:middle;line-height:0;"><img src="${origin}${BRAND_ICON_192}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;"/></td>
<td style="vertical-align:middle">
${word}
<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.3;color:${muted};padding-top:4px">${BRAND_TAGLINE}</div>
${quip}
</td></tr></table>`
}

export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="background:${BRAND_DEEP};color:#ffffff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">${label}</a>`
}

export const EMAIL_SUBLINE = BRAND_SUBLINE
