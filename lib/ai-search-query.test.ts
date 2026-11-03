import assert from 'node:assert/strict'
import { test } from 'node:test'
import { askCandidateTake, askDateBounds, askTextWhere } from './ai-search-query'
import { SANS_BOLD_UPPER, styleLetters } from './search-fold'

function flagIsRequired(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(flagIsRequired)
  const rec = node as Record<string, unknown>
  if (Array.isArray(rec.AND)) return rec.AND.some(flagIsRequired)
  if (Array.isArray(rec.OR)) return rec.OR.length > 0 && rec.OR.every(flagIsRequired)
  return rec.isLGBTI === true
}

test('inferred LGBTIQ+ widens the query instead of requiring the flag', () => {
  const where = askTextWhere(['gay'], true)
  assert.equal(flagIsRequired(where), false)
  const blob = JSON.stringify(where)
  assert.match(blob, /"isLGBTI":true/)
  assert.ok(blob.includes(styleLetters('GAY', SANS_BOLD_UPPER)))
  assert.match(blob, /"contains":"gay"/)
  assert.match(blob, /"description"/)

  const jazz = askTextWhere(['jazz'], false)
  assert.equal(JSON.stringify(jazz).includes('isLGBTI'), false)
  assert.equal(flagIsRequired(askTextWhere(['jazz', 'gay'], true)), false)
})

test('a named year includes the first morning and the last night', () => {
  const bounds = askDateBounds('2027-01-01', '2027-12-31')
  const inside = (day: string) => {
    const t = new Date(`${day}T00:00:00.000Z`).getTime()
    return t >= bounds.gte.getTime() && t <= bounds.lte.getTime()
  }
  assert.equal(inside('2027-01-01'), true)
  assert.equal(inside('2027-03-06'), true)
  assert.equal(inside('2027-12-31'), true)
  assert.equal(inside('2026-12-31'), false)
  assert.equal(inside('2028-01-01'), false)
  assert.ok(askCandidateTake('2027-01-01', '2027-12-31') > 80)
  assert.equal(askCandidateTake('2026-11-03', '2026-11-03'), 80)
})
