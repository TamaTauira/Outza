import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { sydneyDay } from '@/lib/commercial-metrics'

const COOKIE = 'vp_vid'
const VISITOR = /^[A-Za-z0-9_-]{22}$/
const QUERY_KEY = /^[a-f0-9]{8}$/
const DAILY_SEARCH_CAP = 40

export function analyticsAllowed(req: Request): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly/i.test(ua)) return false
  const purpose = `${req.headers.get('purpose') ?? ''} ${req.headers.get('sec-purpose') ?? ''}`
  if (/prefetch/i.test(purpose) || req.headers.get('next-router-prefetch') === '1') return false
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return false
  return true
}

function missing(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  if (code === 'P2021' || code === 'P2022') return true
  return /does not exist|42P01|P2021|P2022/i.test(String((err as { message?: string })?.message ?? ''))
}

async function markEpoch(key: 'audience' | 'discovery') {
  try {
    await prisma.metricEpoch.create({ data: { key, startedAt: new Date() } })
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code !== 'P2002' && !missing(err)) console.error('[analytics] epoch', (err as Error).message)
  }
}

/** Anonymous id in a first-party cookie. Never a name, email, or account id. */
export async function ensureVisitor(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(COOKIE)?.value ?? ''
  if (VISITOR.test(existing)) return existing
  const id = randomBytes(16).toString('base64url')
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 400,
  })
  return id
}

export async function recordAudience(visitorId: string, now = new Date()) {
  if (!VISITOR.test(visitorId)) return
  const day = sydneyDay(now)
  try {
    await prisma.audienceDay.create({ data: { visitorId, day } })
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2002') throw err
  }
  await markEpoch('audience')
}

export async function recordSearch(visitorId: string, queryKey: string, now = new Date()) {
  if (!VISITOR.test(visitorId) || !QUERY_KEY.test(queryKey)) return
  await recordAudience(visitorId, now)
  const day = sydneyDay(now)
  const count = await prisma.discoverySearch.count({ where: { visitorId, day } })
  if (count >= DAILY_SEARCH_CAP) {
    const exists = await prisma.discoverySearch.findUnique({
      where: { visitorId_day_queryKey: { visitorId, day, queryKey } },
      select: { queryKey: true },
    })
    if (!exists) return
    await markEpoch('discovery')
    return
  }
  try {
    await prisma.discoverySearch.create({ data: { visitorId, day, queryKey } })
  } catch (err) {
    if ((err as { code?: string }).code !== 'P2002') throw err
  }
  await markEpoch('discovery')
}

/** Marks the latest search from today that has not opened an event yet. */
export async function recordSearchClick(visitorId: string, now = new Date()) {
  if (!VISITOR.test(visitorId)) return
  await recordAudience(visitorId, now)
  const day = sydneyDay(now)
  const open = await prisma.discoverySearch.findFirst({
    where: { visitorId, day, clicked: false },
    orderBy: { createdAt: 'desc' },
  })
  if (!open) return
  await prisma.discoverySearch.update({
    where: { visitorId_day_queryKey: { visitorId: open.visitorId, day: open.day, queryKey: open.queryKey } },
    data: { clicked: true },
  })
}

export async function quietly(fn: () => Promise<void>) {
  try {
    await fn()
  } catch (err) {
    if (!missing(err)) console.error('[analytics]', (err as Error).message)
  }
}
