import assert from 'node:assert/strict'
import test from 'node:test'
import vercel from '../vercel.json'
import { SOURCE_NAMES } from './refresh'
import {
  HOURLY_SIDE_MINUTES,
  REFRESH_CHUNKS,
  REFRESH_CYCLE_WINDOW_MS,
  SOURCE_BUDGET_MAX_MS,
  assessRefreshCycle,
  attachSweepProgress,
  burstIdleMinutes,
  isBudgetSkip,
  isPartialRefresh,
  readSweepProgress,
  refreshFailure,
  sweepFlagsFromLog,
  withSweepMark,
  type CycleLog,
} from './refresh-plan'

const NAMES = ['Ticketmaster', 'Frontier Touring']

function row(partial: Partial<CycleLog> & Pick<CycleLog, 'status'>): CycleLog {
  return {
    endedAt: new Date(),
    errors: null,
    eventsAdded: 3,
    startedAt: new Date(),
    ...partial,
  }
}

test('an abort is a real failure and a budget stop is not', () => {
  assert.equal(isBudgetSkip('Moshtix: This operation was aborted'), false)
  assert.equal(isBudgetSkip('Moshtix: time budget reached after saving 634 events'), true)
  assert.equal(isPartialRefresh('Moshtix: time budget reached after saving 634 events'), true)
  assert.equal(isPartialRefresh('Moshtix: upstream 504 after saving 796 events; continuing next run'), true)
  assert.equal(isPartialRefresh('Moshtix: Moshtix API 504'), false)
  assert.equal(isPartialRefresh('Moshtix: Moshtix API 400'), false)
  assert.equal(REFRESH_CHUNKS.find((chunk) => chunk.id === 'moshtix')?.budgetMs, SOURCE_BUDGET_MAX_MS)
})

test('chunks list every source once and finish with the cycle step', () => {
  const listed = REFRESH_CHUNKS.flatMap((c) => c.sources ?? [])
  assert.deepEqual(listed, [...SOURCE_NAMES])
  assert.equal(REFRESH_CHUNKS.filter((c) => c.finalize).length, 1)
  assert.equal(REFRESH_CHUNKS.at(-1)?.id, 'finalize')
  const popular = REFRESH_CHUNKS.find((chunk) => chunk.id === 'popular-regulars')
  const brisbane = REFRESH_CHUNKS.find((chunk) => chunk.id === 'brisbane')
  const finalize = REFRESH_CHUNKS.find((chunk) => chunk.finalize)
  assert.deepEqual(popular?.sources, ['Popular regulars'])
  assert.deepEqual(brisbane?.sources, ['Brisbane City Council'])
  assert.equal(popular?.minute, 18)
  assert.equal(brisbane?.minute, 20)
  assert.equal(finalize?.minute, 23)
  // Each source has its own invocation, so a slow one cannot push the next past finalize.
  for (const chunk of REFRESH_CHUNKS) {
    if (chunk.finalize) continue
    assert.equal(chunk.sources?.length, 1)
    assert.ok(chunk.minute * 60_000 + chunk.budgetMs < finalize!.minute * 60_000, chunk.id)
  }
  for (const chunk of REFRESH_CHUNKS) {
    assert.ok(chunk.budgetMs <= SOURCE_BUDGET_MAX_MS)
    assert.ok(chunk.budgetMs <= 220_000)
    assert.equal([0, 15, 30, 45].includes(chunk.minute), false)
  }
  for (let i = 1; i < REFRESH_CHUNKS.length; i++) {
    const gap = REFRESH_CHUNKS[i].minute - REFRESH_CHUNKS[i - 1].minute
    // Finalize waits one extra minute so Brisbane's own budget ends before assessment.
    assert.equal(gap, REFRESH_CHUNKS[i].finalize ? 3 : 2)
  }
})

test('vercel.json runs each chunk hourly inside one burst with a long idle gap', () => {
  const crons = vercel.crons.filter((c) => c.path.startsWith('/api/cron/refresh'))
  assert.equal(crons.length, REFRESH_CHUNKS.length)
  for (const chunk of REFRESH_CHUNKS) {
    const cron = crons.find((c) => c.path === `/api/cron/refresh/${chunk.id}`)
    assert.ok(cron, `missing cron for ${chunk.id}`)
    assert.equal(cron?.schedule, `${chunk.minute} * * * *`)
  }
  const taken = new Set(vercel.crons.filter((c) => !c.path.startsWith('/api/cron/refresh')).map((c) => c.schedule))
  for (const chunk of REFRESH_CHUNKS) {
    assert.equal(taken.has(`${chunk.minute} * * * *`), false)
  }
  const activity = [...REFRESH_CHUNKS.map((chunk) => chunk.minute), ...HOURLY_SIDE_MINUTES]
  const idle = burstIdleMinutes(activity, REFRESH_CHUNKS[0].minute)
  assert.ok(idle >= 30, `idle gap ${idle} min is too short to suspend`)
  assert.ok(REFRESH_CYCLE_WINDOW_MS < 60 * 60 * 1000)
  assert.ok(REFRESH_CYCLE_WINDOW_MS > (REFRESH_CHUNKS.at(-1)!.minute - REFRESH_CHUNKS[0].minute) * 60 * 1000)
  const ownerMinute = Number(vercel.crons.find((c) => c.path === '/api/cron/owner-alerts')?.schedule.split(' ')[0])
  assert.ok(ownerMinute > REFRESH_CHUNKS.find((c) => c.finalize)!.minute)
  for (const cron of vercel.crons) {
    const minute = Number(cron.schedule.split(' ')[0].split(',')[0])
    assert.ok(minute >= REFRESH_CHUNKS[0].minute && minute <= Math.max(...HOURLY_SIDE_MINUTES))
  }
})

test('a finished cycle is successful when one source failed or hit its budget', () => {
  const partial = assessRefreshCycle(
    [
      row({ status: 'source:Ticketmaster', errors: null, eventsAdded: 10 }),
      row({ status: 'source:Frontier Touring', errors: 'Frontier Touring: time budget reached after saving 3 events', eventsAdded: 4 }),
    ],
    NAMES,
  )
  assert.equal(partial.ok, true)
  assert.deepEqual(partial.warned, ['Frontier Touring'])
  assert.deepEqual(partial.failed, [])
  assert.equal(partial.eventsAdded, 14)

  const oneDown = assessRefreshCycle(
    [
      row({ status: 'source:Ticketmaster', errors: 'Ticketmaster: API 500' }),
      row({ status: 'source:Frontier Touring', errors: null }),
    ],
    NAMES,
  )
  assert.equal(oneDown.ok, true)
  assert.deepEqual(oneDown.failed, ['Ticketmaster'])

  const paused = assessRefreshCycle(
    [
      row({ status: 'source:Ticketmaster', errors: null, eventsAdded: 10 }),
      row({ status: 'source:Frontier Touring', errors: 'Frontier Touring: upstream 504 after saving 4 events; continuing next run', eventsAdded: 4 }),
    ],
    NAMES,
  )
  assert.equal(paused.ok, true)
  assert.deepEqual(paused.warned, ['Frontier Touring'])
  assert.deepEqual(paused.failed, [])
})

test('a cycle is not successful when a chunk never finished or every source hard-failed', () => {
  const missing = assessRefreshCycle([row({ status: 'source:Ticketmaster', errors: null })], NAMES)
  assert.equal(missing.ok, false)
  assert.deepEqual(missing.missing, ['Frontier Touring'])

  const stillRunning = assessRefreshCycle(
    [
      row({ status: 'source:Ticketmaster', errors: null, endedAt: null }),
      row({ status: 'source:Frontier Touring', errors: null }),
    ],
    NAMES,
  )
  assert.equal(stillRunning.ok, false)
  assert.deepEqual(stillRunning.missing, ['Ticketmaster'])

  const allDown = assessRefreshCycle(
    [
      row({ status: 'source:Ticketmaster', errors: 'Ticketmaster: down' }),
      row({ status: 'source:Frontier Touring', errors: 'Frontier Touring: down' }),
    ],
    NAMES,
  )
  assert.equal(allDown.ok, false)
  assert.equal(allDown.missing.length, 0)
})

test('a sweep progress mark is not a source failure', () => {
  assert.equal(withSweepMark(null, {}), null)
  assert.equal(withSweepMark(null, { more: true }), '[sweep:more]')
  assert.equal(withSweepMark(null, { continuation: true }), '[sweep:continued]')
  assert.equal(withSweepMark(null, { continuation: true, more: true }), '[sweep:continued+more]')
  assert.equal(withSweepMark(null, { more: true, sweepId: 'AbC12' }), '[sweep:more id=abc12]')
  const budget = 'Moshtix: time budget reached after saving 634 events'
  assert.equal(withSweepMark(budget, { more: true }), `${budget} [sweep:more]`)
  assert.equal(withSweepMark(`${budget} [sweep:more]`, { more: true }), `${budget} [sweep:more]`)
  assert.equal(refreshFailure('[sweep:continued]'), null)
  assert.equal(refreshFailure('[sweep:continued id=abc12]'), null)
  assert.equal(refreshFailure(`${budget} [sweep:more]`), budget)
  assert.equal(isPartialRefresh(refreshFailure(`${budget} [sweep:more]`)), true)
  assert.deepEqual(sweepFlagsFromLog('[sweep:continued+more]'), { continuation: true, more: true, unmarked: false, sweepId: null })
  assert.deepEqual(sweepFlagsFromLog('[sweep:continued+more id=abc12]'), { continuation: true, more: true, unmarked: false, sweepId: 'abc12' })
  assert.deepEqual(sweepFlagsFromLog('Moshtix: upstream 504 after saving 796 events; continuing next run'), { continuation: false, more: true, unmarked: false, sweepId: null })
  assert.deepEqual(sweepFlagsFromLog(null), { continuation: false, more: false, unmarked: true, sweepId: null })
  const tagged = attachSweepProgress(new Error('Moshtix API 500'), { continuation: true, more: true, sweepId: 'abc12' })
  assert.equal(tagged.message, 'Moshtix API 500')
  assert.deepEqual(readSweepProgress(tagged), { continuation: true, more: true, sweepId: 'abc12' })

  const open = assessRefreshCycle(
    [
      row({ status: 'source:Ticketmaster', errors: '[sweep:more]', eventsAdded: 1014 }),
      row({ status: 'source:Frontier Touring', errors: null, eventsAdded: 2 }),
    ],
    NAMES,
  )
  assert.equal(open.ok, true)
  assert.deepEqual(open.warned, [])
  assert.deepEqual(open.failed, [])
  assert.equal(open.eventsAdded, 1016)

  const budgeted = assessRefreshCycle(
    [
      row({ status: 'source:Ticketmaster', errors: `${budget} [sweep:more]`, eventsAdded: 634 }),
      row({ status: 'source:Frontier Touring', errors: null }),
    ],
    NAMES,
  )
  assert.deepEqual(budgeted.warned, ['Ticketmaster'])
  assert.deepEqual(budgeted.failed, [])
})

test('the latest finished log for a source wins', () => {
  const cycle = assessRefreshCycle(
    [
      row({ status: 'source:Ticketmaster', errors: 'Ticketmaster: down', eventsAdded: 1, startedAt: new Date(Date.now() - 10_000) }),
      row({ status: 'source:Ticketmaster', errors: null, eventsAdded: 9, startedAt: new Date() }),
      row({ status: 'source:Frontier Touring', errors: null, eventsAdded: 2 }),
    ],
    NAMES,
  )
  assert.equal(cycle.ok, true)
  assert.deepEqual(cycle.failed, [])
  assert.equal(cycle.eventsAdded, 11)
})
