/**
 * Dry run only. Lists Local listings whose picture would be replaced by the
 * source-page image (og:image or a Humanitix bannerImage).
 * Does not write to the database.
 *
 *   yarn tsx --require dotenv/config scripts/dry-run-local-images.ts
 *   yarn tsx --require dotenv/config scripts/dry-run-local-images.ts --limit 20
 *
 * Do not run scripts/backfill-local-images.ts until Tama approves a write.
 */
import { prisma } from '@/lib/db'
import { imageWillExpire, usableSourceImage } from '@/lib/local-images'

const limitArg = process.argv.find((arg) => arg.startsWith('--limit'))
const limit = Number(process.argv[process.argv.indexOf('--limit') + 1] || (limitArg?.split('=')[1]) || 50)

async function main() {
  const rows = await prisma.localListing.findMany({
    where: { status: 'APPROVED', duplicateOfId: null, expiresAt: { gte: new Date() }, imagePath: null },
    select: { id: true, title: true, websiteUrl: true, sourceImageUrl: true },
    take: Math.min(Math.max(limit, 1), 500),
  })
  const report = rows.map((row) => {
    const current = usableSourceImage(row.sourceImageUrl)
    const page = row.websiteUrl?.trim() || ''
    let action = 'keep'
    if (!page) action = 'no-page'
    else if (!current || imageWillExpire(current)) action = 'would-fetch-page-image'
    else action = 'already-has-source-image'
    return { id: row.id, title: row.title, page: page || null, action }
  })
  const counts = report.reduce<Record<string, number>>((acc, row) => {
    acc[row.action] = (acc[row.action] ?? 0) + 1
    return acc
  }, {})
  console.log(JSON.stringify({ dryRun: true, writes: 0, scanned: rows.length, counts, rows: report }, null, 2))
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
