import { BRAND_DEEP, BRAND_MID, BRAND_SUBLINE, BRAND_TAGLINE } from '@/lib/brand'
import { siteUrl } from '@/lib/site-url'

/** Icon plus wordmark for Resend HTML. The icon is the SVG mark, rasterised so mail clients can show it. */
export function emailLockup(opts: { dark?: boolean; origin?: string } = {}): string {
  const origin = opts.origin ?? siteUrl()
  const vibe = opts.dark ? '#ffffff' : '#141414'
  const muted = opts.dark ? '#b5b5b5' : '#6b6b6b'
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:10px;vertical-align:middle"><img src="${origin}/icon-192.png" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border:0;border-radius:8px"/></td>
<td style="vertical-align:middle">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1;font-weight:800;letter-spacing:-0.4px"><span style="color:${vibe}">Vibe</span><span style="color:${BRAND_MID}">Peep</span></div>
<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.3;color:${muted};padding-top:3px">${BRAND_TAGLINE}</div>
</td></tr></table>`
}

export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="background:${BRAND_DEEP};color:#ffffff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">${label}</a>`
}

export const EMAIL_SUBLINE = BRAND_SUBLINE
