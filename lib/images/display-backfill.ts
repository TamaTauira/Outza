import type { Prisma } from '@prisma/client'
import { Prisma as PrismaNs } from '@prisma/client'
import { parseDisplayManifest } from './display-spec'

/** One apply pass. Re-run the script to continue; finished rows are left out. */
export const BACKFILL_BATCH = 50

/**
 * Home still requests this Humanitix original at full size because the optimiser
 * passes the PNG through. It stays in the queue even if the date or duplicate
 * rules would leave it out.
 */
export const HOME_PASSTHROUGH_HANDLE = '560de414-7075-47ee-968d-354c90a1c51c'

export interface BackfillArgs {
  apply: boolean
  batch: number
}

export function parseBackfillArgs(argv: string[]): BackfillArgs {
  let batch = BACKFILL_BATCH
  const at = argv.indexOf('--batch')
  if (at >= 0) {
    const n = Number(argv[at + 1])
    if (Number.isFinite(n) && n >= 1 && n <= 200) batch = Math.floor(n)
  }
  return { apply: argv.includes('--apply'), batch }
}

export function displayIsReady(row: { imageWidth?: number | null; imageDisplay?: unknown }): boolean {
  const manifest = parseDisplayManifest(row.imageDisplay)
  return !!row.imageWidth && !!manifest && !manifest.pending && !manifest.failed && !!manifest.base && (manifest.widths?.length ?? 0) > 0
}

export function isHomePassthrough(url: string | null | undefined): boolean {
  return !!url && url.includes(HOME_PASSTHROUGH_HANDLE)
}

/** True when this row still needs a derivative and this run should try it. */
export function shouldBackfill(row: {
  imageUrl?: string | null
  imageWidth?: number | null
  imageDisplay?: unknown
  duplicateOfId?: string | null
  date?: Date | null
}, today: Date): boolean {
  if (!row.imageUrl || displayIsReady(row)) return false
  const manifest = parseDisplayManifest(row.imageDisplay)
  if (manifest?.failed) return false
  if (isHomePassthrough(row.imageUrl)) return true
  return !row.duplicateOfId && !!row.date && row.date >= today
}

/** Upcoming originals, plus the home Humanitix PNG wherever it sits. Failed tries stay out. */
export function backfillWhere(today: Date): Prisma.EventWhereInput {
  const stillOpen = {
    imageUrl: { not: null },
    imageWidth: null,
    OR: [
      { imageDisplay: { equals: PrismaNs.DbNull } },
      { NOT: { imageDisplay: { path: ['failed'], equals: true } } },
    ],
  }
  return {
    AND: [
      stillOpen,
      {
        OR: [
          { duplicateOfId: null, date: { gte: today } },
          { imageUrl: { contains: HOME_PASSTHROUGH_HANDLE } },
        ],
      },
    ],
  }
}
