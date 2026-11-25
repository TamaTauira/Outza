/**
 * Count listings whose category or sub-tags the current classifier would change.
 * Read only. It does not update rows.
 *
 *   npx tsx --require dotenv/config scripts/dry-run-category-relabel.ts
 */
import { prisma } from '@/lib/db'
import { refineStoredCategory } from '@/lib/categories'

const DARTS = /\bdarts?\b/i

async function main() {
  const rows = await prisma.event.findMany({
    where: {
      duplicateOfId: null,
      OR: [
        { subTags: { has: 'Running' } },
        { title: { contains: 'dart', mode: 'insensitive' } },
        { description: { contains: 'darts', mode: 'insensitive' } },
      ],
    },
    select: { title: true, description: true, category: true, subTags: true, source: true },
  })

  let changed = 0
  let droppedRunning = 0
  let dartsExamined = 0
  let dartsWouldDropRunning = 0
  const bySource: Record<string, number> = {}

  for (const row of rows) {
    const text = `${row.title} ${row.description ?? ''}`
    const darts = DARTS.test(text)
    if (darts) dartsExamined++
    const next = refineStoredCategory(row)
    if (!next) continue
    const sameCategory = next.category === row.category
    const sameTags = next.subTags.join('|') === [...row.subTags].join('|')
    if (sameCategory && sameTags) continue
    changed++
    bySource[row.source] = (bySource[row.source] ?? 0) + 1
    const lostRunning = row.subTags.includes('Running') && !next.subTags.includes('Running')
    if (lostRunning) droppedRunning++
    if (darts && lostRunning) dartsWouldDropRunning++
  }

  console.log(JSON.stringify({
    examined: rows.length,
    wouldChange: changed,
    wouldDropRunning: droppedRunning,
    dartsExamined,
    dartsWouldDropRunning,
    wouldChangeBySource: bySource,
    wrote: 0,
  }, null, 2))
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
