import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeCollectionLink, encodeCollectionLink } from './collections'

test('a collection link round-trips the name and the events', () => {
  const token = encodeCollectionLink({
    name: 'Date nights',
    events: [{ id: 'evt-1', title: 'Jazz', date: '2026-11-21', time: '19:30', venueName: 'The Basement', suburb: 'CBD' }],
  })
  const back = decodeCollectionLink(token)
  assert.equal(back?.name, 'Date nights')
  assert.equal(back?.events[0]?.title, 'Jazz')
  assert.equal(decodeCollectionLink('not-a-link'), null)
})
