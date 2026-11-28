import assert from 'node:assert/strict'
import test from 'node:test'
import { boardEndedCount, boardScanPlan, boardWhere, gatherBoardRows, gatherShapedRow, newBoardGather, type BoardArgs } from './board-feed'

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

test('the scan plan keeps date-bounded board queries exact, however large the set', () => {
  // EventList and the server seed always pass a listSpan dateFrom/dateTo,
  // and their total is printed as an exact number — so a bounded query
  // gathers exactly even when the raw set is far over the threshold.
  const bounded: BoardArgs = { ...args, dateFrom: '2026-12-05', dateTo: '2026-12-05' }
  assert.equal(boardScanPlan(bounded, 50_000).mode, 'exact')
  assert.equal(boardScanPlan(bounded, null).mode, 'exact')
})

test('the scan plan gathers exactly only under the raw threshold when unbounded', () => {
  const unbounded: BoardArgs = { ...args, dateFrom: '', dateTo: '', city: '', search: 'jazz', limit: 6 }
  assert.equal(boardScanPlan(unbounded, 2_000).mode, 'exact')
  const page = boardScanPlan(unbounded, 50_000)
  assert.equal(page.mode, 'page')
  // The suggestions caller (limit 6) needs its page plus one lookahead
  // row — not the whole national set.
  assert.equal(page.needed, 7)
  assert.ok(page.maxRaw < 50_000, 'the page-mode scan budget is below the matching set')
  const search = boardScanPlan({ ...unbounded, limit: 40 }, 50_000)
  assert.equal(search.needed, 41)
})

test('a page-only caller over a large matching set does not full-scan', async () => {
  // A synthetic 50,000-row matching set, served in 300-row chunks. Each
  // row is a distinct showing (unique venue), so shaping keeps them all.
  const RAW_TOTAL = 50_000
  let scanned = 0
  const fetchChunk = async (skip: number, take: number) => {
    const rows = Array.from({ length: Math.min(take, RAW_TOTAL - skip) }, (_, i) => ({ n: skip + i }))
    scanned += rows.length
    return rows
  }
  const shape = (rows: { n: number }[]) => rows.map((r) => gatherRow(`r${r.n}`, { venueName: `Venue ${r.n}`, title: `Show ${r.n}` }))
  const plan = boardScanPlan({ ...args, dateFrom: '', dateTo: '', city: '', search: 'jazz', limit: 6, page: 1 }, RAW_TOTAL)
  const outcome = await gatherBoardRows(fetchChunk as never, shape as never, plan)
  assert.ok(outcome.rows.length >= 7, 'the page plus its lookahead row is gathered')
  assert.ok(scanned <= 300, `one chunk should satisfy the page, scanned ${scanned}`)
  assert.ok(scanned < RAW_TOTAL, 'the full matching set was not scanned')
  assert.equal(outcome.totalExact, false, 'a page-mode total is a lower bound, never presented as exact')
  assert.equal(outcome.hasMore, true)
  assert.equal(outcome.scanTruncated, false)
})

test('an exact gather walks to the end of the set and reports an exact total', async () => {
  const RAW_TOTAL = 650
  const fetchChunk = async (skip: number, take: number) =>
    Array.from({ length: Math.min(take, RAW_TOTAL - skip) }, (_, i) => ({ n: skip + i }))
  const shape = (rows: { n: number }[]) => rows.map((r) => gatherRow(`r${r.n}`, { venueName: `Venue ${r.n}`, title: `Show ${r.n}` }))
  const plan = boardScanPlan({ ...args, dateFrom: '2026-12-05', dateTo: '2026-12-05', limit: 20, page: 1 }, RAW_TOTAL)
  const outcome = await gatherBoardRows(fetchChunk as never, shape as never, plan)
  assert.equal(outcome.rows.length, RAW_TOTAL)
  assert.equal(outcome.totalExact, true)
  assert.equal(outcome.exhausted, true)
  assert.equal(outcome.scanTruncated, false)
})

test('a scan that hits its safety cap flags the total instead of passing it off as exact', async () => {
  // Every chunk is full and shaping drops every row, so the gather can
  // only stop at the cap. The cap must surface as scanTruncated.
  const fetchChunk = async (_skip: number, take: number) => Array.from({ length: take }, (_, i) => ({ n: i }))
  const shape = (_rows: { n: number }[]) => [] as ReturnType<typeof gatherRow>[]
  const plan = { mode: 'exact' as const, needed: Number.POSITIVE_INFINITY, pageEnd: 20, maxRaw: 600, take: 300 }
  const errors: unknown[][] = []
  const originalError = console.error
  console.error = (...a: unknown[]) => { errors.push(a) }
  try {
    const outcome = await gatherBoardRows(fetchChunk as never, shape as never, plan)
    assert.equal(outcome.scanTruncated, true)
    assert.equal(outcome.totalExact, false)
    assert.equal(outcome.scanned, 600)
  } finally {
    console.error = originalError
  }
  assert.equal(errors.length, 1, 'the cap logs instead of truncating silently')
})

test('the ended count is a property of the whole set, not of the pages loaded', () => {
  // Same rule the list renders with: on today's single-day board, a
  // 09:00–10:00 listing is over by midday and a 19:00–20:00 one is not;
  // an all-day listing is not ended. The count comes from the full
  // gathered set, so it cannot change as more pages load.
  const today = '2026-12-05'
  const rows = [
    { date: new Date('2026-12-05T00:00:00Z'), time: '09:00', endTime: '10:00' },
    { date: new Date('2026-12-05T00:00:00Z'), time: '19:00', endTime: '20:00' },
    { date: new Date('2026-12-05T00:00:00Z'), time: null, endTime: null },
  ]
  assert.equal(boardEndedCount(rows, { dateFrom: today, dateTo: today }, today, 12 * 60), 1)
  // On a spanning board each row is judged on its own date: tomorrow's
  // morning listing is upcoming, not ended.
  const spanning = [...rows, { date: new Date('2026-12-06T00:00:00Z'), time: '09:00', endTime: '10:00' }]
  assert.equal(boardEndedCount(spanning, { dateFrom: today, dateTo: '2026-12-06' }, today, 12 * 60), 1)
})
