import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REACTION_HOUR_CAP, REACTION_KINDS, isReactionKind, reactionRateLimited, reactionWrite } from './reactions'

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
