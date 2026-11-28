/**
 * Retire listings whose occurrence has vanished from its source.
 *
 * A source's listings are only ever judged against a COMPLETED sweep: a run
 * that finished the whole catalogue with no hard failure, no time-budget
 * stop and no chunks left over. Anything less proves nothing, because the
 * Eventbrite page wall and the Moshtix budget stop both truncate coverage.
 * Sweep completion is read back from the refresh log ledger (the same rows
 * the volume health checks read), never from a run's own say-so.
 *
 * An event is soft-hidden (Event.deletedAt, the schema's soft-delete) only
 * when EVERY source record it has was missed by two consecutive completed
 * sweeps of that record's source. It restores automatically when a sweep
 * sees it again. Nothing is ever deleted, and a hide is always reversible.
 * Hides are marked with a SOURCE_RETIRED audit row so this mechanism never
 * resurrects a listing an admin soft-deleted by hand.
 *
 * Two guards keep a broken feed from retiring a healthy catalogue:
 * - A sweep that misses an implausible share of a source's catalogue is
 *   suspicious. While a source is suspicious, its latest miss does not
 *   count toward the two-miss rule and every hide it would have caused is
 *   held, with an OPEN audit for admins. A persistently broken feed is
 *   suspicious on every pass, so it can never mass-hide, no matter how
 *   often it repeats.
 * - Restore only lifts a soft-delete this mechanism itself set. No admin
 *   code path in the repo writes Event.deletedAt (admins moderate via
 *   `hidden`/`moderationStatus`), so a manual delete can only be made
 *   out-of-band; the mechanism recognises its own delete by timestamp —
 *   the SOURCE_RETIRED audit is written in the same transaction, moments
 *   after deletedAt. A deletedAt later than that audit belongs to someone
 *   else and is never auto-lifted.
 */
import { prisma } from '@/lib/prisma'
import { sourceLogStatus } from '@/lib/refresh-plan'
import { sweepRunFromLog, type SweepRun } from '@/lib/source-health'
import { toSydneyParts } from '@/lib/event-store-parts'

export const RETIREMENT_PASS_BUDGET_MS = 30_000
/** Misses by one source in one sweep beyond both bounds look like a broken sweep, not a vanishing catalogue. */
export const SUSPICIOUS_MISS_SHARE = 0.3
export const SUSPICIOUS_MISS_MIN = 10
/** Consecutive completed sweeps that must miss a record before it can hide its event. */
export const MISSES_BEFORE_HIDE = 2
/**
 * How far after its SOURCE_RETIRED audit a deletedAt may sit and still be
 * the mechanism's own delete. The hide writes deletedAt and its audit in
 * one transaction, so the two are moments apart; a manual re-delete lands
 * far later than this.
 */
export const DELETE_AUTHORSHIP_TOLERANCE_MS = 60_000
const LOG_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const LOG_TAKE = 80
const HIDE_CAP = 300

/** Refresh display name → the source key its SourceRecords carry. Mirrors the fetchers in lib/refresh.ts. */
export const RETIREMENT_SOURCES: { name: string; key: string }[] = [
  { name: 'Ticketmaster', key: 'ticketmaster' },
  { name: 'Frontier Touring', key: 'frontier' },
  { name: 'City of Sydney', key: 'cityofsydney' },
  { name: 'Humanitix', key: 'humanitix' },
  { name: 'Moshtix', key: 'moshtix' },
  { name: 'Oztix', key: 'oztix' },
  { name: 'Ticketek', key: 'ticketek' },
  { name: 'Eventbrite', key: 'eventbrite' },
  { name: 'Popular regulars', key: 'curated' },
  { name: 'Brisbane City Council', key: 'brisbanecouncil' },
]

export type SweepLog = {
  startedAt: Date
  endedAt: Date | null
  eventsAdded: number
  errors: string | null
}

export type CompletedSweep = {
  /** When the sweep's first chunk started. Records seen at or after this were seen by the sweep. */
  startedAt: number
  /** When the finishing chunk ended. */
  endedAt: number
  chunks: number
  events: number
}

type Run = SweepRun & { startedMs: number; endedMs: number; events: number }

/**
 * Whether `older` belongs to the chain that `head` finishes. Mirrors the
 * chain rules in source-health's sweep sums: chunks that share a sweep id
 * are one pass, and one unmarked starter may predate sweep marks.
 */
function chainAccepts(head: Run, older: Run): boolean {
  if (head.sweepId) {
    if (older.sweepId) return older.sweepId === head.sweepId
    return older.unmarked && !older.continuation
  }
  if (older.sweepId) return false
  return true
}

/**
 * The most recent completed sweeps in a source's log history, newest first.
 * A sweep is completed when its finishing run reports no more chunks, no
 * hard failure and no time-budget stop, and every chunk in its chain is
 * equally clean. A chain that cannot be traced back to its first chunk, or
 * that contains a failed or timed-out chunk, is not a completed sweep: an
 * ingest outage must never retire the catalogue.
 */
export function completedSweeps(logs: SweepLog[], limit = 2): CompletedSweep[] {
  const runs: Run[] = logs
    .filter((log) => log.endedAt != null)
    .map((log) => ({
      ...sweepRunFromLog(log.eventsAdded, log.errors),
      startedMs: log.startedAt.getTime(),
      endedMs: (log.endedAt as Date).getTime(),
      events: log.eventsAdded,
    }))
    .sort((a, b) => b.startedMs - a.startedMs)
  const sweeps: CompletedSweep[] = []
  let i = 0
  while (i < runs.length && sweeps.length < limit) {
    const head = runs[i]
    if (head.more || head.failed || head.timedOut) {
      i++
      continue
    }
    if (!head.continuation) {
      sweeps.push({ startedAt: head.startedMs, endedAt: head.endedMs, chunks: 1, events: head.events })
      i++
      continue
    }
    // A finishing continuation: walk its chain back to the chunk that started it.
    const members: Run[] = [head]
    let starter: Run | null = null
    let valid = true
    let consumed = i
    for (let k = i + 1; k < runs.length; k++) {
      const older = runs[k]
      if (!chainAccepts(head, older)) {
        // Not part of this chain. It may still head an older sweep, so the
        // scan resumes at it rather than past it.
        valid = false
        break
      }
      consumed = k
      if (older.failed || older.timedOut) {
        valid = false
        break
      }
      members.push(older)
      if (!older.continuation) {
        starter = older
        break
      }
    }
    if (valid && starter) {
      sweeps.push({
        startedAt: starter.startedMs,
        endedAt: head.endedMs,
        chunks: members.length,
        events: members.reduce((sum, run) => sum + run.events, 0),
      })
    }
    i = consumed + 1
  }
  return sweeps
}

/** Consecutive completed sweeps, counting back from the newest, that did not see this record. */
export function missedSweeps(seenAt: Date | number, sweeps: CompletedSweep[]): number {
  const seen = seenAt instanceof Date ? seenAt.getTime() : seenAt
  let count = 0
  for (const sweep of sweeps) {
    if (seen < sweep.startedAt) count++
    else break
  }
  return count
}

export type RetirementRecordInput = {
  id: string
  eventId: string
  source: string
  seenAt: Date
  missing: boolean
}

export type RetirementEventInput = {
  id: string
  date: Date
  status: string
  deletedAt: Date | null
  duplicateOfId: string | null
  communityKey: string | null
  /** The latest SOURCE_RETIRED / SOURCE_RESTORED audit for this event, if any. */
  retirementAudit: { action: string; createdAt: Date } | null
}

/**
 * Whether the event's current soft-delete is this mechanism's own: the
 * latest retirement audit is its hide, and deletedAt was written by that
 * hide (same transaction — moments before the audit), not re-set by anyone
 * since. A manual restore followed by a manual re-delete leaves deletedAt
 * well after the audit, so the re-delete is never auto-lifted.
 */
export function sweepOwnsCurrentDelete(ev: RetirementEventInput): boolean {
  if (!ev.deletedAt || !ev.retirementAudit) return false
  if (ev.retirementAudit.action !== 'SOURCE_RETIRED') return false
  return ev.deletedAt.getTime() <= ev.retirementAudit.createdAt.getTime() + DELETE_AUTHORSHIP_TOLERANCE_MS
}

export type RetirementPlan = {
  markMissingIds: string[]
  clearMissingIds: string[]
  hideEventIds: string[]
  restoreEventIds: string[]
  /** Source keys whose latest sweep missed an implausible share of their catalogue. Their hides are held. */
  suspiciousSources: string[]
  /** Events that met the hide rule but were held back by a suspicious sweep. */
  heldEventIds: string[]
}

function eventInScope(ev: RetirementEventInput, todayStartMs: number): boolean {
  return (
    ev.duplicateOfId == null &&
    ev.communityKey == null &&
    ev.status !== 'CANCELLED' &&
    ev.date.getTime() >= todayStartMs
  )
}

/**
 * Pure plan over the whole catalogue's source records. `sweepsBySource` only
 * carries sources with at least one completed sweep in the log window; a
 * record whose source has none is left untouched and can neither hide nor
 * restore its event — no history, no judgement.
 */
export function planRetirement(input: {
  sweepsBySource: Record<string, CompletedSweep[]>
  records: RetirementRecordInput[]
  events: RetirementEventInput[]
  todayStart: Date
}): RetirementPlan {
  const todayStartMs = input.todayStart.getTime()
  const eventsById = new Map(input.events.map((ev) => [ev.id, ev]))
  const missesByRecordId = new Map<string, number>()
  const markMissingIds: string[] = []
  const clearMissingIds: string[] = []
  const missedBySource = new Map<string, number>()
  const catalogueBySource = new Map<string, number>()

  for (const record of input.records) {
    const ev = eventsById.get(record.eventId)
    if (!ev || !eventInScope(ev, todayStartMs)) continue
    const sweeps = input.sweepsBySource[record.source]
    if (!sweeps || !sweeps.length) continue
    const misses = missedSweeps(record.seenAt, sweeps)
    missesByRecordId.set(record.id, misses)
    catalogueBySource.set(record.source, (catalogueBySource.get(record.source) ?? 0) + 1)
    if (misses >= 1) missedBySource.set(record.source, (missedBySource.get(record.source) ?? 0) + 1)
    const shouldBeMissing = misses >= 1
    if (shouldBeMissing && !record.missing) {
      markMissingIds.push(record.id)
    } else if (!shouldBeMissing && record.missing) {
      clearMissingIds.push(record.id)
    }
  }

  // Suspicion is judged on everything the latest completed sweep missed,
  // not only on records newly flagged this pass. Judging new flags alone
  // let a broken feed through: the first bad sweep flagged the whole
  // catalogue (nothing at two misses yet, nothing held), and the second
  // bad sweep flagged nothing new — so it read as ordinary and hid
  // everything. A source whose latest sweep missed an implausible share
  // of its whole catalogue is suspicious on every such pass.
  const suspiciousSources: string[] = []
  for (const [source, missed] of missedBySource) {
    const catalogue = catalogueBySource.get(source) ?? 0
    if (missed >= SUSPICIOUS_MISS_MIN && catalogue > 0 && missed > catalogue * SUSPICIOUS_MISS_SHARE) {
      suspiciousSources.push(source)
    }
  }
  const suspicious = new Set(suspiciousSources)

  // While a source is suspicious, its latest miss does not count toward
  // the two-miss rule. Combined with the hold below, a persistently broken
  // feed can never accumulate the misses a hide needs.
  const effectiveMisses = (record: RetirementRecordInput): number => {
    const misses = missesByRecordId.get(record.id) ?? 0
    return suspicious.has(record.source) ? Math.max(0, misses - 1) : misses
  }

  const recordsByEvent = new Map<string, RetirementRecordInput[]>()
  for (const record of input.records) {
    const list = recordsByEvent.get(record.eventId) ?? []
    list.push(record)
    recordsByEvent.set(record.eventId, list)
  }

  const hideEventIds: string[] = []
  const heldEventIds: string[] = []
  const restoreEventIds: string[] = []
  for (const ev of input.events) {
    const records = recordsByEvent.get(ev.id) ?? []
    if (!records.length) continue
    if (ev.deletedAt == null) {
      if (!eventInScope(ev, todayStartMs)) continue
      const rawAllMissed =
        records.every((record) => (missesByRecordId.get(record.id) ?? 0) >= MISSES_BEFORE_HIDE)
      if (!rawAllMissed) continue
      const allMissed = records.every((record) => effectiveMisses(record) >= MISSES_BEFORE_HIDE)
      if (!allMissed || records.some((record) => suspicious.has(record.source))) heldEventIds.push(ev.id)
      else hideEventIds.push(ev.id)
      continue
    }
    // Already soft-deleted. Only this mechanism's own hides come back, and
    // only when a completed sweep has seen the listing again. Ownership is
    // judged against the CURRENT deletedAt (see sweepOwnsCurrentDelete):
    // a delete anyone else set after the mechanism's hide is left alone.
    if (!sweepOwnsCurrentDelete(ev)) continue
    if (ev.duplicateOfId != null || ev.communityKey != null) continue
    const seenAgain = records.some((record) => missesByRecordId.get(record.id) === 0)
    if (seenAgain) restoreEventIds.push(ev.id)
  }

  return { markMissingIds, clearMissingIds, hideEventIds, restoreEventIds, suspiciousSources, heldEventIds }
}

/**
 * The one soft-hide both retirement paths use. Sets deletedAt and leaves a
 * SOURCE_RETIRED audit marker, so a later sighting can restore exactly the
 * listings this mechanism hid — never one an admin removed by hand. The
 * two writes are one transaction: a hide without its marker would be a
 * delete the restore check cannot prove is ours (and would never lift),
 * and a marker without the hide would claim ownership of someone else's.
 */
export async function softHideEvent(eventId: string, detail: string, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const res = await tx.event.updateMany({
      where: { id: eventId, deletedAt: null },
      data: { deletedAt: now },
    })
    if (res.count === 0) return false
    await tx.qualityAudit.create({
      data: { eventId, action: 'SOURCE_RETIRED', detail, status: null },
    })
    return true
  })
}

async function restoreEvent(eventId: string, detail: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const res = await tx.event.updateMany({
      where: { id: eventId, deletedAt: { not: null } },
      data: { deletedAt: null },
    })
    if (res.count === 0) return false
    await tx.qualityAudit.create({
      data: { eventId, action: 'SOURCE_RESTORED', detail, status: null },
    })
    return true
  })
}

async function setMissing(ids: string[], missing: boolean) {
  for (let i = 0; i < ids.length; i += 500) {
    await prisma.sourceRecord.updateMany({
      where: { id: { in: ids.slice(i, i + 500) } },
      data: { missing },
    })
  }
}

/**
 * One pass over every source's sweep history. Idempotent: flags, hides and
 * restores are all derived from the current log ledger and record state, so
 * running it twice in a row changes nothing the second time. Runs on the
 * refresh finalize chunk, after the cycle's source chunks have finished.
 */
export async function runRetirementPass(now = new Date()): Promise<{
  marked: number
  cleared: number
  hidden: number
  restored: number
  held: number
}> {
  const todayStart = new Date(`${toSydneyParts(now).date}T00:00:00.000Z`)
  const sweepsBySource: Record<string, CompletedSweep[]> = {}
  for (const { name, key } of RETIREMENT_SOURCES) {
    const logs = await prisma.refreshLog.findMany({
      where: {
        status: sourceLogStatus(name),
        endedAt: { not: null },
        startedAt: { gte: new Date(now.getTime() - LOG_WINDOW_MS) },
      },
      orderBy: { startedAt: 'desc' },
      take: LOG_TAKE,
      select: { startedAt: true, endedAt: true, eventsAdded: true, errors: true },
    })
    const sweeps = completedSweeps(logs, MISSES_BEFORE_HIDE)
    if (sweeps.length) sweepsBySource[key] = sweeps
  }
  const evaluatedKeys = Object.keys(sweepsBySource)
  const empty = { marked: 0, cleared: 0, hidden: 0, restored: 0, held: 0 }
  if (!evaluatedKeys.length) return empty

  const firstRecords = await prisma.sourceRecord.findMany({
    where: {
      source: { in: evaluatedKeys },
      event: { date: { gte: todayStart }, duplicateOfId: null, communityKey: null },
    },
    select: { id: true, eventId: true, source: true, seenAt: true, missing: true },
  })
  if (!firstRecords.length) return empty
  const eventIds = [...new Set(firstRecords.map((record) => record.eventId))]
  const siblingRecords = await prisma.sourceRecord.findMany({
    where: { eventId: { in: eventIds }, source: { in: RETIREMENT_SOURCES.map((s) => s.key) } },
    select: { id: true, eventId: true, source: true, seenAt: true, missing: true },
  })
  const recordsById = new Map<string, RetirementRecordInput>()
  for (const record of [...firstRecords, ...siblingRecords]) recordsById.set(record.id, record)
  const records = [...recordsById.values()]

  const eventRows = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    select: { id: true, date: true, status: true, deletedAt: true, duplicateOfId: true, communityKey: true },
  })
  const audits = await prisma.qualityAudit.findMany({
    where: { eventId: { in: eventIds }, action: { in: ['SOURCE_RETIRED', 'SOURCE_RESTORED'] } },
    orderBy: { createdAt: 'desc' },
    select: { eventId: true, action: true, createdAt: true },
  })
  const retirementAudit = new Map<string, { action: string; createdAt: Date }>()
  for (const audit of audits) {
    if (audit.eventId && !retirementAudit.has(audit.eventId)) {
      retirementAudit.set(audit.eventId, { action: audit.action, createdAt: audit.createdAt })
    }
  }
  const events: RetirementEventInput[] = eventRows.map((ev) => ({
    ...ev,
    retirementAudit: retirementAudit.get(ev.id) ?? null,
  }))

  const plan = planRetirement({ sweepsBySource, records, events, todayStart })

  await setMissing(plan.markMissingIds, true)
  await setMissing(plan.clearMissingIds, false)

  let hidden = 0
  for (const eventId of plan.hideEventIds.slice(0, HIDE_CAP)) {
    const sources = [...new Set((recordsByEvent(records, eventId)).map((r) => r.source))].join(', ')
    const done = await softHideEvent(
      eventId,
      `Missed by every source that lists it (${sources}) in two consecutive completed sweeps. Soft-hidden, never deleted; it restores automatically if a source lists it again.`,
      now,
    )
    if (done) hidden++
  }

  let restored = 0
  for (const eventId of plan.restoreEventIds) {
    const done = await restoreEvent(
      eventId,
      'A completed sweep lists this event again after it was retired for vanishing. Soft-delete lifted.',
    )
    if (done) restored++
  }

  if (plan.heldEventIds.length) {
    for (const source of plan.suspiciousSources) {
      const existing = await prisma.qualityAudit.findFirst({
        where: { action: 'SOURCE_RETIREMENT_HELD', status: 'OPEN', detail: { startsWith: source } },
        select: { id: true },
      })
      if (!existing) {
        await prisma.qualityAudit.create({
          data: {
            eventId: null,
            action: 'SOURCE_RETIREMENT_HELD',
            status: 'OPEN',
            detail: `${source}: its latest completed sweep missed an implausible share of its upcoming listings, so ${plan.heldEventIds.length} listing(s) that met the two-miss rule were NOT hidden. While the source keeps missing at that rate its misses do not count toward the hide rule, so a persistently broken feed cannot mass-hide its listings; the hides stay held until the source's sweeps look ordinary again.`,
          },
        })
      }
    }
    console.warn('[retirement] suspicious sweep held hides', {
      sources: plan.suspiciousSources,
      held: plan.heldEventIds.length,
    })
  }

  const result = {
    marked: plan.markMissingIds.length,
    cleared: plan.clearMissingIds.length,
    hidden,
    restored,
    held: plan.heldEventIds.length,
  }
  console.log('[retirement]', result)
  return result
}

function recordsByEvent(records: RetirementRecordInput[], eventId: string): RetirementRecordInput[] {
  return records.filter((record) => record.eventId === eventId)
}
