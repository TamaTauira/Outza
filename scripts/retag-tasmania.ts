/**
 * Idempotent repair: Tasmanian venues saved under Perth move to Hobart.
 * A Perth match whose title only names a Tasmanian team is left alone.
 *
 *   npx tsx scripts/retag-tasmania.ts
 * Dry run (no writes): RETAG_DRY=1 npx tsx scripts/retag-tasmania.ts
 */
import { prisma } from '../lib/db'
import { perthMisfileToHobart } from '../lib/tas-retag'

async function main() {
  const dry = process.env.RETAG_DRY === '1'
  const rows = await prisma.event.findMany({
    where: { city: 'Perth' },
    select: { id: true, city: true, title: true, venueName: true, venueAddress: true, latitude: true, longitude: true },
  })
  const hits = rows.filter((r) => perthMisfileToHobart(r))
  console.log(`[retag-tasmania] ${hits.length} Perth rows belong in Tasmania${dry ? ' (dry run)' : ''}`)
  if (!dry && hits.length) {
    const updated = await prisma.event.updateMany({ where: { id: { in: hits.map((h) => h.id) }, city: 'Perth' }, data: { city: 'Hobart' } })
    console.log(`[retag-tasmania] updated ${updated.count}`)
  }
  const again = dry ? hits.length : (await prisma.event.count({ where: { id: { in: hits.map((h) => h.id) }, city: 'Perth' } }))
  if (!dry && again !== 0) throw new Error(`${again} rows still tagged Perth`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
