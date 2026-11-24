/**
 * Dry-run report for event image derivatives.
 *
 * Counts upcoming events that still have only the original image URL, and
 * estimates storage for 480/960/1440 AVIF + WebP. It does not download images,
 * upload files, or update rows.
 *
 * This is a production data change if anyone later applies it. Do not run an
 * apply step until Tama has approved it against a Neon snapshot.
 *
 *   DATABASE_URL=... npx tsx scripts/backfill-event-display.ts
 *
 * The report time is Australia/Sydney.
 */
import { prisma } from '../lib/prisma'
import { estimateDisplayStorage } from '../lib/images/display-spec'

function sydneyNow(): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date())
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function main() {
  if (process.argv.includes('--apply')) {
    console.error('This script is dry-run only. It cannot update production rows.')
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL to the database you want to count. Nothing is written.')
    process.exit(1)
  }

  const today = new Date()
  const upcoming = { date: { gte: today }, duplicateOfId: null, imageUrl: { not: null } }
  const [withImage, ready, pending] = await Promise.all([
    prisma.event.count({ where: upcoming }),
    prisma.event.count({ where: { ...upcoming, imageWidth: { not: null } } }),
    prisma.event.count({ where: { ...upcoming, imageDisplay: { path: ['pending'], equals: true } } }),
  ])
  const distinctRows = await prisma.$queryRaw<[{ n: number }]>`
    SELECT count(DISTINCT "imageUrl")::int AS n
    FROM "Event"
    WHERE "imageUrl" IS NOT NULL
      AND "duplicateOfId" IS NULL
      AND date >= ${today}
      AND "imageWidth" IS NULL
  `
  const remaining = Math.max(0, withImage - ready)
  const unique = Number(distinctRows[0]?.n ?? 0)
  const estimate = estimateDisplayStorage(unique)

  console.log(`Event image derivative report (${sydneyNow()})`)
  console.log('Dry run. No downloads, no uploads, no row updates.')
  console.log(`Upcoming events with an image: ${withImage}`)
  console.log(`Already resized (imageWidth set): ${ready}`)
  console.log(`Marked pending by a new ingest: ${pending}`)
  console.log(`Still on the original URL: ${remaining}`)
  console.log(`Distinct original URLs still to resize: ${unique}`)
  console.log(`Estimated files: ${estimate.files} (up to 3 widths × AVIF + WebP)`)
  console.log(`Estimated storage: ${mb(estimate.bytes)} (${estimate.bytes} bytes)`)
  console.log('Applying this needs a Neon snapshot and Tama’s approval. This script will not do it.')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
  })
