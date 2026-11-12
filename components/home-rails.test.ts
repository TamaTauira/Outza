import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mixRail } from './home-rails'

const row = (id: string, sponsored = false) => ({
  id, title: id, date: '2026-11-12', time: '19:00', venueName: 'Hall', category: 'Music', isFree: false, price: null, sponsored,
})

test('sponsored cards lead a rail and ids are not repeated', () => {
  const mixed = mixRail([row('s1', true), row('a')], [row('a'), row('b'), row('c'), row('d'), row('e')], 5)
  assert.deepEqual(mixed.map((ev) => ev.id), ['s1', 'a', 'b', 'c', 'd'])
  assert.equal(mixed[0].sponsored, true)
})
