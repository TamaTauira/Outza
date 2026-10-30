import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import rig from './mascot-rig.json'

const MOVING = ['arm-l', 'arm-r', 'leg-l', 'leg-r', 'antenna', 'pupil-l', 'pupil-r'] as const

test('the living rig is a jointed figure with shoulders and hips tucked into the body', () => {
  const figure = readFileSync(new URL('../components/vibepeep-figure.tsx', import.meta.url), 'utf8')
  for (const id of ['vp-arm-l', 'vp-arm-r', 'vp-leg-l', 'vp-leg-r', 'vp-ant', 'vp-pupil-l', 'vp-pupil-r', 'vp-side', 'vp-s-arm-f', 'vp-s-leg-f']) {
    assert.ok(figure.includes(id), id)
  }
  assert.equal(figure.includes('/mascot/'), false)
  assert.ok(rig.order.includes('body'))
  assert.equal(new Set(rig.order).size, rig.order.length)
  for (const id of MOVING) assert.ok(rig.order.includes(id))
  for (const id of rig.order) {
    const box = rig.layout[id as keyof typeof rig.layout]
    assert.ok(box, id)
    assert.ok(box.left >= 0 && box.left < 1)
    assert.ok(box.top >= 0 && box.top < 1)
    assert.ok(box.width > 0 && box.width <= 1)
    assert.ok(box.height > 0 && box.height <= 1)
    assert.ok(box.originX >= 0 && box.originX <= 1)
    assert.ok(box.originY >= 0 && box.originY <= 1)
  }
  const arm = rig.layout['arm-l']
  const shoulder = arm.left + arm.width * arm.originX
  assert.ok(shoulder > 0.2 && shoulder < 0.4, 'left arm pivots on the shoulder, not the hand')
  assert.ok(arm.originY < 0.3, 'arms pivot at the shoulder')
  const leg = rig.layout['leg-l']
  assert.ok(leg.top > 0.55, 'legs hang under the body')
  assert.ok(leg.originY < 0.3, 'legs pivot at the hip')
})
