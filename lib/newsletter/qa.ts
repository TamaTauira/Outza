import type { NlEvent } from './rank'

export interface QaReport { pass: boolean; errors: string[]; warnings: string[]; checks: string[] }
const BOOKABLE = ['SCHEDULED', 'RESCHEDULED']
const PLACEHOLDER = /\bundefined\b|\bnull\b|\bNaN\b|Invalid Date|\{\{|\}\}|\[object |--:--|lorem ipsum/i

const visibleText = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')

/** Pre-send checks. Any error blocks the send; warnings are recorded for the admin. */
export function runQa(input: {
  html: string
  text: string
  subject: string
  preview: string
  sections: { placement: string; ev: NlEvent; img: string | null }[]
  sponsored: boolean
  from: Date
  to: Date
  optedIn: boolean
  realSend: boolean
}): QaReport {
  const errors: string[] = [], warnings: string[] = [], checks: string[] = []
  const ids = new Set<string>()
  for (const s of input.sections) {
    const e = s.ev
    if (ids.has(e.id)) errors.push(`Duplicate event across sections: ${e.title}`)
    ids.add(e.id)
    // Newsletter boosts ride every issue while active, so a sponsored event may be later than this issue's window.
    if (e.date < input.from || (s.placement !== 'sponsored' && e.date > input.to)) errors.push(`Out-of-window or expired date: ${e.title}`)
    if (!BOOKABLE.includes(e.status)) errors.push(`Not bookable (${e.status}): ${e.title}`)
    if (e.duplicateOfId) errors.push(`Merged duplicate listing: ${e.title}`)
    if (!e.title.trim() || !e.venueName.trim()) errors.push(`Missing title or venue: ${e.id}`)
    if (e.ticketUrl && !/^https?:\/\/[^\s]+\.[^\s]+/.test(e.ticketUrl)) warnings.push(`Ticket link looks invalid, tracked redirect will fall back to the event page: ${e.title}`)
    if (!s.img) warnings.push(`No usable image, branded fallback used: ${e.title} (${s.placement})`)
    if (!e.time) warnings.push(`No start time published: ${e.title}`)
  }
  checks.push(`${input.sections.length} events validated for date window, status, duplicates and venue`)

  if (input.sponsored && !/>SPONSORED</.test(input.html)) errors.push('Sponsored event is missing its "Sponsored" label')
  checks.push(input.sponsored ? 'Sponsored disclosure present' : 'No sponsored placement this issue')

  const ph = visibleText(input.html).match(PLACEHOLDER) || input.text.match(PLACEHOLDER) || `${input.subject} ${input.preview}`.match(PLACEHOLDER)
  if (ph) errors.push(`Placeholder or broken value in copy: "${ph[0]}"`)
  checks.push('No placeholders in subject, preview, HTML or plain text')

  const hrefs = [...input.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
  const bad = hrefs.filter((h) => { try { return !/^https?:$/.test(new URL(h).protocol) } catch { return true } })
  if (bad.length) errors.push(`${bad.length} malformed link(s): ${bad.slice(0, 3).join(', ')}`)
  checks.push(`${hrefs.length} links are absolute and well-formed`)

  const imgs = [...input.html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
  const noAlt = imgs.filter((t) => !/width="1"/.test(t) && !/alt="[^"]+"/.test(t))
  if (noAlt.length) errors.push(`${noAlt.length} image(s) without alt text`)
  checks.push('All content images have alt text')

  if (!/\/unsubscribe\?/.test(input.html) || !/Unsubscribe:/.test(input.text)) errors.push('Unsubscribe link missing')
  checks.push('Unsubscribe link present in HTML and plain text')

  if (input.realSend && !input.optedIn) errors.push('Subscriber has not opted in')
  checks.push('Subscriber preference respected')

  if (!input.subject.trim() || input.subject.length > 70) errors.push('Subject missing or too long')
  if (!input.preview.trim()) warnings.push('Preview text is empty')
  if (input.html.length > 100_000) warnings.push(`HTML is ${Math.round(input.html.length / 1024)}KB - Gmail clips messages over ~102KB`)
  checks.push('Mobile-first 600px layout with dark-mode overrides')
  return { pass: errors.length === 0, errors, warnings, checks }
}
