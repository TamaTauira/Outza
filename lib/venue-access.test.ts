import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveVenueParam, venueSearchWhere } from './venue-access'

type Where = { id: string } | { key: string }

test('resolveVenueParam resolves by id without trying the key', async () => {
  const calls: Where[] = []
  const hit = { id: 'v1' }
  const found = await resolveVenueParam('v1', async (where) => {
    calls.push(where)
    return 'id' in where ? hit : null
  })
  assert.equal(found, hit)
  assert.deepEqual(calls, [{ id: 'v1' }])
})

test('resolveVenueParam falls back to the venue key when the id misses', async () => {
  const calls: Where[] = []
  const hit = { id: 'v2' }
  const found = await resolveVenueParam('some-key', async (where) => {
    calls.push(where)
    return 'key' in where ? hit : null
  })
  assert.equal(found, hit)
  assert.deepEqual(calls, [{ id: 'some-key' }, { key: 'some-key' }])
})

test('resolveVenueParam returns null when neither id nor key matches', async () => {
  const found = await resolveVenueParam('nope', async () => null)
  assert.equal(found, null)
})

test('venueSearchWhere needs at least two characters', () => {
  assert.equal(venueSearchWhere(''), null)
  assert.equal(venueSearchWhere('   '), null)
  assert.equal(venueSearchWhere(' a '), null)
})

test('venueSearchWhere matches name, city and address, case-insensitively', () => {
  const where = venueSearchWhere('  opera  ')
  assert.ok(where)
  const fields = where.OR.map((clause) => Object.keys(clause)[0]).sort()
  assert.deepEqual(fields, ['address', 'city', 'name'])
  for (const clause of where.OR) {
    const cond = Object.values(clause)[0] as { contains: string; mode: string }
    assert.equal(cond.contains, 'opera')
    assert.equal(cond.mode, 'insensitive')
  }
})
