import assert from 'node:assert/strict'
import { test } from 'node:test'
import { editOutingEvents, type OutingEvent, type OutingTemplate } from './outings'

const template: OutingTemplate = {
  slug: 'free-afternoon',
  title: 'A free afternoon',
  blurb: 'Free.',
  weekday: null,
  categories: [],
  freeOnly: true,
  fromMin: 12 * 60,
  toMin: 18 * 60,
  allowUntimed: true,
  stops: 3,
}

function event(patch: Partial<OutingEvent> & Pick<OutingEvent, 'id' | 'title'>): OutingEvent {
  return {
    date: '2026-11-21',
    time: '14:00',
    venueName: patch.title,
    suburb: 'Newtown',
    city: 'Sydney',
    category: 'Community',
    isFree: true,
    price: 'Free',
    latitude: -33.9,
    longitude: 151.18,
    ...patch,
  }
}

const current = [event({ id: 'a', title: 'Markets', latitude: -33.9, longitude: 151.18 })]
const pool = [
  ...current,
  event({ id: 'b', title: 'Picnic', latitude: -33.91, longitude: 151.19 }),
  event({ id: 'c', title: 'Paid gig', isFree: false, price: '$40', priceMin: 40 }),
]

test('a swap keeps the window and drops the stop it replaces', () => {
  const next = editOutingEvents(template, pool, current, 'swap', 'a')
  assert.deepEqual(next?.map((item) => item.id), ['b'])
})

test('a paid listing does not fill a free plan', () => {
  const onlyPaid = editOutingEvents(template, [current[0], pool[2]], current, 'swap', 'a')
  assert.equal(onlyPaid, null)
})

test('remove drops one stop and add appends another', () => {
  const added = editOutingEvents(template, pool, current, 'add')
  assert.deepEqual(added?.map((item) => item.id), ['a', 'b'])
  const removed = editOutingEvents(template, pool, added ?? [], 'remove', 'a')
  assert.deepEqual(removed?.map((item) => item.id), ['b'])
})
