import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canChangePrivateStop, cleanPrivateStop, orderPlanStops, togetherLeg } from './together'

test('a private stop needs a name, times, address, and date, and is not a public listing', () => {
  const ok = cleanPrivateStop({ title: 'Drinks at home', address: '12 Smith St, Newtown', time: '18:00', endTime: '19:30', date: '2026-11-07' })
  assert.equal('error' in ok, false)
  const noAddress = cleanPrivateStop({ title: 'Drinks', time: '18:00', endTime: '19:30', date: '2026-11-07' })
  const sameTime = cleanPrivateStop({ title: 'Drinks', address: '12 Smith St', time: '18:00', endTime: '18:00', date: '2026-11-07' })
  const blank = cleanPrivateStop({ title: '  ', address: '12 Smith St', time: '18:00', endTime: '19:00', date: '2026-11-07' })
  assert.equal('error' in noAddress && noAddress.error, 'Add an address so we can work out travel time')
  assert.equal('error' in sameTime && sameTime.error, 'Finish time needs to be different from the start')
  assert.equal('error' in blank && blank.error, 'Give the stop a name')
})

test('public events and private stops share one timeline', () => {
  const ordered = orderPlanStops([
    { id: 'late', kind: 'event', date: '2026-11-07', time: '21:00' },
    { id: 'drinks', kind: 'private', date: '2026-11-07', time: '18:30' },
    { id: 'next-day', kind: 'event', date: '2026-11-08', time: '11:00' },
    { id: 'untimed', kind: 'event', date: '2026-11-07', time: null },
  ])
  assert.deepEqual(ordered.map((s) => s.id), ['drinks', 'late', 'untimed', 'next-day'])
})

test('only the person who added a private stop, or the plan creator, can change it', () => {
  const stop = { addedById: 'ada', addedByGuest: null }
  assert.equal(canChangePrivateStop({ userId: 'ada', guestKey: null }, stop, false), true)
  assert.equal(canChangePrivateStop({ userId: 'bea', guestKey: null }, stop, true), true)
  assert.equal(canChangePrivateStop({ userId: 'bea', guestKey: null }, stop, false), false)
  assert.equal(canChangePrivateStop({ userId: null, guestKey: 'abc' }, { addedById: null, addedByGuest: 'abc' }, false), true)
})

test('travel time is always described, with a directions link when the pins are missing', () => {
  const from = { title: 'Jazz', venueName: 'Foundry', city: 'Sydney', lat: -33.88, lng: 151.2 }
  const to = { title: 'Drinks', venueName: 'Drinks', place: '12 Smith St, Newtown', city: 'Sydney', lat: -33.9, lng: 151.18 }
  const trip = togetherLeg(from, to)
  assert.equal(trip.kind, 'trip')
  assert.match(trip.text, /walk/)
  assert.match(trip.href, /google\.com\/maps\/dir/)

  const missing = togetherLeg(
    { title: 'Jazz', venueName: 'Foundry', city: 'Sydney' },
    { title: 'Drinks', venueName: 'Drinks', place: '12 Smith St, Newtown', city: 'Sydney' },
  )
  assert.equal(missing.kind, 'missing')
  assert.match(missing.text, /Travel time unavailable/)
  assert.match(missing.href, /Smith/)
  assert.equal(missing.text.length > 0, true)
})
