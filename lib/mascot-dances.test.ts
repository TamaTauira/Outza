import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { DANCE_IDS, DANCE_LABELS, DANCE_MS, pickDance, type DanceId } from './mascot-dances'
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

test('every dance paints its own full animation, so a party cannot zero the body', () => {
  const dances = readFileSync(new URL('../components/vibepeep-dances.css', import.meta.url), 'utf8')
  const mascot = readFileSync(new URL('../components/vibepeep-mascot.css', import.meta.url), 'utf8')
  assert.match(mascot, /\.vp-hit\[data-react\]:not\(\[data-dance\]\) \.vp-bob \{[^}]*animation: none;/)
  assert.equal(mascot.includes(".vp-hit[data-react] .vp-bob {\n  animation: none;"), false)
  for (const id of DANCE_IDS) {
    const token = `[data-react='party'][data-dance='${id}']`
    const start = dances.indexOf(token)
    assert.ok(start >= 0, id)
    const slice = dances.slice(start, start + 500)
    const anim = slice.match(/animation:\s*(vp-[a-z0-9-]+)/)
    assert.ok(anim, `${id} sets a full animation`)
    assert.ok(dances.includes(`@keyframes ${anim[1]}`), `${anim[1]} is defined`)
  }
})

test('dance name labels are unnumbered, and the snake one reads It\'s Britney B*', () => {
  const dances = readFileSync(new URL('../components/vibepeep-dances.css', import.meta.url), 'utf8')
  const labels: Record<string, string> = {
    moonwalk: 'Moonwalk',
    robot: 'Robot',
    ymca: 'YMCA',
    macarena: 'Macarena',
    snake: "It's Britney B*",
    island: 'The swim',
    griddy: 'Griddy',
    'goth-snap': 'Goth snap',
    'hand-jive': 'Hand jive',
    shuffle: 'Shuffle',
    floss: 'Floss',
    sprinkler: 'Sprinkler',
    'running-man': 'Running man',
    twist: 'Twist',
    worm: 'The worm',
    chicken: 'Chicken',
    'disco-point': 'Disco point',
    'shopping-cart': 'Shopping cart',
    horse: 'Horse',
    'cha-cha': 'Cha-cha',
  }
  for (const id of DANCE_IDS) {
    const rule = dances.match(new RegExp(`\\.vp-hit\\[data-dance='${id}'\\] \\.vp-dance-label::before \\{ content: '((?:\\\\'|[^'])*)'; \\}`))
    assert.ok(rule, `${id} has a name label`)
    const text = rule[1].replace(/\\'/g, "'")
    assert.equal(text, labels[id])
    assert.equal(/^\d/.test(text), false, text)
  }
  assert.equal(dances.includes("content: 'It\\'s Britney B*'"), true)
  assert.equal(/\bcontent:\s*'(\d+\s)/.test(dances), false)
})

test('each dance has its own short label, and none names a person', () => {
  const banned = /jackson|travolta|madonna|village people|ymca|macarena|verified|outza/i
  for (const id of DANCE_IDS) {
    const label = DANCE_LABELS[id]
    assert.equal(typeof label, 'string')
    assert.ok(label.length > 8 && label.length < 48, label)
    assert.equal(banned.test(label), false, label)
    assert.equal(banned.test(id) && /ymca|macarena/i.test(label), false)
  }
  assert.equal(new Set(Object.values(DANCE_LABELS)).size, DANCE_IDS.length)
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
