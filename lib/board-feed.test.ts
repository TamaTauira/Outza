import assert from 'node:assert/strict'
import test from 'node:test'
import { boardWhere, type BoardArgs } from './board-feed'

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
