import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HEAT_FLOOR, heatScore, organicHeat } from './engagement-heat'

const now = new Date('2026-11-03T06:00:00.000Z')

test('a single reaction stays under the floor', () => {
  assert.equal(heatScore([{ day: '2026-11-03', kind: 'REACTION', count: 1 }], now), 0)
  assert.ok(HEAT_FLOOR > 3)
})

test('recent reactions outrank a large old view count', () => {
  const recent = heatScore([
    { day: '2026-11-03', kind: 'REACTION', count: 4 },
    { day: '2026-11-03', kind: 'UNIQUE_VIEW', count: 4 },
  ], now)
  const old = heatScore([
    { day: '2026-09-01', kind: 'VIEW', count: 5000 },
    { day: '2026-10-01', kind: 'VIEW', count: 5000 },
  ], now)
  assert.ok(recent > old)
  assert.equal(old, 0)
})

test('30-day activity counts less than the same activity today', () => {
  const today = heatScore([{ day: '2026-11-03', kind: 'SAVE', count: 12 }], now)
  const month = heatScore([{ day: '2026-10-10', kind: 'SAVE', count: 12 }], now)
  assert.ok(today > month)
  assert.ok(month > 0)
})

test('sponsored cards do not receive heat', () => {
  assert.equal(organicHeat(true, 40), 0)
  assert.equal(organicHeat(false, 40), 40)
})
