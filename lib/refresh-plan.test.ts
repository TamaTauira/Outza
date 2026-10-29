import assert from 'node:assert/strict'
import test from 'node:test'
import vercel from '../vercel.json'
import { SOURCE_NAMES } from './refresh'
import {
  REFRESH_CHUNKS,
  SOURCE_BUDGET_MAX_MS,
  assessRefreshCycle,
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

test('chunks list every source once and finish with the cycle step', () => {
  const listed = REFRESH_CHUNKS.flatMap((c) => c.sources ?? [])
  assert.deepEqual(listed, [...SOURCE_NAMES])
  assert.equal(REFRESH_CHUNKS.filter((c) => c.finalize).length, 1)
  assert.equal(REFRESH_CHUNKS.at(-1)?.id, 'finalize')
  for (const chunk of REFRESH_CHUNKS) {
    assert.ok(chunk.budgetMs <= SOURCE_BUDGET_MAX_MS)
    assert.ok(chunk.budgetMs <= 220_000)
    assert.equal([0, 15, 30, 45].includes(chunk.minute), false)
  }
  for (let i = 1; i < REFRESH_CHUNKS.length; i++) {
    assert.ok(REFRESH_CHUNKS[i].minute - REFRESH_CHUNKS[i - 1].minute >= 6)
  }
})

test('vercel.json gives each chunk its own cron under the 300s function limit', () => {
  const crons = vercel.crons.filter((c) => c.path.startsWith('/api/cron/refresh'))
  assert.equal(crons.length, REFRESH_CHUNKS.length)
  for (const chunk of REFRESH_CHUNKS) {
    const cron = crons.find((c) => c.path === `/api/cron/refresh/${chunk.id}`)
    assert.ok(cron, `missing cron for ${chunk.id}`)
    assert.equal(cron?.schedule, `${chunk.minute} */2 * * *`)
  }
  const taken = new Set(vercel.crons.filter((c) => !c.path.startsWith('/api/cron/refresh')).map((c) => c.schedule))
  for (const chunk of REFRESH_CHUNKS) {
    assert.equal(taken.has(`${chunk.minute} */2 * * *`), false)
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
