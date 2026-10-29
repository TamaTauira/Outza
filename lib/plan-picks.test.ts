import assert from 'node:assert/strict'
import { test } from 'node:test'
import { legsBetween, type OutingEvent } from './outings'
import { matchPlanPick } from './plan-picks'

test('plan chips match the ready-made days and ignore a vague ask', () => {
  assert.equal(matchPlanPick('Saturday date night')?.slug, 'saturday-date-night')
  assert.equal(matchPlanPick('date night in the city')?.slug, 'saturday-date-night')
  assert.equal(matchPlanPick('Family Sunday under $50')?.slug, 'family-sunday')
  assert.equal(matchPlanPick('a free afternoon')?.slug, 'free-afternoon')
  assert.equal(matchPlanPick('free'), null)
  assert.equal(matchPlanPick('jazz on friday'), null)
})

test('two mapped stops still show a walk and a drive between them', () => {
  const events: OutingEvent[] = [
    { id: 'a', title: 'Jazz', date: '2026-10-31', time: '19:00', venueName: 'Foundry', city: 'Sydney', category: 'Music', isFree: false, latitude: -33.8688, longitude: 151.2093 },
    { id: 'b', title: 'Comedy', date: '2026-10-31', time: '21:30', venueName: 'Factory', city: 'Sydney', category: 'Arts & Culture', isFree: false, latitude: -33.8915, longitude: 151.2767 },
  ]
  const legs = legsBetween(events)
  assert.equal(legs.length, 1)
  assert.equal(legs[0].fromId, 'a')
  assert.equal(legs[0].toId, 'b')
  assert.equal(legs[0].kind, 'trip')
  assert.match(legs[0].text, /walk/)
  assert.match(legs[0].text, /drive/)
  assert.match(legs[0].href, /google\.com\/maps\/dir/)
})

test('a hop with no pins still leaves a travel line', () => {
  const events: OutingEvent[] = [
    { id: 'a', title: 'Jazz', date: '2026-10-31', time: '19:00', venueName: 'Foundry', city: 'Sydney', category: 'Music', isFree: false },
    { id: 'b', title: 'Comedy', date: '2026-10-31', time: '21:30', venueName: 'Factory', city: 'Sydney', category: 'Arts & Culture', isFree: false },
  ]
  const legs = legsBetween(events)
  assert.equal(legs.length, 1)
  assert.match(legs[0].text, /Travel time unavailable/)
  assert.ok(legs[0].href)
})
