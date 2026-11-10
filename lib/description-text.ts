/**
 * Full listing copy. Sources often publish a one-line strapline and a longer
 * write-up. The event page shows the write-up, with paragraph breaks kept
 * and tags turned into text.
 */
import { repairDbEscapes } from '@/lib/db-text'

/** Long enough for a source write-up. The column is text, not a short varchar. */
export const DESCRIPTION_MAX = 8000

const NAMED_ENTITY: Record<string, string> = {
  amp: '&',
  nbsp: ' ',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (all, digits) => {
      const code = Number(digits)
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all
    })
    .replace(/&#x([0-9a-f]+);/gi, (all, hex) => {
      const code = Number.parseInt(hex, 16)
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all
    })
    .replace(/&([a-z]+);/gi, (all, name) => NAMED_ENTITY[name.toLowerCase()] ?? all)
}

function stripUnpairedSurrogates(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = s.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1]
        i++
      }
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue
    out += s[i]
  }
  return out
}

function truncateCodePoints(s: string, max: number): string {
  if (max <= 0) return ''
  const chars = Array.from(s)
  if (chars.length <= max) return s
  const cut = chars.slice(0, max).join('')
  const paragraph = cut.lastIndexOf('\n\n')
  if (paragraph > max * 0.6) return cut.slice(0, paragraph).trimEnd()
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1).trimEnd()
  return cut.trimEnd()
}

/**
 * Turn source HTML or plain text into paragraphs.
 * Block tags become blank lines. Tags are removed. Nothing is executed.
 */
export function paragraphsFromHtml(input: unknown): string {
  if (typeof input !== 'string' || !input) return ''
  const withBreaks = input
    .replace(/\r\n?/g, '\n')
    .replace(/<\s*(script|style|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*\/\s*(?:p|div|h[1-6]|li|tr|blockquote|section|article|ul|ol)\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
  const decoded = decodeEntities(withBreaks).replace(/\u0000/g, '')
  const lines = decoded.split('\n').map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Storeable description: paragraphs kept, escapes safe, capped. */
export function sanitizeDescription(input: unknown, max = DESCRIPTION_MAX): string {
  const plain = paragraphsFromHtml(input)
  if (!plain) return ''
  return repairDbEscapes(truncateCodePoints(stripUnpairedSurrogates(plain), max))
}

function proseLength(value: string): number {
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text || /^[.\s•\-–—]+$/.test(text)) return 0
  return text.length
}

/** The fullest real write-up among the fields a source sent. */
export function preferDescription(...parts: unknown[]): string | null {
  let best = ''
  let bestLen = 0
  for (const part of parts) {
    const text = sanitizeDescription(part)
    const len = proseLength(text)
    if (len > bestLen) {
      best = text
      bestLen = len
    }
  }
  return best || null
}

/**
 * Moshtix sends a teaser and a description. The teaser is often door times.
 * The description is the write-up. A thin or empty description falls back to the teaser.
 */
export function moshtixListingDescription(teaser: unknown, description: unknown): string | null {
  const full = sanitizeDescription(description)
  const short = sanitizeDescription(teaser)
  if (proseLength(full) >= 80) return full
  if (proseLength(short) > proseLength(full)) return short
  return full || short || null
}

/**
 * True when a refresh must not replace the stored write-up.
 * A longer text always wins. A short strapline must not wipe a full description,
 * including when the strapline is not a substring of that description.
 */
export function keepStoredDescription(existing: string | null | undefined, incoming: string | null | undefined): boolean {
  const stored = sanitizeDescription(existing)
  const next = sanitizeDescription(incoming)
  if (!stored) return false
  if (!next) return true
  if (proseLength(next) >= proseLength(stored)) return false
  const flatStored = stored.replace(/\s+/g, ' ')
  const flatNext = next.replace(/\s+/g, ' ')
  if (flatStored.includes(flatNext)) return true
  return proseLength(stored) >= proseLength(next) + 80 && proseLength(next) <= 320
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as JsonRecord
}

function cosDetailDescription(detail: JsonRecord | null): string | null {
  return preferDescription(detail?.description, detail?.body, detail?.content)
}

/** City of Sydney event page, current Sitecore state or the older Next payload. */
export function cosDescriptionFromHtml(html: string): string | null {
  const jss = html.match(/<script type="application\/json" id="__JSS_STATE__">([\s\S]*?)<\/script>/)
  if (jss) {
    try {
      const data = JSON.parse(jss[1]) as JsonRecord
      const detail = asRecord(asRecord(asRecord(data.sitecore)?.context)?.eventDetail)
      const full = cosDetailDescription(detail)
      if (full) return full
    } catch { /* try the next payload */ }
  }
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!next) return null
  try {
    const data = JSON.parse(next[1]) as JsonRecord
    const eventData = asRecord(asRecord(asRecord(data.props)?.pageProps)?.eventData)
    return cosDetailDescription(eventData)
  } catch {
    return null
  }
}

/** Eventbrite event page. The search card only has `summary`. */
export function eventbriteDescriptionFromHtml(html: string): string | null {
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (!next) return null
  try {
    const data = JSON.parse(next[1]) as JsonRecord
    const context = asRecord(asRecord(asRecord(data.props)?.pageProps)?.context)
    const basic = asRecord(context?.basicInfo)
    const structured = asRecord(context?.structuredContent)
    const modules = Array.isArray(structured?.modules) ? structured.modules : []
    const blocks = modules
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => !!item && item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
    return preferDescription(blocks.join('\n\n'), basic?.summary)
  } catch {
    return null
  }
}

/** Humanitix event page. The city carousel does not include the write-up. */
export function humanitixDescriptionFromHtml(html: string): string | null {
  const blocks: string[] = []
  const re = /component:"richtext",props:\{title:"Description",content:"((?:\\.|[^"\\])*)"/g
  for (const match of html.matchAll(re)) {
    try {
      blocks.push(JSON.parse(`"${match[1]}"`) as string)
    } catch { /* skip a broken block */ }
  }
  if (blocks.length) return preferDescription(blocks.join('\n\n'))
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  if (!ld) return null
  try {
    const data = JSON.parse(ld[1]) as JsonRecord
    const description = typeof data.description === 'string' ? data.description : ''
    if (/^buy tickets on humanitix/i.test(description.trim())) return null
    return preferDescription(description)
  } catch {
    return null
  }
}

/** The text to store, or null when the current description should stay. */
export function descriptionUpdate(current: string | null | undefined, incoming: string | null | undefined): string | null {
  const next = sanitizeDescription(incoming)
  if (!next) return null
  const stored = sanitizeDescription(current)
  if (next === stored) return null
  if (keepStoredDescription(stored, next)) return null
  return next
}

export function descriptionParagraphs(text: string | null | undefined): string[] {
  const clean = sanitizeDescription(text)
  if (!clean) return []
  return clean.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
}
