import assert from 'node:assert/strict'
import test from 'node:test'
import { boardWhere, gatherShapedRow, newBoardGather, type BoardArgs } from './board-feed'

const args: BoardArgs = {
  page: 1, limit: 20, search: '', categories: [], subTag: '', suburb: '',
  isFree: false, maxPrice: null, isLGBTI: false, dateFrom: '', dateTo: '',
  sortBy: 'date', city: 'Sydney', promoterId: '',
}

test('the board date filter bounds the endsAt branch by the event\u2019s own span', () => {
  const where = boardWhere(args)
  const and = (where.AND ?? []) as any[]
  const clause = and.find((c) => Array.isArray(c?.OR) && c.OR.some((b: any) => b?.date?.gte && Array.isArray(b?.OR)))
  assert.ok(clause, 'the date-eligibility clause exists')
  const [first, second] = clause.OR
  assert.ok(first.date.gte, 'future-dated rows enter on their date')
  assert.ok(second.endsAt.gt, 'the still-running branch keys on a future endsAt')
  const bounds = second.OR as any[]
  assert.ok(bounds.some((b) => b?.endDate?.gte), 'a multi-day endDate inside its span qualifies')
  assert.ok(bounds.some((b) => b?.endDate === null && b?.date?.gte), 'an after-midnight finish from yesterday qualifies')
  // No branch may admit a row on a future endsAt alone.
  const alone = clause.OR.some((b: any) => b?.endsAt?.gt && !b?.date && !b?.OR)
  assert.equal(alone, false)
})

test('the still-running branch reaches back exactly one day and no further', () => {
  // Pins the ~48-hour shape at the SQL level: a no-endDate row dated
  // yesterday with a future endsAt is admitted by this branch (an
  // over-fetch), and isPastEvent in shapeBoard is what drops it. The
  // reach-back is exactly one day from the same today the first branch
  // uses, and the multi-day bound shares that today.
  const where = boardWhere(args)
  const and = (where.AND ?? []) as any[]
  const clause = and.find((c) => Array.isArray(c?.OR) && c.OR.some((b: any) => b?.date?.gte && Array.isArray(b?.OR)))
  assert.ok(clause, 'the date-eligibility clause exists')
  const [first, second] = clause.OR
  const bounds = second.OR as any[]
  const overnight = bounds.find((b) => b?.endDate === null && b?.date?.gte)
  assert.ok(overnight, 'the after-midnight bound exists')
  assert.equal(first.date.gte.getTime() - overnight.date.gte.getTime(), 86_400_000, 'the reach-back is exactly one day')
  const multiDay = bounds.find((b) => b?.endDate?.gte)
  assert.ok(multiDay, 'the multi-day bound exists')
  assert.equal(multiDay.endDate.gte.getTime(), first.date.gte.getTime(), 'the multi-day bound shares the same today')
})

type GatherRow = { id: string; date: Date; time: string | null; city: string; venueName: string; title: string }

const gatherRow = (id: string, over: Partial<GatherRow> = {}): GatherRow => ({
  id,
  date: new Date('2026-12-05T00:00:00Z'),
  time: '19:00',
  city: 'Sydney',
  venueName: 'Enmore Theatre',
  title: 'Gig Night',
  ...over,
})

test('the gather counts each showing once, however the scan chunks fall', () => {
  // The board total is the length of this gathered sequence and the page
  // is a slice of it, so a second copy of a showing — in the same chunk
  // or a later one — must never inflate the count (E2E-17).
  const gather = newBoardGather<GatherRow>()
  assert.equal(gatherShapedRow(gather, gatherRow('a')), true)
  assert.equal(gatherShapedRow(gather, gatherRow('b')), false, 'the same night at the same venue is one listing')
  assert.equal(gatherShapedRow(gather, gatherRow('c', { venueName: 'The Vanguard' })), true)
  assert.equal(gatherShapedRow(gather, gatherRow('a', { title: 'Another Night' })), false, 'a repeated id is one listing')
  assert.equal(gather.rows.length, 2)
  assert.deepEqual(gather.rows.map((r) => r.id), ['a', 'c'])
})

test('the gather still joins showings split across a 45-minute block edge', () => {
  const gather = newBoardGather<GatherRow>()
  assert.equal(gatherShapedRow(gather, gatherRow('a', { time: '19:00' })), true)
  assert.equal(gatherShapedRow(gather, gatherRow('b', { time: '19:44' })), false, '44 minutes apart is the same showing')
  assert.equal(gatherShapedRow(gather, gatherRow('c', { time: '20:30' })), true, '90 minutes apart is a different showing')
})

test('an untimed copy of a timed showing is the same showing, in either order', () => {
  const timedFirst = newBoardGather<GatherRow>()
  assert.equal(gatherShapedRow(timedFirst, gatherRow('a')), true)
  assert.equal(gatherShapedRow(timedFirst, gatherRow('b', { time: null })), false)
  const untimedFirst = newBoardGather<GatherRow>()
  assert.equal(gatherShapedRow(untimedFirst, gatherRow('a', { time: null })), true)
  assert.equal(gatherShapedRow(untimedFirst, gatherRow('b')), false)
})

test('the same showing on another day is a separate listing', () => {
  const gather = newBoardGather<GatherRow>()
  assert.equal(gatherShapedRow(gather, gatherRow('a')), true)
  assert.equal(gatherShapedRow(gather, gatherRow('b', { date: new Date('2026-12-06T00:00:00Z') })), true)
  assert.equal(gather.rows.length, 2)
})

test('a page sliced from the gather is the tail of the sequence the total counts', () => {
  const gather = newBoardGather<GatherRow>()
  const venues = ['Enmore Theatre', 'The Vanguard', 'Metro Theatre', 'Oxford Art Factory', 'The Lansdowne']
  venues.forEach((venueName, i) => gatherShapedRow(gather, gatherRow(`r${i}`, { venueName })))
  const total = gather.rows.length
  const page2 = gather.rows.slice(2, 4)
  assert.equal(total, 5)
  assert.deepEqual(page2.map((r) => r.id), ['r2', 'r3'], 'page 2 continues the same sequence page 1 was counted from')
})
