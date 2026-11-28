import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REACTION_HOUR_CAP, REACTION_KINDS, isReactionKind, reactionRateLimited, reactionTarget, reactionWrite } from './reactions'

test('each kind is accepted once and unknown kinds are rejected', () => {
  assert.deepEqual([...REACTION_KINDS], ['HOT', 'LOVE', 'INTERESTED', 'EXCITED', 'GOING'])
  assert.equal(isReactionKind('HOT'), true)
  assert.equal(isReactionKind('STAR'), false)
})

test('a reaction turns on, off, or stays put', () => {
  assert.equal(reactionWrite({ active: false, turnOn: true }), 'add')
  assert.equal(reactionWrite({ active: true, turnOn: false }), 'remove')
  assert.equal(reactionWrite({ active: true, turnOn: true }), 'unchanged')
  assert.equal(reactionWrite({ active: false, turnOn: false }), 'unchanged')
})

test('reaction writes are capped per hour', () => {
  assert.equal(reactionRateLimited(REACTION_HOUR_CAP - 1), false)
  assert.equal(reactionRateLimited(REACTION_HOUR_CAP), true)
})

test('a local save id targets the listing itself, whatever the date', () => {
  assert.deepEqual(reactionTarget('local-cmk123abc-2026-11-28'), { type: 'local', listingId: 'cmk123abc' })
  assert.deepEqual(reactionTarget('local-cmk123abc-2027-01-03'), { type: 'local', listingId: 'cmk123abc' })
})

test('a plain event id targets the event itself', () => {
  assert.deepEqual(reactionTarget('cmk123abc'), { type: 'event', eventId: 'cmk123abc' })
})

test('a malformed local-looking id stays an event id, where it misses', () => {
  assert.deepEqual(reactionTarget('local-cmk123abc-28-11-2026'), { type: 'event', eventId: 'local-cmk123abc-28-11-2026' })
  assert.deepEqual(reactionTarget('local--2026-11-28'), { type: 'event', eventId: 'local--2026-11-28' })
})
