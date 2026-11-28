import assert from 'node:assert/strict'
import test from 'node:test'
import { withSweepMark } from './refresh-plan'
import {
  completedSweeps,
  missedSweeps,
  planRetirement,
  type CompletedSweep,
  type RetirementEventInput,
  type RetirementRecordInput,
  type SweepLog,
} from './retirement'

const HOUR = 3600_000
const T0 = Date.UTC(2026, 10, 20, 0, 0, 0)

function log(hoursAfter: number, opts: { errors?: string | null; events?: number } = {}): SweepLog {
  const startedAt = new Date(T0 + hoursAfter * HOUR)
  return {
    startedAt,
    endedAt: new Date(startedAt.getTime() + 600_000),
    eventsAdded: opts.events ?? 10,
    errors: opts.errors ?? null,
  }
}

test('a single clean one-shot run is a completed sweep', () => {
  const sweeps = completedSweeps([log(5)])
  assert.equal(sweeps.length, 1)
  assert.equal(sweeps[0].startedAt, T0 + 5 * HOUR)
  assert.equal(sweeps[0].chunks, 1)
})

test('a hard failure is not a completed sweep', () => {
  assert.equal(completedSweeps([log(5, { errors: 'Eventbrite: API exploded' })]).length, 0)
})

test('a time-budget stop is not a completed sweep', () => {
  const errors = 'Eventbrite: time budget reached after saving 12 events'
  assert.equal(completedSweeps([log(5, { errors })]).length, 0)
})

test('a run that stopped with more of its sweep left is not a completed sweep', () => {
  const errors = withSweepMark(null, { more: true, sweepId: 'abc123' })
  assert.equal(completedSweeps([log(5, { errors })]).length, 0)
})

test('a Moshtix pause is an open chunk, not a completed sweep', () => {
  const errors = 'Moshtix: upstream 503 after saving 40 events; continuing next run'
  assert.equal(completedSweeps([log(5, { errors })]).length, 0)
})

test('a resumed chain completes one sweep starting at its first chunk', () => {
  const starter = log(0, { errors: withSweepMark(null, { more: true, sweepId: 'abc123' }), events: 30 })
  const middle = log(1, {
    errors: withSweepMark(null, { continuation: true, more: true, sweepId: 'abc123' }),
    events: 25,
  })
  const finisher = log(2, { errors: withSweepMark(null, { continuation: true, sweepId: 'abc123' }), events: 5 })
  const sweeps = completedSweeps([finisher, middle, starter])
  assert.equal(sweeps.length, 1)
  assert.equal(sweeps[0].startedAt, T0)
  assert.equal(sweeps[0].chunks, 3)
  assert.equal(sweeps[0].events, 60)
})

test('a chain with a timed-out middle chunk is not a completed sweep', () => {
  const starter = log(0, { errors: withSweepMark(null, { more: true, sweepId: 'abc123' }) })
  const middle = log(1, {
    errors: withSweepMark('Moshtix: time budget reached after saving 5 events', {
      continuation: true,
      more: true,
      sweepId: 'abc123',
    }),
  })
  const finisher = log(2, { errors: withSweepMark(null, { continuation: true, sweepId: 'abc123' }) })
  assert.equal(completedSweeps([finisher, middle, starter]).length, 0)
})

test('an open sweep does not hide the last completed one', () => {
  const done = log(0)
  const open = log(1, { errors: withSweepMark(null, { more: true, sweepId: 'def456' }) })
  const sweeps = completedSweeps([open, done])
  assert.equal(sweeps.length, 1)
  assert.equal(sweeps[0].startedAt, T0)
})

test('two one-shot runs are two sweeps, newest first', () => {
  const sweeps = completedSweeps([log(48), log(24)])
  assert.equal(sweeps.length, 2)
  assert.equal(sweeps[0].startedAt, T0 + 48 * HOUR)
  assert.equal(sweeps[1].startedAt, T0 + 24 * HOUR)
})

test('missedSweeps counts consecutive sweeps that started after the last sighting', () => {
  const sweeps: CompletedSweep[] = [
    { startedAt: T0 + 48 * HOUR, endedAt: T0 + 49 * HOUR, chunks: 1, events: 10 },
    { startedAt: T0 + 24 * HOUR, endedAt: T0 + 25 * HOUR, chunks: 1, events: 10 },
  ]
  assert.equal(missedSweeps(new Date(T0 + 50 * HOUR), sweeps), 0)
  assert.equal(missedSweeps(new Date(T0 + 48 * HOUR), sweeps), 0, 'seen at the sweep start counts as seen')
  assert.equal(missedSweeps(new Date(T0 + 30 * HOUR), sweeps), 1)
  assert.equal(missedSweeps(new Date(T0 + 2 * HOUR), sweeps), 2)
})

const todayStart = new Date(Date.UTC(2026, 10, 28))
const SWEEPS: CompletedSweep[] = [
  { startedAt: T0 + 48 * HOUR, endedAt: T0 + 49 * HOUR, chunks: 1, events: 10 },
  { startedAt: T0 + 24 * HOUR, endedAt: T0 + 25 * HOUR, chunks: 1, events: 10 },
]

function ev(partial: Partial<RetirementEventInput> & { id: string }): RetirementEventInput {
  return {
    date: new Date(Date.UTC(2026, 11, 5)),
    status: 'SCHEDULED',
    deletedAt: null,
    duplicateOfId: null,
    communityKey: null,
    retirementAudit: null,
    ...partial,
  }
}

function rec(partial: Partial<RetirementRecordInput> & { id: string; eventId: string }): RetirementRecordInput {
  return { source: 'eventbrite', seenAt: new Date(T0 + 50 * HOUR), missing: false, ...partial }
}

function plan(
  records: RetirementRecordInput[],
  events: RetirementEventInput[],
  sweepsBySource: Record<string, CompletedSweep[]> = { eventbrite: SWEEPS },
) {
  return planRetirement({ sweepsBySource, records, events, todayStart })
}

test('one missed sweep marks the record but does not hide the event', () => {
  const result = plan(
    [rec({ id: 'r1', eventId: 'e1', seenAt: new Date(T0 + 30 * HOUR) })],
    [ev({ id: 'e1' })],
  )
  assert.deepEqual(result.markMissingIds, ['r1'])
  assert.deepEqual(result.hideEventIds, [])
})

test('two missed sweeps hide the event', () => {
  const result = plan(
    [rec({ id: 'r1', eventId: 'e1', seenAt: new Date(T0 + 2 * HOUR) })],
    [ev({ id: 'e1' })],
  )
  assert.deepEqual(result.markMissingIds, ['r1'])
  assert.deepEqual(result.hideEventIds, ['e1'])
})

test('a failed sweep between two completed ones does not add a miss', () => {
  const logs = [
    log(48),
    log(36, { errors: 'Eventbrite: time budget reached after saving 3 events' }),
    log(24),
  ]
  const sweeps = completedSweeps(logs)
  assert.equal(sweeps.length, 2, 'the failed run is not a sweep at all')
  const result = plan(
    [rec({ id: 'r1', eventId: 'e1', seenAt: new Date(T0 + 30 * HOUR) })],
    [ev({ id: 'e1' })],
    { eventbrite: sweeps },
  )
  assert.deepEqual(result.markMissingIds, ['r1'], 'one real miss is recorded')
  assert.deepEqual(result.hideEventIds, [], 'the failed run cannot be the second miss')
})

test('a partial sweep does not increment the miss count either', () => {
  const logs = [
    log(48),
    log(36, { errors: withSweepMark(null, { more: true, sweepId: 'abc123' }) }),
    log(24),
  ]
  const sweeps = completedSweeps(logs)
  const result = plan(
    [rec({ id: 'r1', eventId: 'e1', seenAt: new Date(T0 + 30 * HOUR) })],
    [ev({ id: 'e1' })],
    { eventbrite: sweeps },
  )
  assert.deepEqual(result.hideEventIds, [])
})

test('an event still listed by another source is not hidden', () => {
  const result = plan(
    [
      rec({ id: 'r1', eventId: 'e1', seenAt: new Date(T0 + 2 * HOUR) }),
      rec({ id: 'r2', eventId: 'e1', source: 'ticketmaster', seenAt: new Date(T0 + 50 * HOUR) }),
    ],
    [ev({ id: 'e1' })],
    { eventbrite: SWEEPS, ticketmaster: SWEEPS },
  )
  assert.deepEqual(result.hideEventIds, [])
})

test('an event whose other source has no completed sweeps is not hidden', () => {
  const result = plan(
    [
      rec({ id: 'r1', eventId: 'e1', seenAt: new Date(T0 + 2 * HOUR) }),
      rec({ id: 'r2', eventId: 'e1', source: 'oztix', seenAt: new Date(T0 + 2 * HOUR) }),
    ],
    [ev({ id: 'e1' })],
  )
  assert.deepEqual(result.hideEventIds, [], 'no sweep history for oztix means no judgement')
})

test('a reappearing event is restored and its record cleared', () => {
  const result = plan(
    [rec({ id: 'r1', eventId: 'e1', seenAt: new Date(T0 + 50 * HOUR), missing: true })],
    [ev({
      id: 'e1',
      deletedAt: new Date(T0 + 40 * HOUR),
      retirementAudit: { action: 'SOURCE_RETIRED', createdAt: new Date(T0 + 40 * HOUR + 1000) },
    })],
  )
  assert.deepEqual(result.restoreEventIds, ['e1'])
  assert.deepEqual(result.clearMissingIds, ['r1'])
})

test('an admin soft-delete is never auto-restored', () => {
  const result = plan(
    [rec({ id: 'r1', eventId: 'e1', seenAt: new Date(T0 + 50 * HOUR), missing: true })],
    [ev({ id: 'e1', deletedAt: new Date(T0 + 40 * HOUR), retirementAudit: null })],
  )
  assert.deepEqual(result.restoreEventIds, [])
})

test('a manual re-delete after a manual restore is never auto-lifted', () => {
  // The mechanism hid e1 at T+40h (deletedAt and its SOURCE_RETIRED audit
  // land together). An admin then restored it by hand and later re-deleted
  // it by hand: the current deletedAt (T+90h) sits far after the audit, so
  // it is the admin's delete, not the mechanism's — even though the latest
  // retirement audit still says SOURCE_RETIRED and a sweep sees the event.
  const result = plan(
    [
      rec({ id: 'r1', eventId: 'e1', seenAt: new Date(T0 + 50 * HOUR), missing: true }),
      rec({ id: 'r2', eventId: 'e2', seenAt: new Date(T0 + 50 * HOUR), missing: true }),
    ],
    [
      ev({
        id: 'e1',
        deletedAt: new Date(T0 + 90 * HOUR),
        retirementAudit: { action: 'SOURCE_RETIRED', createdAt: new Date(T0 + 40 * HOUR + 1000) },
      }),
      // Control: e2's delete is still the mechanism's own (deletedAt in
      // step with its audit), so the same sighting restores it.
      ev({
        id: 'e2',
        deletedAt: new Date(T0 + 40 * HOUR),
        retirementAudit: { action: 'SOURCE_RETIRED', createdAt: new Date(T0 + 40 * HOUR + 1000) },
      }),
    ],
  )
  assert.deepEqual(result.restoreEventIds, ['e2'])
})

test('past, duplicate and community events are out of scope', () => {
  const stale = new Date(T0 + 2 * HOUR)
  const result = plan(
    [
      rec({ id: 'r1', eventId: 'past', seenAt: stale }),
      rec({ id: 'r2', eventId: 'dup', seenAt: stale }),
      rec({ id: 'r3', eventId: 'comm', seenAt: stale }),
    ],
    [
      ev({ id: 'past', date: new Date(Date.UTC(2026, 10, 1)) }),
      ev({ id: 'dup', duplicateOfId: 'e0' }),
      ev({ id: 'comm', communityKey: 'garage-sales' }),
    ],
  )
  assert.deepEqual(result.markMissingIds, [])
  assert.deepEqual(result.hideEventIds, [])
})

test('a suspicious sweep records misses but holds its hides', () => {
  const records: RetirementRecordInput[] = []
  const events: RetirementEventInput[] = []
  for (let n = 0; n < 40; n++) {
    const id = `e${n}`
    events.push(ev({ id }))
    // Half the catalogue vanishes in the newest sweep, already at two misses.
    const seenAt = n < 20 ? new Date(T0 + 2 * HOUR) : new Date(T0 + 50 * HOUR)
    records.push(rec({ id: `r${n}`, eventId: id, seenAt }))
  }
  const result = plan(records, events)
  assert.equal(result.markMissingIds.length, 20, 'the misses are still recorded')
  assert.deepEqual(result.suspiciousSources, ['eventbrite'])
  assert.deepEqual(result.hideEventIds, [], 'nothing hides on a suspicious sweep alone')
  assert.equal(result.heldEventIds.length, 20)
})

test('an ordinary number of misses in one sweep still hides', () => {
  const records: RetirementRecordInput[] = []
  const events: RetirementEventInput[] = []
  for (let n = 0; n < 40; n++) {
    const id = `e${n}`
    events.push(ev({ id }))
    const seenAt = n < 5 ? new Date(T0 + 2 * HOUR) : new Date(T0 + 50 * HOUR)
    records.push(rec({ id: `r${n}`, eventId: id, seenAt }))
  }
  const result = plan(records, events)
  assert.deepEqual(result.suspiciousSources, [])
  assert.equal(result.hideEventIds.length, 5)
})

test('two consecutive degraded sweeps covering a whole source hide nothing, however often they repeat', () => {
  // The canonical broken-feed scenario: the source's feed degrades so two
  // completed sweeps in a row see none of its listings. The first sweep
  // flags the whole catalogue; the second flags nothing new. Judging
  // suspicion on newly-flagged records alone let the second sweep hide
  // everything — this replay pins that it cannot.
  const sweep1: CompletedSweep = { startedAt: T0 + 24 * HOUR, endedAt: T0 + 25 * HOUR, chunks: 1, events: 0 }
  const sweep2: CompletedSweep = { startedAt: T0 + 48 * HOUR, endedAt: T0 + 49 * HOUR, chunks: 1, events: 0 }
  const sweep3: CompletedSweep = { startedAt: T0 + 72 * HOUR, endedAt: T0 + 73 * HOUR, chunks: 1, events: 0 }
  const events: RetirementEventInput[] = []
  const fresh: RetirementRecordInput[] = []
  for (let n = 0; n < 40; n++) {
    events.push(ev({ id: `e${n}` }))
    fresh.push(rec({ id: `r${n}`, eventId: `e${n}`, seenAt: new Date(T0 + 2 * HOUR) }))
  }

  const pass1 = plan(fresh, events, { eventbrite: [sweep1] })
  assert.equal(pass1.markMissingIds.length, 40, 'the first degraded sweep flags the whole catalogue')
  assert.deepEqual(pass1.hideEventIds, [], 'one miss hides nothing')
  assert.deepEqual(pass1.suspiciousSources, ['eventbrite'], 'the first degraded sweep is already suspicious')

  const flagged = fresh.map((record) => ({ ...record, missing: true }))
  const pass2 = plan(flagged, events, { eventbrite: [sweep2, sweep1] })
  assert.deepEqual(pass2.suspiciousSources, ['eventbrite'])
  assert.deepEqual(pass2.hideEventIds, [], 'the second degraded sweep hides nothing')
  assert.equal(pass2.heldEventIds.length, 40, 'every would-be hide is held, so the OPEN audit fires')

  const pass3 = plan(flagged, events, { eventbrite: [sweep3, sweep2, sweep1] })
  assert.deepEqual(pass3.hideEventIds, [], 'a third degraded sweep still hides nothing')
  assert.equal(pass3.heldEventIds.length, 40)
})
