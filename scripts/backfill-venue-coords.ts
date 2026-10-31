/**
 * Re-check every open "Missing venue coordinates" notice.
 * Listings that state a street address are pinned and those notices are closed.
 *
 *   npx tsx scripts/backfill-venue-coords.ts
 *
 * Needs DATABASE_URL. Prints checked, fixed, genuinelyMissing and fetchFailed.
 */
import { prisma } from '../lib/db'
import { recoverMissingVenueCoordinates } from '../lib/venue-coords'

async function main() {
  const report = await recoverMissingVenueCoordinates()
  const summary = {
    checked: report.checked,
    fixed: report.fixed,
    genuinelyMissing: report.genuinelyMissing,
    fetchFailed: report.fetchFailed,
    onlineOrTba: report.onlineOrTba,
    unplaced: report.unplaced,
    noLink: report.noLink,
  }
  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
