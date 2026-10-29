// Resume TRA, pedestrian and Destination NSW imports until each one finishes.
// A local run uses a long deadline. Cron still stops inside the 300s function limit.
import { runSource } from '../lib/intel/ingest'
import type { SourceKey } from '../lib/intel/sources'

const keys: SourceKey[] = ['tra', 'footfall', 'dnsw']

async function main() {
  for (const key of keys) {
    for (let pass = 1; pass <= 40; pass++) {
      const result = await runSource(key, 'admin', Date.now() + 12 * 60_000)
      const message = 'message' in result ? result.message : ''
      console.log(`[${key}] pass ${pass}: ${result.status}${message ? ` — ${message}` : ''}`)
      if (result.status !== 'partial') break
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
