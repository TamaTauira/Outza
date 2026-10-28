import { prisma } from '@/lib/prisma'
import { sydneyToday } from '@/lib/event-store'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const RETRY_DAYS = 3
// Site chrome rather than event artwork
const JUNK = /(favicon|apple-touch|sprite|placeholder|default[-_]?(og|share|image)|\.svg(\?|$)|\.ico(\?|$)|1x1|pixel|\/logos?\/|[-_]logo[-_.])/i

function abs(u: string, base: string): string | null {
  try {
    const r = new URL(u.replace(/&amp;/g, '&').trim(), base)
    return /^https?:$/.test(r.protocol) ? r.toString() : null
  } catch {
    return null
  }
}

function metaContent(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const t of tags) {
    if (!new RegExp(`(property|name|itemprop)\\s*=\\s*["']${key}["']`, 'i').test(t)) continue
    const c = t.match(/content\s*=\s*["']([^"']+)["']/i)
    if (c?.[1]) return c[1]
  }
  return null
}

function ldImage(html: string): string | null {
  for (const b of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const d = JSON.parse(b[1])
      const items: any[] = Array.isArray(d) ? d : d?.['@graph'] ?? [d]
      for (const it of items) {
        if (!/Event|Place|LocalBusiness|Organization|WebPage/.test(String(it?.['@type'] ?? ''))) continue
        const img = it?.image
        const u = typeof img === 'string' ? img : Array.isArray(img) ? (typeof img[0] === 'string' ? img[0] : img[0]?.url) : img?.url
        if (u) return u
      }
    } catch { /* malformed block */ }
  }
  return null
}

/** The page's own share image: og:image, then twitter:image, then schema.org image, then image_src. */
export function extractPageImage(html: string, pageUrl: string): string | null {
  const head = html.slice(0, 400_000)
  const candidates = [
    metaContent(head, 'og:image:secure_url'), metaContent(head, 'og:image'), metaContent(head, 'og:image:url'),
    metaContent(head, 'twitter:image'), metaContent(head, 'twitter:image:src'), ldImage(head),
    head.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? null,
  ]
  for (const c of candidates) {
    const u = c ? abs(c, pageUrl) : null
    if (u && !JUNK.test(u)) return u
  }
  return null
}

async function isImage(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Range: 'bytes=0-2047' }, signal: AbortSignal.timeout(10000) })
    const ok = (r.ok || r.status === 206) && /^image\/(jpe?g|png|webp|avif|gif)/i.test(r.headers.get('content-type') ?? '')
    await r.body?.cancel().catch(() => {})
    return ok
  } catch {
    return false
  }
}

export async function findImageForPage(pageUrl: string): Promise<string | null> {
  try {
    const r = await fetch(pageUrl, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(12000) })
    if (!r.ok || !/html/i.test(r.headers.get('content-type') ?? 'text/html')) return null
    const img = extractPageImage(await r.text(), r.url || pageUrl)
    return img && (await isImage(img)) ? img : null
  } catch {
    return null
  }
}

/**
 * For upcoming events with no artwork, looks up the image published on the event's own page
 * (the ticket/source link). Events sharing a page are filled together. Misses are retried after a few days.
 */
export async function discoverMissingImages(opts: { maxPages?: number; budgetMs?: number } = {}): Promise<{ pages: number; found: number; events: number }> {
  const deadline = Date.now() + (opts.budgetMs ?? 3 * 60 * 1000)
  const retryBefore = new Date(Date.now() - RETRY_DAYS * 86400 * 1000)
  const rows = await prisma.event.findMany({
    where: {
      date: { gte: sydneyToday() }, duplicateOfId: null, imageUrl: null, imageLocked: false, ticketUrl: { not: null },
      OR: [{ imageLookupAt: null }, { imageLookupAt: { lt: retryBefore } }],
    },
    select: { id: true, ticketUrl: true },
    orderBy: { date: 'asc' },
    take: 3000,
  })
  const byUrl = new Map<string, string[]>()
  for (const r of rows) byUrl.set(r.ticketUrl!, [...(byUrl.get(r.ticketUrl!) ?? []), r.id])
  const pages = [...byUrl.entries()].slice(0, opts.maxPages ?? 60)
  let found = 0, events = 0, next = 0, done = 0
  const worker = async () => {
    while (next < pages.length && Date.now() < deadline) {
      const [url, ids] = pages[next++]
      const img = await findImageForPage(url)
      done++
      if (img) { found++; events += ids.length }
      await prisma.event.updateMany({
        where: { id: { in: ids }, imageUrl: null },
        data: img ? { imageUrl: img, imageLookupAt: new Date() } : { imageLookupAt: new Date() },
      }).catch(() => {})
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  if (pages.length) console.log(`[images] page lookup: ${found}/${done} pages had artwork (${events} events)`)
  return { pages: done, found, events }
}
