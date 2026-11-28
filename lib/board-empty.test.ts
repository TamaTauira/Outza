import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { boardGenuinelyEmpty, quietBoardCopy, selectWeekendPeekRows, WEEKEND_PEEK_FETCH_LIMIT, WEEKEND_PEEK_LIMIT } from './board-empty'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// The quiet-city empty state may only speak when the board's query
// has genuinely returned nothing for the selected city. A load that
// is still running, failed or never landed must keep the board's
// existing loading/error presentation — the difference rides on
// dataKey, which a successful fetch records and a failed one does
// not.

const genuine = {
  city: 'Hobart',
  spanning: false,
  isToday: true,
  loading: false,
  offline: false,
  dataKey: 'k1',
  queryKey: 'k1',
  total: 0,
  heldRows: 0,
}

test('a landed, empty answer for the current query is genuinely empty', () => {
  assert.equal(boardGenuinelyEmpty(genuine), true)
})

test('anything but a landed empty answer is not genuinely empty', () => {
  assert.equal(boardGenuinelyEmpty({ ...genuine, city: '' }), false)
  assert.equal(boardGenuinelyEmpty({ ...genuine, city: null }), false)
  assert.equal(boardGenuinelyEmpty({ ...genuine, spanning: true }), false)
  assert.equal(boardGenuinelyEmpty({ ...genuine, isToday: false }), false)
  assert.equal(boardGenuinelyEmpty({ ...genuine, loading: true }), false)
  assert.equal(boardGenuinelyEmpty({ ...genuine, offline: true }), false)
  // A failed fetch records no key: the held (empty) hand is not this
  // query's answer, however empty it looks.
  assert.equal(boardGenuinelyEmpty({ ...genuine, dataKey: null }), false)
  assert.equal(boardGenuinelyEmpty({ ...genuine, dataKey: 'previous-query' }), false)
  assert.equal(boardGenuinelyEmpty({ ...genuine, queryKey: null }), false)
  assert.equal(boardGenuinelyEmpty({ ...genuine, total: 3 }), false)
  assert.equal(boardGenuinelyEmpty({ ...genuine, heldRows: 2 }), false)
})

// The copy is the owner's approved pattern verbatim: the admission
// varies (today / tonight / a picked category / a search), the
// weekend and Local nudges never do. The place is the board's
// display name, region label and all.

const body = (place: string) =>
  `Peek at the weekend instead; that's when ${place} usually wakes up. And take a peep at VibePeep Local — something might be bubbling up there.`

test('the plain board speaks the approved words', () => {
  assert.deepEqual(quietBoardCopy({ place: 'Hobart', window: 'all' }), {
    headline: `Quiet one in Hobart today — even the city's having a night in.`,
    body: body('Hobart'),
  })
  assert.deepEqual(quietBoardCopy({ place: 'Hobart', window: 'now' }), {
    headline: `Quiet one in Hobart today — even the city's having a night in.`,
    body: body('Hobart'),
  })
})

test('the region label fills both city slots', () => {
  assert.deepEqual(quietBoardCopy({ place: 'Sydney & the NSW Coast', window: 'all' }), {
    headline: `Quiet one in Sydney & the NSW Coast today — even the city's having a night in.`,
    body: body('Sydney & the NSW Coast'),
  })
})

test('the evening window says tonight', () => {
  assert.equal(
    quietBoardCopy({ place: 'Darwin', window: 'evening' }).headline,
    `Quiet one in Darwin tonight — even the city's having a night in.`,
  )
})

test('a picked category names itself in the admission', () => {
  assert.equal(
    quietBoardCopy({ place: 'Canberra', window: 'all', category: 'Live music' }).headline,
    `Quiet one for Live music in Canberra today — even the city's having a night in.`,
  )
  assert.equal(
    quietBoardCopy({ place: 'Canberra', window: 'evening', category: 'Live music' }).headline,
    `Quiet one for Live music in Canberra tonight — even the city's having a night in.`,
  )
})

test('a search names what was searched for, ahead of any category', () => {
  assert.equal(
    quietBoardCopy({ place: 'Perth', window: 'all', search: 'jazz' }).headline,
    `Nothing on for “jazz” in Perth today — even the city's having a night in.`,
  )
  assert.equal(
    quietBoardCopy({ place: 'Perth', window: 'evening', search: 'jazz', category: 'Live music' }).headline,
    `Nothing on for “jazz” in Perth tonight — even the city's having a night in.`,
  )
})

test('a blank search is no search', () => {
  assert.equal(
    quietBoardCopy({ place: 'Perth', window: 'all', search: '   ' }).headline,
    `Quiet one in Perth today — even the city's having a night in.`,
  )
})

// The renderer lives in components/event-list.tsx (QuietBoard); pin
// its shape at source level, in the style of the repo's other source
// pins: the Local call to action is one shared button, rendered by
// BOTH layouts — the weekend preview and the fallback — so the
// fallback's "take a peep at VibePeep Local" is never left as
// unlinked prose with no way to act on it in the emptiest case.
test('both quiet-state layouts render the same Local button', () => {
  const src = read('../components/event-list.tsx')
  const quiet = src.slice(src.indexOf('function QuietBoard'))
  assert.match(quiet, /const localButton = \(/)
  assert.match(quiet, /<a href="\/local"[^>]*>Take a peep at VibePeep Local<\/a>/)
  // Defined once above the branch, rendered once per layout.
  assert.equal(quiet.split('{localButton}').length - 1, 2)
})

// The weekend preview shows upcoming rows only. The feed's hand is
// wider than the preview (WEEKEND_PEEK_FETCH_LIMIT) precisely so the
// selection can drop the rows that have already ended — they cluster
// at the head of the span, the part of today already gone — and
// still fill the preview's slots from what is yet to come.

test('the peek selection drops ended rows and keeps the upcoming order', () => {
  const rows = [
    { id: 'a', ended: true },
    { id: 'b', ended: false },
    { id: 'c', ended: true },
    { id: 'd', ended: false },
  ]
  assert.deepEqual(selectWeekendPeekRows(rows, (r) => r.ended).map((r) => r.id), ['b', 'd'])
})

test('the peek selection fills the preview from beyond a run of ended rows', () => {
  const rows = Array.from({ length: WEEKEND_PEEK_FETCH_LIMIT }, (_, i) => ({ id: `e${i}`, ended: i < 6 }))
  const picked = selectWeekendPeekRows(rows, (r) => r.ended)
  assert.equal(picked.length, WEEKEND_PEEK_LIMIT)
  assert.equal(picked[0].id, 'e6')
})

test('an all-ended weekend selects nothing — the state falls back to headline and copy', () => {
  assert.deepEqual(selectWeekendPeekRows([{ id: 'a', ended: true }, { id: 'b', ended: true }], (r) => r.ended), [])
})

test('the peek fetches a wider hand than it shows', () => {
  assert.ok(WEEKEND_PEEK_FETCH_LIMIT > WEEKEND_PEEK_LIMIT)
})

// The peek's wiring in components/event-list.tsx: it asks the feed
// for the wider hand and stores the selection made through the
// board's own ended test — the live status (through resolveSchedule)
// that EventList hides its own rows by, applied to each row's own
// day exactly as the preview's row rendering applies it.
test('the weekend peek over-fetches and selects through the board ended test', () => {
  const src = read('../components/event-list.tsx')
  assert.match(src, /limit: String\(WEEKEND_PEEK_FETCH_LIMIT\)/)
  assert.match(src, /selectWeekendPeekRows\(result\.data\?\.events \?\? \[\]/)
  assert.match(src, /getStatus\(ev, String\(ev\.date\)\.slice\(0, 10\), today, nowMinutes\)\.tone === 'done'/)
})

// The collapsed homepage preview defers to the quiet state on the
// same predicate: a genuinely empty board is quiet there too, while
// a merely empty window keeps the preview's own empty state, word
// for word.
test('the collapsed preview defers to the quiet state only when genuinely empty', () => {
  const src = read('../components/event-list.tsx')
  const branch = src.slice(src.indexOf('previewFlat.length ? showRows(previewFlat)'))
  const head = branch.slice(0, branch.indexOf('Nothing else in this window'))
  assert.match(head, /quietBoard \?\?/)
  assert.match(branch, /<PeepEmpty title="Crickets\. I checked twice\." body="Nothing else in this window\. Open the full list or loosen a filter\." \/>/)
})
