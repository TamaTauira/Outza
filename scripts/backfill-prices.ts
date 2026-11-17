/**
 * Walk every listing that still has no price.
 * Safe to stop and run again: a finished lookup is not repeated for a week,
 * and a price that is already stored is left alone.
 */
import { countUnknownPrices, runPriceEnrich } from '../lib/price-enrich'
import { runWithJobPrisma } from '../lib/prisma'

const wallMs = 70 * 60 * 1000

async function main() {
  const started = Date.now()
  const before = await runWithJobPrisma(() => countUnknownPrices())
  console.log(`[price-backfill] before upcoming=${before.upcoming} total=${before.total}`)
  let rounds = 0
  while (Date.now() - started < wallMs) {
    const left = wallMs - (Date.now() - started)
    if (left < 8_000) break
    const report = await runWithJobPrisma(() => runPriceEnrich({ budgetMs: Math.min(180_000, left) }))
    rounds += 1
    console.log(`[price-backfill] round ${rounds} ${JSON.stringify({ checked: report.checked, priced: report.priced, free: report.free, reasons: report.reasons, examples: report.examples, upcomingUnknown: report.upcomingUnknown, totalUnknown: report.totalUnknown, more: report.more })}`)
    if (report.checked === 0) break
  }
  const after = await runWithJobPrisma(() => countUnknownPrices())
  console.log(`[price-backfill] after upcoming=${after.upcoming} total=${after.total} rounds=${rounds}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
