import { BRAND_DEEP, BRAND_ICON_192, BRAND_SUBLINE, BRAND_TAGLINE, BRAND_WORDMARK_HEIGHT, BRAND_WORDMARK_SRC, BRAND_WORDMARK_WIDTH } from '@/lib/brand'
import { siteUrl } from '@/lib/site-url'

const WORD_H = 28
const WORD_W = Math.round((WORD_H * BRAND_WORDMARK_WIDTH) / BRAND_WORDMARK_HEIGHT)

/** Icon plus the supplied wordmark for Resend HTML. On a dark email the black "Vibe" sits on cream. */
export function emailLockup(opts: { dark?: boolean; origin?: string } = {}): string {
  const origin = opts.origin ?? siteUrl()
  const muted = opts.dark ? '#b5b5b5' : '#6b6b6b'
  const word = `<img src="${origin}${BRAND_WORDMARK_SRC}" width="${WORD_W}" height="${WORD_H}" alt="VibePeep" style="display:block;width:${WORD_W}px;height:${WORD_H}px;border:0;outline:none;text-decoration:none;"/>`
  const wordCell = opts.dark
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#FBF8F3" style="background-color:#FBF8F3;border-radius:6px;padding:4px 8px;line-height:0;">${word}</td></tr></table>`
    : word
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:10px;vertical-align:middle;line-height:0;"><img src="${origin}${BRAND_ICON_192}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;"/></td>
<td style="vertical-align:middle">
${wordCell}
<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.3;color:${muted};padding-top:4px">${BRAND_TAGLINE}</div>
</td></tr></table>`
}

export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="background:${BRAND_DEEP};color:#ffffff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">${label}</a>`
}

export const EMAIL_SUBLINE = BRAND_SUBLINE
