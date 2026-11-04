/**
 * Fill blank price, times and other gaps on canonical listings from linked sources.
 * Dry-run is the default and writes nothing.
 *
 *   npx tsx scripts/backfill-linked-fields.ts
 *   npx tsx scripts/backfill-linked-fields.ts --apply
 *
 * Needs DATABASE_URL. Apply prisma/sql/20261104_linked_fill.sql first so the
 * event page can say which source filled each field. Without that column the
 * field copy still runs; the extra sentence is skipped until the column exists.
 */
import { jobPrisma, prisma, runWithJobPrisma } from '../lib/db'
import { runLinkedFill } from '../lib/linked-fill-run'

async function main() {
  const apply = process.argv.includes('--apply')
  const report = await runWithJobPrisma(() => runLinkedFill({ dryRun: !apply }))
  console.log(JSON.stringify(report, null, 2))
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(async () => {
    await jobPrisma.$disconnect()
    await prisma.$disconnect()
  })
