import assert from 'node:assert/strict'
import test from 'node:test'
import { sourceVolumeSignal, sweepRunFromLog } from './source-health'
import { ticketmasterFetchFailure } from './ticketmaster'

const none = { attempts: 0, failures: 0, lastStatus: null }

test('a missing Ticketmaster key is a failed run, not an empty feed', () => {
  assert.equal(ticketmasterFetchFailure(undefined, 0, none), 'TICKETMASTER_API_KEY is not set')
  const signal = sourceVolumeSignal(
    [sweepRunFromLog(3428, null)],
    { events: 0, continuation: false, more: false, unmarked: false, failed: true },
  )
  assert.equal(signal.signal, null)
  assert.equal(signal.comparison.comparable, false)
})

test('a run where every Discovery call failed is an outage, not zero events', () => {
  assert.equal(
    ticketmasterFetchFailure('key', 0, { attempts: 4, failures: 4, lastStatus: 401 }),
    'Ticketmaster requests failed (4 of 4) (last HTTP 401)',
  )
  assert.equal(
    ticketmasterFetchFailure('key', 0, { attempts: 2, failures: 2, lastStatus: 429 }),
    'Ticketmaster requests failed (2 of 2) (last HTTP 429)',
  )
  assert.equal(
    ticketmasterFetchFailure('key', 0, { attempts: 3, failures: 3, lastStatus: null }),
    'Ticketmaster requests failed (3 of 3)',
  )
})

test('a real empty response and a partial save are not reported as an outage', () => {
  assert.equal(ticketmasterFetchFailure('key', 0, { attempts: 6, failures: 0, lastStatus: null }), null)
  assert.equal(ticketmasterFetchFailure('key', 0, { attempts: 6, failures: 1, lastStatus: 502 }), null)
  assert.equal(ticketmasterFetchFailure('key', 120, { attempts: 4, failures: 4, lastStatus: 401 }), null)
  assert.equal(ticketmasterFetchFailure('key', 0, none), null)
})
