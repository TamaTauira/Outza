/**
 * Copies source pictures onto Local listings that have no organiser upload.
 * Updates image URLs only: LocalListing.sourceImageUrl, and Event.imageUrl when that row has none.
 * Run after the sourceImageUrl column exists: yarn tsx --require dotenv/config scripts/backfill-local-images.ts
 */
import { prisma } from '@/lib/db'
import { imageFromListingPage, imageWillExpire, usableSourceImage } from '@/lib/local-images'

const LIVE = { status: 'APPROVED' as const, duplicateOfId: null, expiresAt: { gte: new Date() }, imagePath: null }

async function main() {
  const rows = await prisma.localListing.findMany({
    where: LIVE,
    select: { id: true, title: true, websiteUrl: true, sourceImageUrl: true },
  })
  const byPage = new Map<string, string[]>()
  let already = 0
  let noPage = 0
  for (const row of rows) {
    const current = usableSourceImage(row.sourceImageUrl)
    if (current && !imageWillExpire(current)) { already += 1; continue }
    const page = row.websiteUrl?.trim()
    if (!page) { noPage += 1; continue }
    byPage.set(page, [...(byPage.get(page) ?? []), row.id])
  }

  let copied = 0
  let fetched = 0
  let missed = 0
  let eventsFilled = 0
  for (const [page, ids] of byPage) {
    const event = await prisma.event.findFirst({
      where: { ticketUrl: page, imageUrl: { not: null } },
      select: { id: true, imageUrl: true },
      orderBy: { updatedAt: 'desc' },
    })
    let image = usableSourceImage(event?.imageUrl)
    if (image && imageWillExpire(image)) image = null
    if (image) copied += ids.length
    else {
      image = usableSourceImage(await imageFromListingPage(page).catch(() => null))
      if (image) fetched += ids.length
      else missed += ids.length
    }
    if (!image) continue
    await prisma.localListing.updateMany({ where: { id: { in: ids }, imagePath: null }, data: { sourceImageUrl: image } })
    if (!event) {
      const blank = await prisma.event.findFirst({ where: { ticketUrl: page, imageUrl: null }, select: { id: true } })
      if (blank) {
        await prisma.event.update({ where: { id: blank.id }, data: { imageUrl: image } })
        eventsFilled += 1
      }
    }
  }

  console.log(JSON.stringify({
    listings: rows.length,
    already,
    noPage,
    pages: byPage.size,
    copiedFromEvents: copied,
    fetchedFromPages: fetched,
    stillMissing: missed,
    eventsFilled,
  }))
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
