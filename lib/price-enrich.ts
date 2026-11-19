/**
 * Fill prices the source feed left blank.
 * This is its own cron, after the listings burst, so it is not reading while
 * finalize is still writing. A statement timeout skips the run.
 */
import { Prisma } from '@prisma/client'
import { isDbSaturation, withStatementTimeout } from '@/lib/db-guard'
import { BROWSER_UA, sydneyToday } from '@/lib/event-store'
import { PRICE_ENRICH_BUDGET_MS, groupTargets, resolveEventPrice, type PriceFetch, type PriceGroup, type PriceRequest, type PriceResponse, type PriceTarget } from '@/lib/price-lookup'
import { PRICE_REASON, TRANSIENT_PRICE_REASONS } from '@/lib/price-read'

export { PRICE_ENRICH_BUDGET_MS }

const WAVE = 60
const CONCURRENCY = 1
const QUERY_TIMEOUT_MS = 8_000

export type PriceEnrichReport = {
  checked: number
  priced: number
  free: number
  stillUnknown: number
  reasons: Record<string, number>
  examples: { title: string; price: string; ticketPage: string | null; source: string }[]
  elapsedMs: number
  more: boolean
  upcomingUnknown: number
  totalUnknown: number
  /** The database was too busy. This run did not fail. */
  skipped?: boolean
}

const blankPrice = {
  isFree: false,
  priceMin: null,
  OR: [
    { price: null },
    { price: '' },
    { price: { equals: 'TBA', mode: 'insensitive' as const } },
    { price: { equals: 'TBC', mode: 'insensitive' as const } },
    { price: { equals: 'Price TBA', mode: 'insensitive' as const } },
    { price: { equals: 'Price TBC', mode: 'insensitive' as const } },
  ],
}

/**
 * Blank prices, at most `take` rows. Upcoming first, then past.
 * Literals (not Prisma parameters) so Postgres can use the partial index
 * in prisma/sql/20261119_price_due_index.sql. A parameterized `isFree = $1`
 * cannot prove that predicate.
 */
async function selectCandidates(direction: 'upcoming' | 'past', take: number, now: Date, skipTicketmaster: boolean): Promise<PriceTarget[]> {
  const today = sydneyToday()
  const transientBefore = new Date(now.getTime() - 6 * 60 * 60 * 1000)
  const stableBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const reasons = Prisma.join([...TRANSIENT_PRICE_REASONS])
  const sourceClause = skipTicketmaster ? Prisma.sql`AND source <> 'ticketmaster'` : Prisma.empty
  const dateClause = direction === 'upcoming' ? Prisma.sql`AND date >= ${today}` : Prisma.sql`AND date < ${today}`
  const order = direction === 'upcoming' ? Prisma.sql`ORDER BY date ASC, id ASC` : Prisma.sql`ORDER BY date DESC, id ASC`
  const rows = await withStatementTimeout(QUERY_TIMEOUT_MS, (tx) => tx.$queryRaw<PriceTarget[]>`
    SELECT id, source, title, "ticketUrl", "sourceUrl", date
    FROM "Event"
    WHERE "duplicateOfId" IS NULL
      AND "deletedAt" IS NULL
      AND "organiserEditedAt" IS NULL
      AND "isFree" = false
      AND "priceMin" IS NULL
      AND (
        price IS NULL
        OR price = ''
        OR lower(price) IN ('tba', 'tbc', 'price tba', 'price tbc')
      )
      AND (
        "priceCheckedAt" IS NULL
        OR "priceCheckedAt" < ${stableBefore}
        OR ("priceUnknownReason" IN (${reasons}) AND "priceCheckedAt" < ${transientBefore})
      )
      ${dateClause}
      ${sourceClause}
    ${order}
    LIMIT ${take}
  `)
  return rows.map((row) => ({ ...row, date: new Date(row.date) }))
}

function gapFor(host: string): number {
  const name = host.toLowerCase()
  if (name.endsWith('humanitix.com')) return 280
  if (name.endsWith('ticketmaster.com')) return 220
  if (name.endsWith('moshtix.com')) return 400
  if (name.includes('eventbrite.')) return 450
  if (name.endsWith('cityofsydney.nsw.gov.au')) return 400
  if (name.endsWith('brisbane.qld.gov.au')) return 400
  if (name.includes('oztix.')) return 500
  if (name.includes('frontiertouring.') || name.includes('coredna.')) return 600
  return 700
}

class HostGate {
  private next = new Map<string, number>()

  async wait(host: string, gapMs: number): Promise<void> {
    const now = Date.now()
    const at = Math.max(this.next.get(host) ?? 0, now)
    this.next.set(host, at + gapMs)
    const delay = at - now
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

function limitedFetch(gate: HostGate, cache: Map<string, Promise<PriceResponse>>): PriceFetch {
  return (req: PriceRequest) => {
    const cacheKey = `${req.method ?? 'GET'} ${req.url} ${req.body ?? ''}`
    const hit = cache.get(cacheKey)
    if (hit) return hit
    const pending = (async () => {
      let host = 'unknown'
      try { host = new URL(req.url).hostname } catch { /* keep the default gap */ }
      await gate.wait(host, gapFor(host))
      const timer = AbortSignal.timeout(12_000)
      try {
        const res = await fetch(req.url, {
          method: req.method ?? 'GET',
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: req.accept ?? 'text/html,application/json;q=0.9,*/*;q=0.8',
            ...(req.body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: req.body,
          redirect: 'follow',
          signal: timer,
          cache: 'no-store',
        })
        if (res.status === 429 || res.status === 503) {
          await res.body?.cancel().catch(() => {})
          return { status: res.status, body: null }
        }
        const body = await res.text()
        const blocked = (res.status === 403 || res.status === 401) || (body.length < 400 && /block|captcha|access denied|just a moment/i.test(body))
        if (blocked && res.status !== 200) return { status: res.status, body: null, blocked: true }
        return { status: res.status, body }
      } catch (err) {
        const name = err instanceof Error ? err.name : ''
        const timedOut = name === 'AbortError' || name === 'TimeoutError'
        return { status: 0, body: null, timedOut }
      }
    })()
    const stored = pending.then((res) => {
      if (res.status === 429 || res.status === 503 || res.status === 0) cache.delete(cacheKey)
      return res
    })
    cache.set(cacheKey, stored)
    return stored
  }
}

async function nextTargets(take: number, now: Date, skipTicketmaster: boolean): Promise<PriceTarget[]> {
  const upcoming = await selectCandidates('upcoming', take, now, skipTicketmaster)
  if (upcoming.length) return upcoming
  return selectCandidates('past', take, now, skipTicketmaster)
}

async function idsForGroup(group: PriceGroup): Promise<string[]> {
  if (!group.urls.length) return group.ids
  const more = await withStatementTimeout(QUERY_TIMEOUT_MS, (tx) => tx.event.findMany({
    where: {
      organiserEditedAt: null,
      duplicateOfId: null,
      deletedAt: null,
      AND: [
        blankPrice,
        { OR: group.urls.flatMap((url) => [{ ticketUrl: url }, { sourceUrl: url }]) },
      ],
    },
    select: { id: true },
    take: 200,
  }))
  return [...new Set([...group.ids, ...more.map((row) => row.id)])]
}

async function persist(group: PriceGroup, outcome: { price: string | null; isFree: boolean; min: number | null; max: number | null; reason: string | null }, now: Date) {
  const ids = [...group.ids]
  try {
    for (const id of await idsForGroup(group)) if (!ids.includes(id)) ids.push(id)
  } catch (err) {
    console.error('[price-enrich] sibling lookup failed', group.sample.id, err instanceof Error ? err.message : err)
  }
  if (!ids.length) return
  if (outcome.price) {
    await withStatementTimeout(QUERY_TIMEOUT_MS, (tx) => tx.event.updateMany({
      where: { id: { in: ids }, organiserEditedAt: null, duplicateOfId: null, AND: [blankPrice] },
      data: {
        price: outcome.price,
        isFree: outcome.isFree,
        priceMin: outcome.min,
        priceMax: outcome.max,
        priceCheckedAt: now,
        priceUnknownReason: null,
      },
    }))
    return
  }
  await withStatementTimeout(QUERY_TIMEOUT_MS, (tx) => tx.event.updateMany({
    where: { id: { in: ids }, organiserEditedAt: null, duplicateOfId: null, AND: [blankPrice] },
    data: { priceCheckedAt: now, priceUnknownReason: outcome.reason ?? PRICE_REASON.unpublished },
  }))
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  let index = 0
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]
      index += 1
      await run(item)
    }
  })
  await Promise.all(workers)
}

export async function countUnknownPrices(): Promise<{ upcoming: number; total: number }> {
  const today = sydneyToday()
  const base = { duplicateOfId: null, deletedAt: null, AND: [blankPrice] }
  const [upcoming, total] = await withStatementTimeout(QUERY_TIMEOUT_MS, (tx) => Promise.all([
    tx.event.count({ where: { ...base, date: { gte: today } } }),
    tx.event.count({ where: base }),
  ]))
  return { upcoming, total }
}

export async function runPriceEnrich(opts?: { budgetMs?: number; fetch?: PriceFetch; now?: Date }): Promise<PriceEnrichReport> {
  const started = Date.now()
  const budgetMs = opts?.budgetMs ?? PRICE_ENRICH_BUDGET_MS
  const now = opts?.now ?? new Date()
  const fetch = opts?.fetch ?? limitedFetch(new HostGate(), new Map())
  const apiKey = process.env.TICKETMASTER_API_KEY?.trim() || null
  // Without the discovery key, leave Ticketmaster rows untouched so the hosted cron can price them.
  const skipTicketmaster = !apiKey
  let checked = 0
  let priced = 0
  let free = 0
  const reasons: Record<string, number> = {}
  const examples: PriceEnrichReport['examples'] = []
  let more = false

  while (Date.now() - started < budgetMs - 20_000) {
    let rows: PriceTarget[]
    try {
      rows = await nextTargets(WAVE, now, skipTicketmaster)
    } catch (err) {
      if (isDbSaturation(err)) {
        console.warn('[price-enrich] skipped this run, database saturated', err instanceof Error ? err.message : err)
        return {
          checked, priced, free, stillUnknown: checked - priced, reasons, examples,
          elapsedMs: Date.now() - started, more: false, upcomingUnknown: -1, totalUnknown: -1, skipped: true,
        }
      }
      console.error('[price-enrich] target read failed', err instanceof Error ? err.message : err)
      more = true
      break
    }
    if (!rows.length) { more = false; break }
    const groups = groupTargets(rows)
    let stopped = false
    await pool(groups, CONCURRENCY, async (group) => {
      if (stopped || Date.now() - started >= budgetMs - 15_000) { stopped = true; return }
      try {
        const outcome = await Promise.race([
          resolveEventPrice(group.sample, fetch, { ticketmasterKey: apiKey }),
          new Promise<Awaited<ReturnType<typeof resolveEventPrice>>>((resolve) => {
            setTimeout(() => resolve({ price: null, isFree: false, min: null, max: null, reason: PRICE_REASON.timedOut, ticketPage: group.key }), 25_000)
          }),
        ])
        await persist(group, outcome, new Date())
        checked += 1
        if (outcome.price) {
          priced += 1
          if (outcome.isFree) free += 1
          if (examples.length < 8) {
            examples.push({ title: group.sample.title, price: outcome.price, ticketPage: outcome.ticketPage, source: group.sample.source })
          }
        } else {
          const reason = outcome.reason ?? PRICE_REASON.unpublished
          reasons[reason] = (reasons[reason] ?? 0) + 1
        }
      } catch (err) {
        console.error('[price-enrich] lookup failed', group.sample.id, err instanceof Error ? err.message : err)
        reasons[PRICE_REASON.sourceDown] = (reasons[PRICE_REASON.sourceDown] ?? 0) + 1
      }
    })
    more = rows.length === WAVE || stopped
    if (rows.length < WAVE && !stopped) { more = false; break }
    if (stopped) break
  }

  const unknown = Date.now() - started > budgetMs - 10_000
    ? { upcoming: -1, total: -1 }
    : await countUnknownPrices().catch(() => ({ upcoming: -1, total: -1 }))
  const elapsedMs = Date.now() - started
  console.log(`[price-enrich] checked ${checked}, priced ${priced}, free ${free}, ${elapsedMs}ms`)
  return { checked, priced, free, stillUnknown: checked - priced, reasons, examples, elapsedMs, more, upcomingUnknown: unknown.upcoming, totalUnknown: unknown.total }
}
