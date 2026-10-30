import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bareEventId, redirectTargetForBareId } from './event-redirect'

test('only hyphen-free event ids are legacy URLs', () => {
  assert.equal(bareEventId('/events/clh3abc'), 'clh3abc')
  assert.equal(bareEventId('/events/jazz-night-clh3abc'), null)
  assert.equal(bareEventId('/events'), null)
  assert.equal(bareEventId('/events/clh3abc/edit'), null)
  assert.equal(bareEventId('/sydney/events'), null)
})

test('a bare id 301s to the slug URL and a slug-less title does not loop', () => {
  assert.equal(redirectTargetForBareId('clh3abc', { id: 'clh3abc', title: 'Jazz Night' }), '/events/jazz-night-clh3abc')
  assert.equal(redirectTargetForBareId('clh3abc', { id: 'clh3abc', title: null }), null)
  assert.equal(redirectTargetForBareId('clh3abc', { id: 'other', title: 'Jazz Night' }), null)
  assert.equal(redirectTargetForBareId('clh3abc', null), null)
})
