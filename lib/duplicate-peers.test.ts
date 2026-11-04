import assert from 'node:assert/strict'
import test from 'node:test'
import { duplicateGroupKeys, duplicatePeerClauses, duplicatePeerWhere } from './duplicate-peers'

test('the same listing URL is one group even when the city column disagrees', () => {
  const page = 'https://frontiertouringcom.coredna.site/bensonboone'
  const melbourne = duplicateGroupKeys({
    city: 'Melbourne',
    date: '2026-11-06',
    urls: [page],
  })
  const brisbane = duplicateGroupKeys({
    city: 'Brisbane',
    date: '2026-11-06',
    urls: ['https://www.frontiertouring.com/bensonboone'],
  })
  const shared = melbourne.filter((key) => brisbane.includes(key))
  assert.ok(shared.some((key) => key.startsWith('url:')))
  assert.equal(shared.some((key) => key.startsWith('city:')), false)
})

test('a peer lookup for one city also asks for that URL in every city', () => {
  const where = duplicatePeerWhere({
    city: 'Melbourne',
    date: new Date('2026-11-14T00:00:00.000Z'),
    sourceUrl: 'https://frontiertouringcom.coredna.site/bensonboone',
  })
  assert.equal(where[0].city, 'Melbourne')
  const urlClause = where.find((clause) => !clause.city && clause.OR)
  assert.ok(urlClause)
  assert.equal(urlClause?.date instanceof Date, true)
})

test('repeated touches stay one city-day and one URL on that start', () => {
  const day = new Date('2026-11-14T00:00:00.000Z')
  const later = new Date('2026-11-15T00:00:00.000Z')
  const clauses = duplicatePeerClauses([
    { city: 'Brisbane', date: day, sourceUrl: 'https://frontiertouringcom.coredna.site/khalid' },
    { city: 'Brisbane', date: day, sourceUrl: 'https://www.frontiertouring.com/khalid' },
    { city: 'Melbourne', date: later, sourceUrl: 'https://www.frontiertouring.com/khalid' },
  ])
  const days = clauses.map((clause) => (clause.date as Date).toISOString())
  assert.ok(days.includes(day.toISOString()))
  assert.ok(days.includes(later.toISOString()))
  assert.equal(clauses.filter((clause) => clause.city === 'Brisbane').length, 1)
  assert.equal(clauses.some((clause) => !clause.city && (clause.date as Date).toISOString() === later.toISOString()), true)
})
