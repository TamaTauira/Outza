/**
 * Fill in full descriptions for listings that only kept a strapline or teaser.
 * Dry-run is the default and writes nothing.
 *
 *   npx tsx scripts/backfill-descriptions.ts
 *   npx tsx scripts/backfill-descriptions.ts --apply
 *   npx tsx scripts/backfill-descriptions.ts --apply --source=cityofsydney
 *
 * Needs DATABASE_URL. Safe to run again.
 */
import { prisma } from '../lib/db'
import { runDescriptionBackfill } from '../lib/description-backfill'

async function main() {
  const apply = process.argv.includes('--apply')
  const sourceArg = process.argv.find((arg) => arg.startsWith('--source='))
  const sources = sourceArg ? sourceArg.slice('--source='.length).split(',').map((item) => item.trim()).filter(Boolean) : undefined
  const report = await runDescriptionBackfill({ apply, sources })
  console.log(JSON.stringify(report, null, 2))
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
