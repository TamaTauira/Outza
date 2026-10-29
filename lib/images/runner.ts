import { prisma } from '@/lib/prisma'
import { publicUrl } from '@/lib/s3'
import { sydneyToday } from '@/lib/event-store'
import { assetIdFor, bestSourceUrl } from './source-url'
import { loadSharp, processAsset, type Outcome } from './pipeline'
import { discoverMissingImages } from './discover'

const RECHECK_DAYS = 14
const MAX_ATTEMPTS = 3

/** Points an event at the ImageAsset for its (upgraded) image URL, creating the asset if needed. */
export async function linkEventImage(eventId: string): Promise<string | null> {
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { imageUrl: true, imageAssetId: true } })
  const src = bestSourceUrl(ev?.imageUrl)
  if (!ev || !src) {
    if (ev?.imageAssetId) await prisma.event.update({ where: { id: eventId }, data: { imageAssetId: null } })
    return null
  }
  const id = assetIdFor(src)
  await prisma.imageAsset.upsert({ where: { id }, create: { id, sourceUrl: src }, update: {} })
  if (ev.imageAssetId !== id || ev.imageUrl !== src) {
    await prisma.event.update({ where: { id: eventId }, data: { imageAssetId: id, imageUrl: src } })
  }
  return id
}

/** Links upcoming events that have an image URL but no asset yet (grouped by URL, cheap). */
async function linkPending(max = 1500): Promise<number> {
  const rows = await prisma.event.findMany({
    where: { date: { gte: sydneyToday() }, duplicateOfId: null, imageUrl: { not: null }, imageAssetId: null },
    select: { id: true, imageUrl: true },
    take: max,
  })
  const byUrl = new Map<string, string[]>()
  for (const r of rows) {
    const src = bestSourceUrl(r.imageUrl)
    if (!src) continue
    byUrl.set(src, [...(byUrl.get(src) ?? []), r.id])
  }
  const entries = [...byUrl.entries()]
  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200)
    await prisma.imageAsset.createMany({ data: chunk.map(([src]) => ({ id: assetIdFor(src), sourceUrl: src })), skipDuplicates: true })
  }
  for (const [src, ids] of entries) {
    await prisma.event.updateMany({ where: { id: { in: ids } }, data: { imageAssetId: assetIdFor(src), imageUrl: src } })
  }
  // VibePeep Local: organiser-uploaded photos go through the same pipeline
  const local = await prisma.localListing.findMany({
    where: { imagePath: { not: null }, imageAssetId: null, expiresAt: { gte: new Date() } },
    select: { id: true }, take: 300,
  })
  for (const l of local) await linkLocalImage(l.id)
  return rows.length + local.length
}

/** Points an VibePeep Local listing at the ImageAsset for its uploaded photo, creating the asset if needed. */
export async function linkLocalImage(listingId: string): Promise<string | null> {
  const l = await prisma.localListing.findUnique({ where: { id: listingId }, select: { imagePath: true, imageAssetId: true } })
  if (!l?.imagePath) {
    if (l?.imageAssetId) await prisma.localListing.update({ where: { id: listingId }, data: { imageAssetId: null } })
    return null
  }
  const src = publicUrl(l.imagePath)
  const id = assetIdFor(src)
  await prisma.imageAsset.upsert({ where: { id }, create: { id, sourceUrl: src }, update: {} })
  if (l.imageAssetId !== id) await prisma.localListing.update({ where: { id: listingId }, data: { imageAssetId: id } })
  return id
}

let running: Promise<unknown> | null = null

/**
 * Asynchronous image pass: links new images, processes pending ones (soonest events first),
 * retries failures and re-checks old artwork for updates. Never throws; safe to fire-and-forget.
 */
export function runImagePass(opts: { limit?: number; trigger?: string; budgetMs?: number; concurrency?: number } = {}) {
  if (running) return running
  const limit = opts.limit ?? 300
  const deadline = Date.now() + (opts.budgetMs ?? 8 * 60 * 1000)
  running = (async () => {
    const sharp = await loadSharp()
    const run = await prisma.imageRun.create({ data: { trigger: opts.trigger ?? 'refresh' } })
    const counts: Record<Outcome, number> = { ok: 0, enhanced: 0, rejected: 0, review: 0, failed: 0, cached: 0, unchanged: 0 }
    const errors: string[] = []
    try {
      await discoverMissingImages({ budgetMs: Math.min(3 * 60 * 1000, Math.max(0, deadline - Date.now()) / 3) }).catch((e) => errors.push(`page lookup: ${e?.message}`))
      await linkPending()
      if (!sharp) throw new Error('image processor unavailable on this server - source images are served as-is')
      const retryBefore = new Date(Date.now() - 6 * 3600 * 1000)
      const recheckBefore = new Date(Date.now() - RECHECK_DAYS * 86400 * 1000)
      const today = sydneyToday()
      // Soonest upcoming events first so what people see now gets done first
      const queue = await prisma.imageAsset.findMany({
        where: {
          AND: [
            { OR: [
              { events: { some: { date: { gte: today }, duplicateOfId: null } } },
              { localListings: { some: { expiresAt: { gte: new Date() } } } },
            ] },
            { OR: [
              { status: 'PENDING' },
              { status: 'FAILED', attempts: { lt: MAX_ATTEMPTS }, updatedAt: { lt: retryBefore } },
            ] },
          ],
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: limit,
      })
      const recheck = queue.length < limit
        ? await prisma.imageAsset.findMany({
          where: { processedAt: { not: null }, checkedAt: { lt: recheckBefore }, events: { some: { date: { gte: today } } } },
          select: { id: true }, orderBy: { checkedAt: 'asc' }, take: Math.min(30, limit - queue.length),
        })
        : []
      const ids = [...queue, ...recheck].map((a) => a.id)
      let next = 0
      const worker = async () => {
        while (next < ids.length && Date.now() < deadline) {
          const id = ids[next++]
          const r = await processAsset(id).catch((e: any) => ({ outcome: 'failed' as Outcome, note: e?.message }))
          counts[r.outcome]++
          if (r.outcome === 'failed' && r.note && errors.length < 20) errors.push(`${id.slice(0, 8)}: ${r.note}`)
        }
      }
      await Promise.all(Array.from({ length: opts.concurrency ?? 3 }, worker))
    } catch (e: any) {
      errors.push(e?.message ?? 'image pass failed')
      console.error('[images] pass failed:', e?.message)
    }
    const processed = Object.values(counts).reduce((a, b) => a + b, 0)
    await prisma.imageRun.update({
      where: { id: run.id },
      data: { endedAt: new Date(), processed, ...counts, costUsd: 0, errors: errors.length ? errors.join('\n') : null },
    }).catch(() => {})
    console.log(`[images] pass done: ${processed} processed`, counts)
    return { processed, counts, errors }
  })().finally(() => { running = null })
  return running
}

/** Kicks off processing for one event without blocking the caller (e.g. a promoter submission). */
export function queueEventImage(eventId: string) {
  linkEventImage(eventId)
    .then((id) => (id ? processAsset(id) : null))
    .catch((e) => console.error('[images] queue failed:', e?.message))
}

/** Same for an VibePeep Local listing photo. */
export function queueLocalImage(listingId: string) {
  linkLocalImage(listingId)
    .then((id) => (id ? processAsset(id) : null))
    .catch((e) => console.error('[images] local queue failed:', e?.message))
}
