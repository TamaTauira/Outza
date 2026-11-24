/**
 * Read-only report of what the auto-resolver would do with the trust backlog.
 *
 * It does not update rows, send mail, call the model, or geocode.
 * Do not point it at production until a Neon snapshot exists and the report
 * has been accepted in chat. See docs/ops.md.
 *
 *   OPS_BACKLOG_DRYRUN=report npx tsx scripts/ops-backlog-dryrun.ts
 */
import { prisma } from '@/lib/db'
import { duplicatePrimaryId } from '@/lib/trust-queue'
import { placeFromText } from '@/lib/venue-place'
import {
  ruleDuplicateFlagged,
  ruleDuplicateReview,
  ruleExpiredHidden,
  ruleHeldEvent,
  ruleMissingCoords,
  ruleTimeConflict,
} from '@/lib/ops/rules'
import type { Ruling } from '@/lib/ops/types'

const PROD_BRANCH = 'br-polished-brook-a7bed0u2'
const SAMPLE = 30

function refuseProd() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url) {
    console.error('DATABASE_URL is not set. This script only reads.')
    process.exit(1)
  }
  if (process.env.OPS_BACKLOG_DRYRUN !== 'report') {
    console.error('Refusing to run. Set OPS_BACKLOG_DRYRUN=report. See docs/ops.md.')
    process.exit(1)
  }
  const prod = url.includes(PROD_BRANCH) || url.includes('polished-brook')
  if (prod && process.env.OPS_BACKLOG_DRYRUN_PROD !== '1') {
    console.error('Refusing to read production. Take a Neon snapshot, then set OPS_BACKLOG_DRYRUN_PROD=1.')
    process.exit(1)
  }
  if (prod) console.log('Reading production. This process will not write.')
}

function label(ruling: Ruling): string {
  if (ruling.outcome === 'act') return ruling.action
  if (ruling.outcome === 'digest') return 'weekly-digest'
  return 'retry-later'
}

type Bucket = { count: number; samples: string[] }

function note(buckets: Map<string, Bucket>, key: string, sample: string) {
  const row = buckets.get(key) ?? { count: 0, samples: [] }
  row.count += 1
  if (row.samples.length < SAMPLE) row.samples.push(sample)
  buckets.set(key, row)
}

function printBuckets(title: string, buckets: Map<string, Bucket>) {
  console.log(`\n${title}`)
  const keys = [...buckets.keys()].sort()
  if (!keys.length) {
    console.log('  none')
    return
  }
  for (const key of keys) {
    const row = buckets.get(key)!
    console.log(`  ${key}: ${row.count}`)
    for (const sample of row.samples) console.log(`    - ${sample}`)
  }
}

async function main() {
  refuseProd()
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const audits = new Map<string, Bucket>()
  const flags = await prisma.qualityAudit.groupBy({
    by: ['action'],
    where: { status: 'OPEN' },
    _count: { _all: true },
  })
  console.log('Open quality flags')
  for (const row of flags) console.log(`  ${row.action}: ${row._count._all}`)

  const open = await prisma.qualityAudit.findMany({
    where: { status: 'OPEN', action: { in: ['EXPIRED_HIDDEN', 'MISSING_COORDS', 'TIME_CONFLICT', 'DUPLICATE_FLAGGED', 'DUPLICATE_REVIEW'] } },
    select: { id: true, action: true, detail: true, eventId: true },
  })
  for (const row of open) {
    const event = row.eventId
      ? await prisma.event.findUnique({
        where: { id: row.eventId },
        select: {
          title: true, date: true, venueName: true, venueAddress: true, suburb: true, city: true,
          latitude: true, longitude: true, ticketUrl: true, organiserUrl: true, source: true, sources: true,
          promoterId: true, promotions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
        },
      })
      : null
    const title = event?.title ?? row.detail?.slice(0, 80) ?? row.id
    let ruling: Ruling
    if (row.action === 'EXPIRED_HIDDEN') ruling = ruleExpiredHidden({ past: !event || event.date < today })
    else if (row.action === 'MISSING_COORDS' && event) {
      const place = placeFromText(event)
      const centroid = place.lat != null && place.lng != null
      note(audits, centroid ? 'MISSING_COORDS would-geocode-then-centroid' : 'MISSING_COORDS would-geocode-then-digest', title)
      continue
    } else if (row.action === 'TIME_CONFLICT') {
      ruling = ruleTimeConflict({
        kind: /outside .* hours/i.test(row.detail ?? '') ? 'hours' : 'sources',
        ticketUrl: event?.ticketUrl,
        organiserUrl: event?.organiserUrl,
        sources: (event?.sources ?? [event?.source].filter(Boolean) as string[]).map((source) => ({ source, refreshedAt: null })),
      })
    } else if (row.action === 'DUPLICATE_FLAGGED' && event) {
      const primaryId = duplicatePrimaryId(row.detail)
      const primary = primaryId
        ? await prisma.event.findUnique({ where: { id: primaryId }, select: { promoterId: true, promotions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 } } })
        : null
      ruling = ruleDuplicateFlagged({
        primaryPromoted: !!(primary?.promoterId || primary?.promotions.length),
        otherPromoted: !!(event.promoterId || event.promotions.length),
      })
    } else if (row.action === 'DUPLICATE_REVIEW') {
      ruling = ruleDuplicateReview({ score: null })
      note(audits, 'DUPLICATE_REVIEW would-ask-model', title)
      continue
    } else {
      continue
    }
    note(audits, `${row.action} ${label(ruling)}`, title)
  }
  printBuckets('What the rules would do (no model, no geocode)', audits)

  const heldRows = await prisma.event.findMany({
    where: { moderationStatus: 'review' },
    select: { title: true, description: true, date: true, source: true },
  })
  const held = new Map<string, Bucket>()
  for (const row of heldRows) {
    const ruling = ruleHeldEvent({ title: row.title, description: row.description, past: row.date < today })
    note(held, `${label(ruling)} · ${row.source}`, row.title)
  }
  console.log(`\nHeld listings in review: ${heldRows.length}`)
  printBuckets('Held listings', held)
  console.log('\nDry run finished. No rows were updated.')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
