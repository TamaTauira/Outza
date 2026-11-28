import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactionState, setReaction, type ReactionDb } from './reactions-store'

/**
 * In-memory stand-in for the delegates the reaction store uses, so the store's
 * id resolution and existence checks can be pinned without a database. The
 * store's fire-and-forget engagement and metric bumps still aim at the app
 * client; both already catch and log their own failures, so here they miss
 * quietly and the assertions below only cover the reaction rows themselves.
 */
type FakeRow = { userId: string; subjectId: string; kind: string; updatedAt: Date }

function fakeDb({ events = [], listings = [] }: { events?: string[]; listings?: string[] }) {
  const eventRows: FakeRow[] = []
  const localRows: FakeRow[] = []
  const going: { userId: string; eventId: string }[] = []

  const reactionDelegate = (rows: FakeRow[], key: 'eventId' | 'listingId') => ({
    async groupBy({ where }: any) {
      const counts = new Map<string, number>()
      for (const row of rows) if (row.subjectId === where[key]) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1)
      return [...counts.entries()].map(([kind, n]) => ({ kind, _count: { _all: n } }))
    },
    async findMany({ where }: any) {
      return rows.filter((r) => r.userId === where.userId && r.subjectId === where[key]).map((r) => ({ kind: r.kind }))
    },
    async findUnique({ where }: any) {
      const w = where[`userId_${key}_kind`]
      const row = rows.find((r) => r.userId === w.userId && r.subjectId === w[key] && r.kind === w.kind)
      return row ? { kind: row.kind } : null
    },
    async count({ where }: any) {
      return rows.filter((r) => r.userId === where.userId && r.updatedAt >= where.updatedAt.gte).length
    },
    async create({ data }: any) {
      rows.push({ userId: data.userId, subjectId: data[key], kind: data.kind, updatedAt: new Date() })
      return {}
    },
    async deleteMany({ where }: any) {
      const i = rows.findIndex((r) => r.userId === where.userId && r.subjectId === where[key] && r.kind === where.kind)
      if (i >= 0) rows.splice(i, 1)
      return { count: i >= 0 ? 1 : 0 }
    },
  })

  const db = {
    event: { async findUnique({ where }: any) { return events.includes(where.id) ? { id: where.id } : null } },
    localListing: { async findUnique({ where }: any) { return listings.includes(where.id) ? { id: where.id } : null } },
    eventReaction: reactionDelegate(eventRows, 'eventId'),
    localReaction: reactionDelegate(localRows, 'listingId'),
    attendance: {
      async createMany({ data }: any) {
        for (const d of data) if (!going.some((g) => g.userId === d.userId && g.eventId === d.eventId)) going.push({ userId: d.userId, eventId: d.eventId })
        return { count: data.length }
      },
      async deleteMany({ where }: any) {
        const i = going.findIndex((g) => g.userId === where.userId && g.eventId === where.eventId)
        if (i >= 0) going.splice(i, 1)
        return { count: i >= 0 ? 1 : 0 }
      },
    },
  }
  return { db: db as unknown as ReactionDb, eventRows, localRows, going }
}

test('a local save id resolves to the listing and the reaction sticks', async () => {
  const { db, eventRows, localRows } = fakeDb({ listings: ['lst1'] })
  const added = await setReaction('u1', 'local-lst1-2026-11-28', 'LOVE', true, db)
  assert.equal(added.status, 200)
  if (added.status !== 200 || !('counts' in added)) assert.fail('expected a saved reaction state')
  assert.equal(added.counts.LOVE, 1)
  assert.deepEqual(added.mine, ['LOVE'])
  assert.equal(localRows.length, 1)
  assert.equal(localRows[0].subjectId, 'lst1')
  assert.equal(eventRows.length, 0)

  // The same listing on another date reads the same reactions back.
  const reread = await reactionState('u1', 'local-lst1-2026-12-05', db)
  assert.equal(reread.counts.LOVE, 1)
  assert.deepEqual(reread.mine, ['LOVE'])

  const removed = await setReaction('u1', 'local-lst1-2026-11-28', 'LOVE', false, db)
  assert.equal(removed.status, 200)
  if (removed.status !== 200 || !('counts' in removed)) assert.fail('expected a saved reaction state')
  assert.equal(removed.counts.LOVE, 0)
  assert.equal(localRows.length, 0)
})

test('a local Going is the reaction row itself, with no attendance write', async () => {
  const { db, going } = fakeDb({ listings: ['lst1'] })
  const added = await setReaction('u1', 'local-lst1-2026-11-28', 'GOING', true, db)
  assert.equal(added.status, 200)
  if (added.status !== 200 || !('going' in added)) assert.fail('expected a saved reaction state')
  assert.equal(added.going, true)
  assert.equal(added.counts.GOING, 1)
  assert.equal(going.length, 0)
})

test('a real event id still works, and Going still writes attendance', async () => {
  const { db, eventRows, localRows, going } = fakeDb({ events: ['ev1'] })
  const added = await setReaction('u1', 'ev1', 'GOING', true, db)
  assert.equal(added.status, 200)
  if (added.status !== 200 || !('counts' in added)) assert.fail('expected a saved reaction state')
  assert.equal(added.counts.GOING, 1)
  assert.deepEqual(going, [{ userId: 'u1', eventId: 'ev1' }])
  assert.equal(eventRows.length, 1)
  assert.equal(localRows.length, 0)

  const state = await reactionState('u1', 'ev1', db)
  assert.equal(state.counts.GOING, 1)
  assert.deepEqual(state.mine, ['GOING'])
})

test('a genuinely unknown event id still 404s', async () => {
  const { db } = fakeDb({ events: ['ev1'], listings: ['lst1'] })
  const missed = await setReaction('u1', 'cmunknown000000', 'HOT', true, db)
  assert.equal(missed.status, 404)
  if (missed.status !== 404 || !('error' in missed)) assert.fail('expected a 404 error')
  assert.equal(missed.error, 'Event not found')
})

test('an unknown listing behind a local save id 404s as a listing', async () => {
  const { db } = fakeDb({ listings: ['lst1'] })
  const missed = await setReaction('u1', 'local-nope999-2026-11-28', 'HOT', true, db)
  assert.equal(missed.status, 404)
  if (missed.status !== 404 || !('error' in missed)) assert.fail('expected a 404 error')
  assert.equal(missed.error, 'Listing not found')
})
