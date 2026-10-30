import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DANCE_IDS, DANCE_MS, pickDance, type DanceId } from './mascot-dances'
import { PARTY_MS } from './mascot-reactions'

test('the dance party has twenty distinct routines', () => {
  assert.equal(DANCE_IDS.length, 20)
  assert.equal(new Set(DANCE_IDS).size, 20)
  for (const id of [
    'moonwalk',
    'robot',
    'ymca',
    'macarena',
    'snake',
    'island',
    'griddy',
    'goth-snap',
    'hand-jive',
    'shuffle',
    'floss',
    'sprinkler',
    'running-man',
    'twist',
    'worm',
    'chicken',
    'disco-point',
    'shopping-cart',
    'horse',
    'cha-cha',
  ] as const) {
    assert.ok(DANCE_IDS.includes(id))
  }
  assert.equal(DANCE_MS, PARTY_MS)
  assert.ok(DANCE_MS >= 4000 && DANCE_MS <= 5000)
})

test('pickDance never repeats the routine that just played', () => {
  let last: DanceId | null = null
  const seen = new Set<DanceId>()
  for (let i = 0; i < DANCE_IDS.length; i++) {
    const next = pickDance(last, () => i / DANCE_IDS.length)
    assert.notEqual(next, last)
    seen.add(next)
    last = next
  }
  assert.ok(seen.size >= 10)
  for (const id of DANCE_IDS) {
    assert.notEqual(pickDance(id, () => 0), id)
    assert.notEqual(pickDance(id, () => 0.999), id)
  }
})
