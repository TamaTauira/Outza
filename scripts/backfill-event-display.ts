/**
 * Resize upcoming event images to the same 480/960/1440 AVIF and WebP files
 * ingest writes, on the same object store. The original imageUrl is never
 * changed or removed.
 *
 * Default is a count. Nothing is downloaded or written.
 *
 *   DATABASE_URL=... npx tsx scripts/backfill-event-display.ts
 *
 * Apply, in batches of 50. Stop it and run it again: finished rows are skipped.
 * Take a Neon snapshot first. This needs the same store env ingest uses.
 *
 *   DATABASE_URL=... \
 *   AWS_REGION=... \
 *   AWS_BUCKET_NAME=... \
 *   AWS_FOLDER_PREFIX=... \
 *   AWS_ACCESS_KEY_ID=... \
 *   AWS_SECRET_ACCESS_KEY=... \
 *   npx tsx scripts/backfill-event-display.ts --apply
 *
 * Optional: --batch 50 (1–200).
 * Times are Australia/Sydney.
 */
import { prisma } from '../lib/prisma'
import { estimateDisplayStorage } from '../lib/images/display-spec'
import { prepareEventDisplay } from '../lib/images/display-store'
import {
  HOME_PASSTHROUGH_HANDLE,
  backfillWhere,
  parseBackfillArgs,
  shouldBackfill,
} from '../lib/images/display-backfill'

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

async function report(today: Date) {
  const where = backfillWhere(today)
  const [queued, passthrough] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.count({ where: { AND: [where, { imageUrl: { contains: HOME_PASSTHROUGH_HANDLE } }] } }),
  ])
  const distinctRows = await prisma.$queryRaw<[{ n: number }]>`
    SELECT count(DISTINCT "imageUrl")::int AS n
    FROM "Event"
    WHERE "imageUrl" IS NOT NULL
      AND "imageWidth" IS NULL
      AND (
        "imageDisplay" IS NULL
        OR COALESCE("imageDisplay"->>'failed', '') <> 'true'
      )
      AND (
        ("duplicateOfId" IS NULL AND date >= ${today})
        OR "imageUrl" LIKE ${'%' + HOME_PASSTHROUGH_HANDLE + '%'}
      )
  `
  const unique = Number(distinctRows[0]?.n ?? 0)
  const estimate = estimateDisplayStorage(unique)
  console.log(`Event image derivative report (${sydneyNow()})`)
  console.log('Count only. No downloads, no uploads, no row updates.')
  console.log(`Rows still to resize: ${queued}`)
  console.log(`Distinct original URLs: ${unique}`)
  console.log(`Home Humanitix PNG rows still missing a derivative: ${passthrough} (${HOME_PASSTHROUGH_HANDLE})`)
  console.log(`Estimated files: ${estimate.files} (up to 3 widths × AVIF + WebP)`)
  console.log(`Estimated storage: ${mb(estimate.bytes)} (${estimate.bytes} bytes)`)
  console.log('Add --apply to write derivatives in batches of 50. The original image URL is kept.')
}

async function apply(today: Date, batch: number) {
  if (!process.env.AWS_BUCKET_NAME || !process.env.AWS_REGION) {
    console.error('Set AWS_REGION and AWS_BUCKET_NAME (and AWS_FOLDER_PREFIX plus AWS credentials) so files land in the same store as ingest.')
    process.exit(1)
  }
  let stored = 0
  let skipped = 0
  let failed = 0
  let batches = 0
  const failedIds: string[] = []
  for (;;) {
    const rows = await prisma.event.findMany({
      where: backfillWhere(today),
      select: { id: true, imageUrl: true, imageWidth: true, imageDisplay: true, duplicateOfId: true, date: true },
      orderBy: { id: 'asc' },
      take: batch,
    })
    const todo = rows.filter((row) => shouldBackfill(row, today))
    if (!todo.length) break
    batches += 1
    console.log(`Batch ${batches}: ${todo.length} rows (${sydneyNow()})`)
    for (const row of todo) {
      const outcome = await prepareEventDisplay(row.id, { force: true, evenIfLocked: true })
      if (outcome === 'stored') stored += 1
      else if (outcome === 'failed') {
        failed += 1
        failedIds.push(row.id)
      } else skipped += 1
      let host = ''
      try { host = row.imageUrl ? new URL(row.imageUrl).hostname : '' } catch { host = '' }
      console.log(`  ${row.id} ${outcome} ${host}`)
    }
  }
  const remaining = await prisma.event.count({ where: backfillWhere(today) })
  console.log(`Backfill finished (${sydneyNow()})`)
  console.log(`Batches: ${batches}`)
  console.log(`Stored: ${stored}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Failed: ${failed}`)
  console.log(`Still queued: ${remaining}`)
  if (failedIds.length) console.log(`Failed ids: ${failedIds.join(', ')}`)
  console.log('Original image URLs were not changed.')
}

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2))
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL. Without --apply this only counts.')
    process.exit(1)
  }
  const today = new Date()
  if (!args.apply) {
    await report(today)
    return
  }
  await apply(today, args.batch)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
  })
