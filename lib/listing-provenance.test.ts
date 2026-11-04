import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listingProvenance } from './listing-provenance'
import { sourceOutageSentence, staleShareAlert, statusAfterSourceReport } from './listing-freshness'

test('provenance names the source and an organiser update without saying verified', () => {
  const row = listingProvenance({
    source: 'humanitix',
    sourceUrl: 'https://events.humanitix.com/jazz',
    organiserName: 'Lantern Jazz',
    venueName: 'The Lantern',
    lastVerifiedAt: '2026-11-02T00:00:00.000Z',
    sources: ['humanitix', 'eventbrite'],
    organiserFields: ['time'],
    status: 'SCHEDULED',
  })
  assert.equal(row.sourceLabel, 'Humanitix')
  assert.match(row.organiserNote ?? '', /Updated by organiser/)
  assert.match(row.organiserNote ?? '', /may differ from the original event source/)
  assert.match(row.checkNote, /not a live ticket check/)
  assert.deepEqual(row.otherSources, ['Eventbrite'])
  assert.doesNotMatch(JSON.stringify(row), /verified/i)
  assert.equal(row.filledNote, null)
})

test('a blank filled from another source is named on the listing', () => {
  const row = listingProvenance({
    source: 'frontier',
    sources: ['frontier', 'ticketmaster'],
    fieldSources: { time: 'ticketmaster', endTime: 'ticketmaster', price: 'ticketmaster' },
  })
  assert.match(row.filledNote ?? '', /Ticketmaster/)
  assert.match(row.filledNote ?? '', /start time/)
  assert.match(row.filledNote ?? '', /price/)
  assert.match(row.filledNote ?? '', /left them blank/)
  assert.doesNotMatch(row.filledNote ?? '', /verified/i)
})

test('a missing source does not cancel a listing, and a confident report can', () => {
  const outage = statusAfterSourceReport({ current: 'SCHEDULED', sourceMissing: true, reportedStatus: 'CANCELLED', confidence: 1 })
  assert.equal(outage.status, 'SCHEDULED')
  assert.equal(outage.applied, false)
  const unsure = statusAfterSourceReport({ current: 'SCHEDULED', sourceMissing: false, reportedStatus: 'CANCELLED', confidence: 0.4 })
  assert.equal(unsure.applied, false)
  const sure = statusAfterSourceReport({ current: 'SCHEDULED', sourceMissing: false, reportedStatus: 'CANCELLED', confidence: 0.9 })
  assert.equal(sure.status, 'CANCELLED')
  assert.match(sourceOutageSentence(), /not treated as a cancellation/)
  assert.equal(staleShareAlert(50, 40), false)
  assert.equal(staleShareAlert(100, 50), true)
})
