import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildOuting, legsBetween, OUTING_TEMPLATES, type OutingEvent } from './outings'
import { matchPlanPick } from './plan-picks'

test('plan chips match the ready-made days and ignore a vague ask', () => {
  assert.equal(matchPlanPick('Saturday date night')?.slug, 'saturday-date-night')
  assert.equal(matchPlanPick('date night in the city')?.slug, 'saturday-date-night')
  assert.equal(matchPlanPick('Family Sunday under $50')?.slug, 'family-sunday')
  assert.equal(matchPlanPick('a free afternoon')?.slug, 'free-afternoon')
  assert.equal(matchPlanPick('plan my Saturday')?.slug, 'saturday-date-night')
  assert.equal(matchPlanPick('plan my Sunday')?.slug, 'family-sunday')
  assert.equal(matchPlanPick('free arvo')?.slug, 'free-afternoon')
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

test('a nearer stop is kept and a short gap skips the dining note', () => {
  const events: OutingEvent[] = [
    { id: 'start', title: 'Jazz', date: '2026-10-31', time: '18:00', venueName: 'Foundry', city: 'Sydney', category: 'Music', isFree: false, latitude: -33.8688, longitude: 151.2093 },
    { id: 'near', title: 'Comedy', date: '2026-10-31', time: '20:30', venueName: 'Factory', city: 'Sydney', category: 'Arts & Culture', isFree: false, latitude: -33.875, longitude: 151.215 },
    { id: 'far', title: 'Opera', date: '2026-10-31', time: '21:00', venueName: 'House', city: 'Sydney', category: 'Arts & Culture', isFree: false, latitude: -33.98, longitude: 151.35 },
    { id: 'tight', title: 'Late set', date: '2026-11-07', time: '19:00', venueName: 'One', city: 'Sydney', category: 'Music', isFree: false, latitude: -33.87, longitude: 151.21 },
    { id: 'soon', title: 'Next door', date: '2026-11-07', time: '20:00', venueName: 'Two', city: 'Sydney', category: 'Music', isFree: false, latitude: -33.871, longitude: 151.211 },
  ]
  const close = buildOuting(OUTING_TEMPLATES[0], events, 'Sydney')
  assert.deepEqual(close.eventIds, ['start', 'near'])
  const rushed = buildOuting(OUTING_TEMPLATES[0], events.filter((ev) => ev.date === '2026-11-07'), 'Sydney')
  assert.equal(rushed.stops.some((stop) => stop.kind === 'tip' && stop.tip === 'dining'), false)
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
