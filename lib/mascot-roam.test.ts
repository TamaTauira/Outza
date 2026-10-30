import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ROAM_ACTS,
  ROAM_LINES,
  ROAM_POOL,
  bounceStep,
  destination,
  faceForDelta,
  hopArc,
  hopCount,
  moveDuration,
  nearPageBottom,
  peekTarget,
  pickRoamAct,
  pickRoamLine,
  roamBounds,
  smoothstep,
  type RoamAct,
} from './mascot-roam'

test('roaming has at least eight distinct behaviours', () => {
  assert.ok(ROAM_ACTS.length >= 8)
  assert.equal(new Set(ROAM_ACTS).size, ROAM_ACTS.length)
  for (const id of ['hop', 'jump', 'dance', 'spin', 'wave', 'wiggle', 'peek', 'nap', 'cheer', 'chase', 'bounce', 'perch'] as const) {
    assert.ok(ROAM_ACTS.includes(id))
    assert.ok(ROAM_LINES[id].length >= 2)
    for (const line of ROAM_LINES[id]) {
      assert.equal(/verified/i.test(line), false)
      assert.ok(line.length > 2)
      assert.ok(line.length < 48)
    }
  }
  assert.ok(ROAM_POOL.length >= 8)
  assert.equal(ROAM_POOL.includes('nap'), false)
  assert.equal(ROAM_POOL.includes('cheer'), false)
})

test('pickRoamAct never repeats and stays in the stroll pool', () => {
  let last: RoamAct | null = null
  for (let i = 0; i < ROAM_POOL.length * 3; i++) {
    const next = pickRoamAct(last, () => 0)
    assert.notEqual(next, last)
    assert.ok(ROAM_POOL.includes(next))
    last = next
  }
  for (const id of ROAM_POOL) {
    assert.notEqual(pickRoamAct(id, () => 0), id)
    assert.notEqual(pickRoamAct(id, () => 0.999), id)
  }
  assert.equal(pickRoamLine('wave', () => 0), ROAM_LINES.wave[0])
})

test('bounds keep him under the header and off the mobile ticket bar', () => {
  const desktop = roamBounds(1280, 800, 72, { mobile: false, map: false })
  assert.ok(desktop.minY >= 100)
  assert.ok(desktop.maxX <= 1280 - 72)
  assert.ok(desktop.maxY <= 800 - 72 - 16)
  assert.ok(desktop.maxX > desktop.minX)
  assert.ok(desktop.maxY > desktop.minY)

  const mobile = roamBounds(390, 844, 56, { mobile: true, map: false })
  assert.ok(844 - 56 - mobile.maxY >= 90)
  assert.ok(mobile.minY >= 100)

  const map = roamBounds(390, 844, 48, { mobile: true, map: true })
  assert.ok(map.minY > mobile.minY)
  assert.ok(map.maxY < mobile.maxY)

  const tiny = roamBounds(40, 40, 72, { mobile: true, map: false })
  assert.ok(tiny.maxX >= tiny.minX)
  assert.ok(tiny.maxY >= tiny.minY)
})

test('walk maths hops, faces the travel direction, and parks on an edge', () => {
  assert.equal(hopArc(0, 3), 0)
  assert.equal(hopArc(1, 3), 0)
  assert.ok(hopArc(0.5 / 3, 3) < -0.9)
  assert.equal(smoothstep(0), 0)
  assert.equal(smoothstep(1), 1)
  assert.ok(moveDuration(10) >= 680)
  assert.ok(moveDuration(10_000) <= 2600)
  assert.ok(hopCount(900) >= 2)
  assert.equal(faceForDelta(-40, 'right'), 'left')
  assert.equal(faceForDelta(40, 'left'), 'right')
  assert.equal(faceForDelta(2, 'left'), 'left')

  const bounds = roamBounds(800, 600, 64, { mobile: false, map: false })
  const left = peekTarget(bounds, 'left', 64, 0.5)
  const right = peekTarget(bounds, 'right', 64, 0.5)
  assert.ok(left.x < 0)
  assert.ok(right.x > bounds.maxX)
  const away = destination(bounds, { x: bounds.minX, y: bounds.minY }, () => 0.9, 80)
  assert.ok(Math.hypot(away.x - bounds.minX, away.y - bounds.minY) >= 80)
})

test('bounce step stays inside the safe box and flips velocity', () => {
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 80 }
  const hit = bounceStep({ x: 100, y: 40 }, { x: 12, y: 0 }, bounds)
  assert.equal(hit.hit, true)
  assert.ok(hit.vel.x < 0)
  assert.ok(hit.pos.x <= 100)
  assert.ok(hit.pos.x >= 0)
  const miss = bounceStep({ x: 40, y: 40 }, { x: 4, y: -3 }, bounds)
  assert.equal(miss.hit, false)
  assert.equal(miss.pos.x, 44)
  assert.equal(miss.pos.y, 37)
})

test('cheer only when the page can scroll and the reader is at the bottom', () => {
  assert.equal(nearPageBottom(0, 800, 820), false)
  assert.equal(nearPageBottom(0, 800, 2000), false)
  assert.equal(nearPageBottom(1200, 800, 2000), true)
})
