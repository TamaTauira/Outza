import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorized, forbidden } from '@/lib/session'
import { assetIdFor, bestSourceUrl } from '@/lib/images/source-url'
import { processAsset } from '@/lib/images/pipeline'
import { linkEventImage, runImagePass } from '@/lib/images/runner'
import { imageAssetSelect } from '@/lib/images/spec'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function guard(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return null
  const me = await getSessionUser()
  if (!me) return unauthorized()
  if (me.role !== 'ADMIN') return forbidden()
  return null
}

const eventSelect = {
  id: true, title: true, date: true, source: true, imageUrl: true, imageLocked: true,
  imageAsset: { select: { ...imageAssetSelect, id: true, note: true, score: true, enhanced: true, sourceUrl: true, processedAt: true } },
} as const

/** Pipeline stats, recent runs and the manual-review queue */
export async function GET(req: Request) {
  const denied = await guard(req)
  if (denied) return denied
  const [byStatus, runs, totals, review, noImage, history, localReview] = await Promise.all([
    prisma.imageAsset.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.imageRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
    prisma.imageRun.aggregate({ _sum: { processed: true, ok: true, enhanced: true, rejected: true, review: true, failed: true, cached: true, unchanged: true, costUsd: true } }),
    prisma.event.findMany({
      where: { date: { gte: new Date() }, duplicateOfId: null, imageAsset: { status: { in: ['REVIEW', 'FAILED'] } } },
      orderBy: { date: 'asc' }, take: 60, select: eventSelect,
    }),
    prisma.event.count({ where: { date: { gte: new Date() }, duplicateOfId: null, imageUrl: null } }),
    prisma.imageHistory.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { event: { select: { title: true } } } }),
    prisma.localListing.findMany({
      where: { expiresAt: { gte: new Date() }, imageAsset: { status: { in: ['REVIEW', 'FAILED', 'LOW_RES'] } } },
      orderBy: { createdAt: 'desc' }, take: 40,
      select: { id: true, title: true, organiserName: true, contactEmail: true, imageAsset: { select: { status: true, note: true, width: true } } },
    }),
  ])
  return NextResponse.json({
    status: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    noImage, runs, totals: totals._sum, review, history, localReview,
  })
}

/**
 * { action: 'run', limit? }                 start a background pass
 * { action: 'lookup', eventId }             one event's image record
 * { action: 'regenerate', eventId }         re-import and re-process now
 * { action: 'replace', eventId, url }       manual artwork (locked against source refreshes)
 * { action: 'unlock', eventId }             let source refreshes manage the artwork again
 */
export async function POST(req: Request) {
  const denied = await guard(req)
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  if (b.action === 'run') {
    void runImagePass({ trigger: 'admin', limit: Math.min(Number(b.limit) || 150, 500) })
    return NextResponse.json({ ok: true, started: true })
  }
  const eventId = typeof b.eventId === 'string' ? b.eventId.trim().replace(/^.*\/events\//, '').replace(/[/?#].*$/, '') : ''
  const ev = eventId ? await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, imageUrl: true, imageAssetId: true } }) : null
  if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  if (b.action === 'lookup') {
    return NextResponse.json({ event: await prisma.event.findUnique({ where: { id: ev.id }, select: eventSelect }) })
  }
  if (b.action === 'regenerate') {
    const id = await linkEventImage(ev.id)
    if (!id) return NextResponse.json({ error: 'This event has no source image - set one with Replace' }, { status: 400 })
    await prisma.imageAsset.update({ where: { id }, data: { attempts: 0 } })
    const r = await processAsset(id, { force: true })
    await prisma.imageHistory.create({ data: { eventId: ev.id, oldAssetId: ev.imageAssetId, newAssetId: id, oldUrl: ev.imageUrl, newUrl: ev.imageUrl, reason: 'ADMIN_REGENERATE' } })
    return NextResponse.json({ ok: true, result: r, event: await prisma.event.findUnique({ where: { id: ev.id }, select: eventSelect }) })
  }
  if (b.action === 'replace') {
    const url = bestSourceUrl(typeof b.url === 'string' ? b.url.slice(0, 1000) : '')
    if (!url) return NextResponse.json({ error: 'Enter a valid http(s) image link' }, { status: 400 })
    const id = assetIdFor(url)
    await prisma.imageAsset.upsert({ where: { id }, create: { id, sourceUrl: url }, update: { attempts: 0 } })
    await prisma.event.update({ where: { id: ev.id }, data: { imageUrl: url, imageAssetId: id, imageLocked: true } })
    await prisma.imageHistory.create({ data: { eventId: ev.id, oldAssetId: ev.imageAssetId, newAssetId: id, oldUrl: ev.imageUrl, newUrl: url, reason: 'ADMIN_REPLACE' } })
    const r = await processAsset(id, { force: true })
    return NextResponse.json({ ok: true, result: r, event: await prisma.event.findUnique({ where: { id: ev.id }, select: eventSelect }) })
  }
  if (b.action === 'unlock') {
    await prisma.event.update({ where: { id: ev.id }, data: { imageLocked: false } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
