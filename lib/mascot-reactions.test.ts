import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  HOVER_LINES,
  PARTY_LINE,
  REACTION_IDS,
  REACTION_LINES,
  isPartyCombo,
  pickReaction,
  type ReactionId,
} from './mascot-reactions'

test('mascot reactions are distinct, witty, and never say verified', () => {
  assert.ok(REACTION_IDS.length >= 12)
  assert.equal(new Set(REACTION_IDS).size, REACTION_IDS.length)
  const lines = [...Object.values(REACTION_LINES), PARTY_LINE, ...HOVER_LINES]
  for (const line of lines) {
    assert.equal(/verified/i.test(line), false)
    assert.ok(line.length > 8)
    assert.ok(line.length < 80)
  }
  assert.equal(REACTION_LINES.wink, 'Take a peep!')
  assert.match(REACTION_LINES.giggle, /something’s on tonight/)
  assert.match(REACTION_LINES.giggle, /Hehe/)
  assert.match(REACTION_LINES.sneeze, /Achoo/)
  assert.match(REACTION_LINES.wave, /G’day/)
  assert.match(REACTION_LINES.tickle, /tickle/i)
  assert.match(REACTION_LINES.delighted, /came back/)
})

test('pickReaction never repeats the reaction that just played', () => {
  let last: ReactionId | null = null
  for (let i = 0; i < REACTION_IDS.length * 3; i++) {
    const next = pickReaction(last, () => 0)
    assert.notEqual(next, last)
    last = next
  }
  for (const id of REACTION_IDS) {
    assert.notEqual(pickReaction(id, () => 0), id)
    assert.notEqual(pickReaction(id, () => 0.999), id)
  }
  assert.equal(pickReaction(null, () => 0), REACTION_IDS[0])
  for (let i = 0; i < 24; i++) {
    const id = pickReaction(null, () => i / 24)
    assert.notEqual(id, 'tickle')
    assert.notEqual(id, 'delighted')
  }
})

test('five clicks inside the window starts party mode', () => {
  const now = 10_000
  assert.equal(isPartyCombo([8400, 8800, 9200, 9600, 9900], now), true)
  assert.equal(isPartyCombo([8000, 9200, 9400, 9600, 9900], now), false)
  assert.equal(isPartyCombo([9600, 9700, 9800, 9900], now), false)
  assert.equal(isPartyCombo([], now), false)
})
