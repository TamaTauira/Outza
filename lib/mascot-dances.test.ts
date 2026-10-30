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

test('pickDance covers all twenty routines and never repeats back to back', () => {
  let last: DanceId | null = null
  const seen = new Set<DanceId>()
  for (let i = 0; i < 400; i++) {
    const next = pickDance(last, () => ((i * 17) % 1000) / 1000)
    assert.notEqual(next, last)
    assert.ok(DANCE_IDS.includes(next))
    seen.add(next)
    last = next
  }
  assert.equal(seen.size, DANCE_IDS.length)
  for (const id of DANCE_IDS) {
    const fromHere = new Set<DanceId>()
    for (let i = 0; i < 19; i++) {
      fromHere.add(pickDance(id, () => (i + 0.5) / 19))
    }
    assert.equal(fromHere.has(id), false)
    assert.equal(fromHere.size, 19)
  }
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
