import { hiddenFromPublic, type PublicSession } from '@/lib/listing-visibility'
import { isPastEvent } from '@/lib/seo'

export type Probe = { name: string; ok: boolean; detail: string }

async function probe(name: string, url: string, fetchImpl: typeof fetch, expect: (res: Response, body: string) => boolean, init: RequestInit = {}): Promise<Probe> {
  try {
    const { headers, ...rest } = init
    const res = await fetchImpl(url, {
      redirect: 'follow',
      ...rest,
      headers: { 'user-agent': 'VibePeep synthetic check', ...(headers as Record<string, string> | undefined) },
    })
    const body = await res.text()
    const ok = res.ok && expect(res, body)
    return { name, ok, detail: ok ? `${res.status}` : `${res.status} ${url}` }
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : 'fetch failed' }
  }
}

/** Home, a city, one event, Ask, the sitemap, and the share image. */
export async function runSyntheticChecks(opts: {
  origin: string
  eventPath: string | null
  fetchImpl?: typeof fetch
}): Promise<Probe[]> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const origin = opts.origin.replace(/\/$/, '')
  const checks = [
    probe('home', `${origin}/`, fetchImpl, (_res, body) => /vibepeep/i.test(body)),
    probe('sydney', `${origin}/sydney`, fetchImpl, (_res, body) => body.length > 200),
    probe('sitemap', `${origin}/sitemap.xml`, fetchImpl, (_res, body) => /<sitemapindex|<urlset/i.test(body)),
    probe('og', `${origin}/og-image.png`, fetchImpl, (res) => /image\//i.test(res.headers.get('content-type') ?? '')),
    probe('ask', `${origin}/api/ai-search`, fetchImpl, asyncExpect, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'jazz tonight in Sydney' }),
    }),
  ]
  if (opts.eventPath) checks.splice(2, 0, probe('event', `${origin}${opts.eventPath}`, fetchImpl, (_res, body) => body.length > 200))
  return Promise.all(checks)
}

function asyncExpect(_res: Response, body: string): boolean {
  try {
    const json = JSON.parse(body) as { error?: string; results?: unknown }
    return !json.error
  } catch {
    return false
  }
}

/**
 * First candidate that is still on. A finished listing keeps its page, but the
 * hourly check should open one that has not ended yet.
 */
export function pickPublicEvent<T extends PublicSession & { date: string | Date; city?: string | null }>(candidates: T[], now = new Date()): T | null {
  return candidates.find((ev) => !isPastEvent(ev, now) && !hiddenFromPublic(ev, now)) ?? null
}
