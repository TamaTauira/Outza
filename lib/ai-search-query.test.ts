import assert from 'node:assert/strict'
import { test } from 'node:test'
import { askCandidateTake, askDateBounds, askNotEndedTodayWhere, askPublicVisibilityAnd, askTextWhere } from './ai-search-query'
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
  assert.match(blob, /"title"/)
  assert.equal(blob.includes('"description"'), false)

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

type EndedRow = { date: Date; time: string | null }

function dateMatches(value: Date, cond: Record<string, unknown>): boolean {
  const t = value.getTime()
  if (cond.gt instanceof Date && !(t > cond.gt.getTime())) return false
  if (cond.gte instanceof Date && !(t >= cond.gte.getTime())) return false
  if (cond.lte instanceof Date && !(t <= cond.lte.getTime())) return false
  if (cond.lt instanceof Date && !(t < cond.lt.getTime())) return false
  return true
}

/** Interprets the shape askNotEndedTodayWhere builds, the way the SQL would. */
function notEndedMatches(node: unknown, row: EndedRow): boolean {
  if (!node || typeof node !== 'object') return false
  const rec = node as Record<string, unknown>
  let ok = true
  if (Array.isArray(rec.OR)) ok = ok && rec.OR.some((child) => notEndedMatches(child, row))
  if (Array.isArray(rec.AND)) ok = ok && rec.AND.every((child) => notEndedMatches(child, row))
  if (rec.date && typeof rec.date === 'object') ok = ok && dateMatches(row.date, rec.date as Record<string, unknown>)
  if ('time' in rec) {
    const cond = rec.time
    if (cond === null) ok = ok && row.time === null
    else if (cond && typeof cond === 'object') {
      const gte = (cond as Record<string, unknown>).gte
      ok = ok && row.time !== null && typeof gte === 'string' && row.time >= gte
    }
  }
  return ok
}

test('the ended-today SQL condition mirrors the route post-filter', () => {
  const today = '2026-11-28'
  // 18:00 now, so the post-filter drops today's rows started before 17:00.
  const where = askNotEndedTodayWhere(today, 18 * 60)
  const at = (day: string, time: string | null): EndedRow => ({ date: new Date(`${day}T00:00:00.000Z`), time })
  // The threshold in the where is now − 60 minutes, the post-filter's cut-off.
  assert.ok(JSON.stringify(where).includes('"gte":"17:00"'))
  assert.equal(notEndedMatches(where, at(today, '19:30')), true) // later today is in
  assert.equal(notEndedMatches(where, at(today, '17:00')), true) // exactly at the cut-off is in
  assert.equal(notEndedMatches(where, at(today, '16:59')), false) // started 61 minutes ago is out
  assert.equal(notEndedMatches(where, at(today, '09:00')), false) // this morning's finished event is out
  assert.equal(notEndedMatches(where, at(today, null)), true) // untimed today is in
  assert.equal(notEndedMatches(where, at('2026-11-29', '00:05')), true) // tomorrow is in
  assert.equal(notEndedMatches(where, at('2026-12-11', '09:00')), true) // later in the window is in
})

test('before 1am the ended-today condition admits all of today, like the post-filter', () => {
  const where = askNotEndedTodayWhere('2026-11-28', 30)
  const at = (time: string | null): EndedRow => ({ date: new Date('2026-11-28T00:00:00.000Z'), time })
  assert.equal(notEndedMatches(where, at('00:00')), true)
  assert.equal(notEndedMatches(where, at('00:29')), true)
  assert.equal(notEndedMatches(where, at(null)), true)
})

type VisibilityRow = { deletedAt: Date | null; hidden: boolean; approvalState: string | null }

/** Interprets the arms askPublicVisibilityAnd builds, the way the SQL would. */
function visibilityMatches(arms: unknown, row: VisibilityRow): boolean {
  if (!Array.isArray(arms)) return false
  return arms.every((arm) => {
    const rec = arm as Record<string, unknown>
    if ('deletedAt' in rec) return row.deletedAt === rec.deletedAt
    if ('hidden' in rec) return row.hidden === rec.hidden
    if (Array.isArray(rec.OR)) {
      return rec.OR.some((child) => row.approvalState === (child as Record<string, unknown>).approvalState)
    }
    return false
  })
}

test('the public-visibility arms keep hidden listings out of Ask', () => {
  const arms = askPublicVisibilityAnd()
  // The hidden arm is in the built where itself, not just implied by a
  // neighbouring condition — it is the arm the route used to lack.
  assert.ok(JSON.stringify(arms).includes('"hidden":false'))
  const row = (over: Partial<VisibilityRow>): VisibilityRow => ({ deletedAt: null, hidden: false, approvalState: null, ...over })
  assert.equal(visibilityMatches(arms, row({})), true) // a public listing is in
  assert.equal(visibilityMatches(arms, row({ approvalState: 'APPROVED' })), true)
  assert.equal(visibilityMatches(arms, row({ hidden: true })), false) // a pre-verification draft stays out
  assert.equal(visibilityMatches(arms, row({ hidden: true, approvalState: 'APPROVED' })), false) // approval does not unhide
  assert.equal(visibilityMatches(arms, row({ deletedAt: new Date() })), false) // soft-deleted stays out
  assert.equal(visibilityMatches(arms, row({ approvalState: 'PENDING' })), false) // unapproved stays out
})
