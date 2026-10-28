import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { CITIES } from '@/lib/cities'
import { LOCAL_CATEGORIES, RECURRENCES, isDateStr, isTimeStr } from '@/lib/local-shared'

/** Fields the submit form can be prefilled with. Anything the source doesn't state stays empty. */
export interface ExtractedListing {
  title: string; category: string; description: string; address: string; suburb: string; postcode: string; city: string
  startDate: string; endDate: string; startTime: string; endTime: string; recurrence: string; recurUntil: string
  priceNote: string; organiserName: string; websiteUrl: string
}
const KEYS: (keyof ExtractedListing)[] = ['title', 'category', 'description', 'address', 'suburb', 'postcode', 'city', 'startDate', 'endDate', 'startTime', 'endTime', 'recurrence', 'recurUntil', 'priceNote', 'organiserName', 'websiteUrl']

export class ExtractError extends Error {}

const BLOCKED_HOSTS = /(^|\.)(facebook\.com|fb\.me|fb\.com|instagram\.com|messenger\.com|whatsapp\.com)$/i
const privateIp = (ip: string) =>
  /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) || ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip)

/** Fetches a public web page safely (no private networks, size and time capped) and returns readable text. */
export async function readPage(raw: string): Promise<{ text: string; url: string }> {
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`) } catch { throw new ExtractError('That link doesn’t look right.') }
  if (!/^https?:$/.test(u.protocol)) throw new ExtractError('Only web links (http or https) can be imported.')
  if (BLOCKED_HOSTS.test(u.hostname)) throw new ExtractError('We don’t read Facebook or Instagram pages. Upload the flyer or paste the details instead.')
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new ExtractError('That link can’t be imported.')
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new ExtractError('We couldn’t reach that website. Check the link and try again.')
  if (addrs.some((a) => privateIp(a.address))) throw new ExtractError('That link can’t be imported.')

  const res = await fetch(u, {
    redirect: 'follow', signal: AbortSignal.timeout(12000),
    headers: { 'User-Agent': 'OutzaBot/1.0 (+https://outza.abacusai.app/how-listings-work)', Accept: 'text/html,application/xhtml+xml' },
  }).catch(() => null)
  if (!res || !res.ok) throw new ExtractError(`We couldn’t open that page${res ? ` (error ${res.status})` : ''}. Try uploading the flyer instead.`)
  if (res.url && BLOCKED_HOSTS.test(new URL(res.url).hostname)) throw new ExtractError('We don’t read Facebook or Instagram pages. Upload the flyer or paste the details instead.')
  const type = res.headers.get('content-type') ?? ''
  if (!/html|text\/plain/i.test(type)) throw new ExtractError('That link isn’t a web page. If it’s a PDF, download it and upload it here instead.')
  const html = (await res.text()).slice(0, 600_000)

  // Structured event data (schema.org JSON-LD) is the most reliable part of a page, so it goes first.
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim()).filter((s) => /Event/.test(s)).join('\n').slice(0, 8000)
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  const metaDesc = html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']*)/i)?.[1] ?? ''
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
  const text = [`Page title: ${title}`, metaDesc && `Summary: ${metaDesc}`, ld && `Structured data:\n${ld}`, `Page text:\n${body}`].filter(Boolean).join('\n\n').slice(0, 24000)
  return { text, url: res.url || u.toString() }
}

export async function readDocx(buf: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  try {
    return (await mammoth.extractRawText({ buffer: buf })).value
  } catch {
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    return (await mammoth.extractRawText({ arrayBuffer: ab } as any)).value
  }
}

const SYSTEM = (today: string) => `You extract details of ONE public event or sale for an Australian community listings site (garage sales, clearance/warehouse sales, markets & pop-ups, community activities). Today is ${today}.
Copy facts exactly as the source states them. Never guess, infer or invent: if the source doesn't state a field, return "" for it.
Respond with raw JSON only, exactly these keys (all strings):
{"title":"","category":"GARAGE|WAREHOUSE|MARKET|COMMUNITY or empty","description":"plain-text summary of what's on, using only the source's own facts, max 1200 chars","address":"street number and street, or venue name and street","suburb":"","postcode":"4 digits","city":"one of: ${CITIES.map((c) => c.name).join(', ')} — only if clearly in or near that city","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD for a multi-day one-off, else empty","startTime":"HH:MM 24h","endTime":"HH:MM 24h","recurrence":"NONE|WEEKLY|FORTNIGHTLY|MONTHLY_NTH (only if the source says it repeats)","recurUntil":"YYYY-MM-DD or empty","priceNote":"entry price as stated, e.g. Free entry, max 80 chars","organiserName":"","websiteUrl":"organiser or event web link stated in the source"}
If a date has no year, use the next upcoming occurrence after today. If the source lists several dates, use the next upcoming one as startDate.`

/** Sends page text, document text or a PDF to the LLM and returns validated fields + the list of required fields still missing. */
export async function extractListing(input: { text?: string; pdfBase64?: string; filename?: string }, today: string): Promise<ExtractedListing> {
  const key = process.env.ABACUSAI_API_KEY
  if (!key) throw new ExtractError('Import is not available right now. Please fill in the form manually.')
  const content = input.pdfBase64
    ? [{ type: 'file', file: { filename: input.filename || 'flyer.pdf', file_data: `data:application/pdf;base64,${input.pdfBase64}` } }, { type: 'text', text: 'Extract the event details from this document.' }]
    : `Here is the content:\n\n${input.text}`
  const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-5.4-mini', temperature: 0, max_tokens: 1500, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM(today) }, { role: 'user', content }] }),
    signal: AbortSignal.timeout(60000),
  }).catch((e) => { console.error('Local extract LLM request failed:', e?.message); return null })
  if (!res || !res.ok) throw new ExtractError('Reading the details failed at the AI step. Please try again or fill in the form manually.')
  let raw: Record<string, unknown> = {}
  try { raw = JSON.parse((await res.json())?.choices?.[0]?.message?.content ?? '{}') } catch { throw new ExtractError('We couldn’t read the details from that source. Please fill in the form manually.') }
  return sanitise(raw)
}

function sanitise(r: Record<string, unknown>): ExtractedListing {
  const s = (k: string, max: number) => String(r[k] ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const out = Object.fromEntries(KEYS.map((k) => [k, ''])) as unknown as ExtractedListing
  out.title = s('title', 100)
  out.description = String(r.description ?? '').trim().slice(0, 1500)
  out.address = s('address', 160)
  out.suburb = s('suburb', 60)
  out.postcode = /^\d{4}$/.test(s('postcode', 4)) ? s('postcode', 4) : ''
  out.priceNote = s('priceNote', 80)
  out.organiserName = s('organiserName', 80)
  const cat = s('category', 20).toUpperCase()
  out.category = LOCAL_CATEGORIES.some((c) => c.key === cat) ? cat : ''
  const city = CITIES.find((c) => c.name.toLowerCase() === s('city', 40).toLowerCase())
  out.city = city?.name ?? ''
  const rec = s('recurrence', 20).toUpperCase()
  out.recurrence = RECURRENCES.some((x) => x.key === rec) ? rec : ''
  for (const k of ['startDate', 'endDate', 'recurUntil'] as const) out[k] = isDateStr(s(k, 10)) ? s(k, 10) : ''
  for (const k of ['startTime', 'endTime'] as const) { const t = s(k, 5).padStart(5, '0'); out[k] = isTimeStr(t) ? t : '' }
  const web = s('websiteUrl', 300)
  try { if (web) { const u = new URL(/^https?:\/\//.test(web) ? web : `https://${web}`); out.websiteUrl = u.toString() } } catch { out.websiteUrl = '' }
  return out
}

/** Required form fields, in form order, with the labels the lister sees. */
export const REQUIRED_FIELDS: [keyof ExtractedListing, string][] = [
  ['title', 'Title'], ['description', 'Description'], ['address', 'Street address'], ['suburb', 'Suburb'], ['postcode', 'Postcode'],
  ['startDate', 'Date'], ['startTime', 'Start time'], ['endTime', 'Finish time'], ['organiserName', 'Name shown on the listing'],
]
