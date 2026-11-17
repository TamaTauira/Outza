/**
 * Fill prices the source feed left blank.
 * This is its own cron, with its own time budget, so it cannot push the
 * listings refresh or finalize past the 300s function limit.
 */
import { BROWSER_UA, sydneyToday } from '@/lib/event-store'
import { prisma } from '@/lib/prisma'
import { PRICE_ENRICH_BUDGET_MS, groupTargets, resolveEventPrice, type PriceFetch, type PriceGroup, type PriceRequest, type PriceResponse, type PriceTarget } from '@/lib/price-lookup'
import { PRICE_REASON, TRANSIENT_PRICE_REASONS } from '@/lib/price-read'

export { PRICE_ENRICH_BUDGET_MS }

const WAVE = 60
const CONCURRENCY = 2

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

function dueWhere(now: Date) {
  const transientBefore = new Date(now.getTime() - 6 * 60 * 60 * 1000)
  const stableBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return {
    duplicateOfId: null,
    deletedAt: null,
    organiserEditedAt: null,
    AND: [
      blankPrice,
      {
        OR: [
          { priceCheckedAt: null },
          { AND: [{ priceUnknownReason: { in: [...TRANSIENT_PRICE_REASONS] } }, { priceCheckedAt: { lt: transientBefore } }] },
          { priceCheckedAt: { lt: stableBefore } },
        ],
      },
    ],
  }
}

let columnsReady: Promise<void> | null = null

export function ensurePriceColumns(): Promise<void> {
  if (!columnsReady) {
    columnsReady = (async () => {
      await prisma.$executeRaw`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "priceCheckedAt" TIMESTAMP(3)`
      await prisma.$executeRaw`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "priceUnknownReason" TEXT`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Event_priceCheckedAt_idx" ON "Event" ("priceCheckedAt")`
    })().catch((err) => {
      columnsReady = null
      throw err
    })
  }
  return columnsReady
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
  private chain = new Map<string, Promise<void>>()

  wait(host: string, gapMs: number): Promise<void> {
    const prev = this.chain.get(host) ?? Promise.resolve()
    let release: () => void = () => {}
    const current = new Promise<void>((resolve) => { release = resolve })
    this.chain.set(host, current)
    return prev.then(async () => {
      const now = Date.now()
      const at = this.next.get(host) ?? 0
      const delay = Math.max(0, at - now)
      this.next.set(host, Math.max(at, now) + gapMs)
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
    }).finally(release)
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

async function nextTargets(take: number, now: Date, extra: Record<string, unknown>): Promise<PriceTarget[]> {
  const today = sydneyToday()
  const select = { id: true, source: true, title: true, ticketUrl: true, sourceUrl: true, date: true } as const
  const where = { ...dueWhere(now), ...extra }
  const upcoming = await prisma.event.findMany({
    where: { ...where, date: { gte: today } },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    take,
    select,
  })
  if (upcoming.length) return upcoming
  return prisma.event.findMany({
    where: { ...where, date: { lt: today } },
    orderBy: [{ date: 'desc' }, { id: 'asc' }],
    take,
    select,
  })
}

async function idsForGroup(group: PriceGroup): Promise<string[]> {
  if (!group.urls.length) return group.ids
  const more = await prisma.event.findMany({
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
    take: 2000,
  })
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
    await prisma.event.updateMany({
      where: { id: { in: ids }, organiserEditedAt: null, duplicateOfId: null, AND: [blankPrice] },
      data: {
        price: outcome.price,
        isFree: outcome.isFree,
        priceMin: outcome.min,
        priceMax: outcome.max,
        priceCheckedAt: now,
        priceUnknownReason: null,
      },
    })
    return
  }
  await prisma.event.updateMany({
    where: { id: { in: ids }, organiserEditedAt: null, duplicateOfId: null, AND: [blankPrice] },
    data: { priceCheckedAt: now, priceUnknownReason: outcome.reason ?? PRICE_REASON.unpublished },
  })
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
  await ensurePriceColumns()
  const today = sydneyToday()
  const base = { duplicateOfId: null, deletedAt: null, AND: [blankPrice] }
  const [upcoming, total] = await Promise.all([
    prisma.event.count({ where: { ...base, date: { gte: today } } }),
    prisma.event.count({ where: base }),
  ])
  return { upcoming, total }
}

export async function runPriceEnrich(opts?: { budgetMs?: number; fetch?: PriceFetch; now?: Date }): Promise<PriceEnrichReport> {
  const started = Date.now()
  const budgetMs = opts?.budgetMs ?? PRICE_ENRICH_BUDGET_MS
  const now = opts?.now ?? new Date()
  await ensurePriceColumns()
  const fetch = opts?.fetch ?? limitedFetch(new HostGate(), new Map())
  const apiKey = process.env.TICKETMASTER_API_KEY?.trim() || null
  // Without the discovery key, leave Ticketmaster rows untouched so the hosted cron can price them.
  const sourceFilter = apiKey ? {} : { NOT: { source: 'ticketmaster' } }
  let checked = 0
  let priced = 0
  let free = 0
  const reasons: Record<string, number> = {}
  const examples: PriceEnrichReport['examples'] = []
  let more = false

  while (Date.now() - started < budgetMs - 4_000) {
    const rows = await nextTargets(WAVE, now, sourceFilter)
    if (!rows.length) { more = false; break }
    const groups = groupTargets(rows)
    let stopped = false
    await pool(groups, CONCURRENCY, async (group) => {
      if (stopped || Date.now() - started >= budgetMs - 2_000) { stopped = true; return }
      try {
        const outcome = await resolveEventPrice(group.sample, fetch, { ticketmasterKey: apiKey })
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

  const unknown = await countUnknownPrices().catch(() => ({ upcoming: -1, total: -1 }))
  const elapsedMs = Date.now() - started
  console.log(`[price-enrich] checked ${checked}, priced ${priced}, free ${free}, ${elapsedMs}ms`)
  return { checked, priced, free, stillUnknown: checked - priced, reasons, examples, elapsedMs, more, upcomingUnknown: unknown.upcoming, totalUnknown: unknown.total }
}
