import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import rig from './mascot-rig.json'

const MOVING = ['arm-l', 'arm-r', 'leg-l', 'leg-r', 'antenna', 'pupil-l', 'pupil-r'] as const

test('the living rig is a cut of the mascot with a pivot on every limb', () => {
  assert.ok(rig.order.includes('body'))
  assert.ok(rig.order.length >= 10)
  assert.equal(new Set(rig.order).size, rig.order.length)
  for (const id of rig.order) {
    const box = rig.layout[id as keyof typeof rig.layout]
    assert.ok(box, id)
    assert.ok(box.left >= 0 && box.left < 1)
    assert.ok(box.top >= 0 && box.top < 1)
    assert.ok(box.width > 0 && box.width <= 1)
    assert.ok(box.height > 0 && box.height <= 1)
    assert.ok(box.originX >= 0 && box.originX <= 1)
    assert.ok(box.originY >= 0 && box.originY <= 1)
    const file = path.join(process.cwd(), 'public', 'mascot', `${id}.png`)
    assert.equal(existsSync(file), true, file)
    assert.ok(readFileSync(file).length > 500)
  }
  for (const id of MOVING) assert.ok(rig.order.includes(id))
  const arm = rig.layout['arm-r']
  const leg = rig.layout['leg-l']
  assert.ok(arm.originX > 0 && arm.originX < 1)
  assert.ok(leg.top > 0.5, 'legs hang off the lower body')
})
