/**
 * One-off: move existing Music rows whose titles are comedy, theatre, circus,
 * cabaret, burlesque or improv to Arts & Culture.
 *
 * Updates category and subTags only. Never deletes. Skips rows an organiser has edited
 * (organiserEditedAt). Dry run unless --apply is passed.
 *
 *   yarn tsx scripts/reclassify-arts.ts
 *   yarn tsx scripts/reclassify-arts.ts --apply
 *
 * Needs DATABASE_URL. Preview and production share one database, so read the dry-run
 * list before applying. This script is not part of the running app.
 */
import { PrismaClient } from '@prisma/client'
import { artsCategoryForMisfiledMusic } from '../lib/categories'

const apply = process.argv.includes('--apply')
const prisma = new PrismaClient()

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. No rows were read or updated.')
    process.exit(1)
  }

  let scanned = 0
  let matched = 0
  let skippedOrganiser = 0
  let updated = 0
  const samples: string[] = []
  let cursor: string | undefined

  for (;;) {
    const rows = await prisma.event.findMany({
      where: { category: 'Music' },
      select: { id: true, title: true, description: true, subTags: true, organiserEditedAt: true },
      orderBy: { id: 'asc' },
      take: 200,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    if (!rows.length) break
    cursor = rows[rows.length - 1]!.id

    for (const row of rows) {
      scanned++
      const next = artsCategoryForMisfiledMusic(row.title, row.description)
      if (!next) continue
      matched++
      if (row.organiserEditedAt) {
        skippedOrganiser++
        continue
      }
      if (samples.length < 20) samples.push(row.title)
      if (!apply) {
        updated++
        continue
      }
      const result = await prisma.event.updateMany({
        where: { id: row.id, category: 'Music', organiserEditedAt: null },
        data: { category: next.category, subTags: next.subTags },
      })
      updated += result.count
      if (result.count === 0) skippedOrganiser++
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scanned,
    matched,
    skippedOrganiser,
    wouldUpdate: apply ? undefined : updated,
    updated: apply ? updated : undefined,
    samples,
  }, null, 2))
  if (!apply) console.log('Dry run only. Re-run with --apply to write. Nothing was deleted.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
