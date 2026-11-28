import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { degradedLandingResult, guideListMode, scanInChunks, shapeLandingEvents, shapeLandingRows, SuburbScanTruncatedError, suburbCountsFromRows, type LandingEvent, type SuburbCountRow } from './seo-server'
import { cityDef } from './cities'
import { isDbSaturation } from './db-guard'
import { isLandingSuburb, slugify } from './seo'

const sydney = cityDef('Sydney')

test('scanInChunks walks the whole set in board-sized chunks', async () => {
  const all = Array.from({ length: 650 }, (_, i) => i)
  const calls: number[] = []
  const { rows, truncated } = await scanInChunks(async (skip, take) => {
    calls.push(skip)
    return all.slice(skip, skip + take)
  })
  assert.equal(rows.length, 650)
  assert.equal(truncated, false)
  assert.deepEqual(calls, [0, 300, 600], 'chunks are the board scan size, stopping at the first short chunk')
})

test('scanInChunks flags a capped scan instead of passing a partial count as exact', async () => {
  const { rows, truncated } = await scanInChunks(async (_skip, take) => Array.from({ length: take }, () => 1))
  assert.equal(truncated, true)
  assert.equal(rows.length, 60_000, 'the cap is the board exact-gather cap')
})

test('a truncated guide gather returns the degraded result, not the partial shaped count', () => {
  // landingEvents returns this when its gather is capped — the same
  // shape its DB-saturation catch returns — because every guide surface
  // prints a positive total as exact (the headline and mobile count
  // lines, "Showing the next N of TOTAL", the meta description, the FAQ
  // facts, JSON-LD numberOfItems) and none of them suppress a number on
  // the degraded flag alone.
  const r = degradedLandingResult('2027-03-05', null)
  assert.equal(r.degraded, true)
  assert.equal(r.total, 0, 'no total, so no surface can print the partial count as fact')
  assert.deepEqual(r.events, [])
  assert.equal(r.titles.size, 0)
  assert.equal(r.from, '2027-03-05')
  assert.equal(r.to, null)
})

test('a truncated suburb scan is a distinct fail-safe from DB saturation', () => {
  const err = new SuburbScanTruncatedError('Sydney')
  assert.match(err.message, /Sydney/)
  assert.equal(isDbSaturation(err), false, 'the truncation fail-safe is not the saturation one: partial counts are discarded, not served')
})

const ev = (over: Record<string, unknown> = {}): LandingEvent => ({
  id: 'a', title: 'Gig Night', date: new Date('2027-03-05T00:00:00Z'), endDate: null, time: '19:00', endTime: null,
  venueName: 'Enmore Theatre', venueAddress: '118-132 Enmore Rd, Enmore NSW 2042', suburb: 'Enmore',
  category: 'Music', subTags: [], isLGBTI: false, isFree: false, price: null, priceMin: null, priceMax: null,
  imageUrl: null, ticketUrl: null, status: 'SCHEDULED', latitude: null, longitude: null,
  organiserName: null, organiserUrl: null, city: 'Sydney', source: 'ticketmaster', sources: [],
  lastVerifiedAt: null, statusSource: null, duplicateOfId: null,
  ...over,
} as unknown as LandingEvent)

test('the guide total counts shaped rows: duplicates collapse, past, mis-filed and title-mismatched rows drop', () => {
  // landingEvents' total is the length of this shaped sequence and the
  // page is a slice of it, so the printed total can never exceed what
  // the list can show (the guide counterpart of the board's E2E-17 fix).
  const shaped = shapeLandingEvents([
    ev({ id: 'a' }),
    ev({ id: 'b' }),
    ev({ id: 'c', venueName: 'The Vanguard', title: 'Other Gig' }),
    ev({ id: 'd', title: 'Old Gig', date: new Date('2020-01-03T00:00:00Z') }),
    ev({ id: 'e', title: 'Far Away', venueName: 'Forum Melbourne', venueAddress: '154 Flinders St, Melbourne VIC 3000', suburb: 'Melbourne' }),
    ev({ id: 'f', title: 'Gig Night 7 November' }),
  ], sydney)
  assert.deepEqual(shaped.map((e) => e.id), ['a', 'c'], 'one row per showing; the past, other-state and wrong-date rows are not counted')
})

const sub = (over: Record<string, unknown> = {}): SuburbCountRow => ({
  id: 'a', title: 'Gig Night', date: new Date('2027-03-05T00:00:00Z'), endDate: null, time: '19:00', endTime: null,
  endsAt: null, allDay: false, venueName: 'Enmore Theatre', venueAddress: '118-132 Enmore Rd, Enmore NSW 2042',
  suburb: 'Enmore', city: 'Sydney', ticketUrl: null, source: 'ticketmaster', description: null,
  ...over,
} as unknown as SuburbCountRow)

test('suburb counts count showings the suburb page can show, not stored rows', () => {
  const counts = suburbCountsFromRows([
    sub({ id: 'a' }),
    sub({ id: 'b' }),
    sub({ id: 'c', title: 'Other Gig', venueName: 'The Vanguard' }),
    sub({ id: 'f', suburb: 'enmore', title: 'Third Gig', venueName: 'The Warren' }),
    sub({ id: 'd', suburb: 'newtown', title: 'Solo Show', venueName: 'King Street Theatre' }),
    sub({ id: 'e', suburb: 'Newtown', title: 'Past Show', date: new Date('2020-01-03T00:00:00Z') }),
  ], sydney, 1)
  assert.deepEqual(counts, [
    { name: 'Enmore', slug: 'enmore', count: 3 },
    { name: 'newtown', slug: 'newtown', count: 1 },
  ], 'duplicate showings collapse, casing variants share a slug, and the past row is not counted')
  assert.deepEqual(suburbCountsFromRows([sub({ id: 'a' })], sydney, 3), [], 'the minimum still applies to the shaped count')
})

test('suburb counts group exactly the rows the shared shaping core keeps', () => {
  const rows = [
    sub({ id: 'a' }),
    sub({ id: 'b' }),
    sub({ id: 'c', title: 'Other Gig', venueName: 'The Vanguard' }),
    sub({ id: 'd', suburb: 'Newtown', title: 'Solo Show', venueName: 'King Street Theatre' }),
    sub({ id: 'e', suburb: 'Newtown', title: 'Past Show', date: new Date('2020-01-03T00:00:00Z') }),
    sub({ id: 'f', suburb: 'Melbourne', title: 'Far Away', venueName: 'Forum Melbourne', venueAddress: '154 Flinders St, Melbourne VIC 3000' }),
    sub({ id: 'g', title: 'Gig Night 7 November' }),
    sub({ id: 'h', suburb: 'Sydney', title: 'City Show', venueName: 'City Recital Hall', venueAddress: '2 Angel Place, Sydney NSW 2000' }),
  ]
  // The expected counts are derived from the shared core itself, grouped
  // the way suburbCountsFromRows documents (landing suburbs only, by
  // slug, minimum applied): the core drops the past row, the other-state
  // row and the title/date-mismatched row, collapses the duplicate
  // showing, and keeps the city-named row that is not a landing suburb.
  // If the count path ever re-inlines its own drops and collapse and
  // they drift from the core, this fails.
  const kept = shapeLandingRows(rows, sydney)
  const bySlug = new Map<string, { name: string; slug: string; count: number }>()
  for (const r of kept) {
    if (!isLandingSuburb(r.suburb, sydney)) continue
    const slug = slugify(r.suburb)
    const cur = bySlug.get(slug)
    bySlug.set(slug, { name: cur?.name ?? r.suburb, slug, count: (cur?.count ?? 0) + 1 })
  }
  const expected = [...bySlug.values()].filter((c) => c.count >= 1).sort((a, b) => b.count - a.count)
  assert.deepEqual(expected.map((c) => [c.slug, c.count]), [['enmore', 2], ['newtown', 1]], 'the core kept the collapsed Enmore pair plus one, and the Newtown solo')
  assert.deepEqual(suburbCountsFromRows(rows, sydney, 1), expected, 'the count path counts the shared core’s rows, grouped by suburb slug')
})

test('guide list section: a failed read omits the section instead of claiming an empty city', () => {
  // The degraded result is what landingEvents returns when the gather is
  // capped or the DB is saturated: no listings and no total. GuideLanding
  // must not dress that in the "It's quiet" empty state — a load failure
  // is not an empty city — so the section is omitted for that render.
  const r = degradedLandingResult('2027-03-05', null)
  assert.equal(guideListMode({ events: r.events.length, local: 0, total: r.total, degraded: r.degraded }), 'omitted')
  assert.equal(guideListMode({ events: 0, local: 0, total: 0, degraded: true }), 'omitted')
})

test('guide list section: a successful read that found nothing keeps the empty state', () => {
  assert.equal(guideListMode({ events: 0, local: 0, total: 0, degraded: false }), 'empty')
  assert.equal(guideListMode({ events: 0, local: 0, total: 0 }), 'empty', 'an absent degraded flag is a successful read')
})

test('guide list section: any listings render as a list, even if the read also degraded', () => {
  assert.equal(guideListMode({ events: 3, local: 0, total: 3, degraded: false }), 'list')
  assert.equal(guideListMode({ events: 0, local: 2, total: 2, degraded: false }), 'list')
  assert.equal(guideListMode({ events: 3, local: 0, total: 3, degraded: true }), 'list', 'what a degraded read still holds is shown, not hidden')
})

test('guide list section: a positive total with no listings never renders the empty state', () => {
  // The headline prints a positive total as an exact count of upcoming
  // events; the empty state claims there are none. The two must never
  // share a render, whatever produced the mismatch.
  assert.equal(guideListMode({ events: 0, local: 0, total: 10131, degraded: false }), 'omitted')
})

test('every GuideLanding call site passes its read’s degraded flag', () => {
  // The degraded prop is required by GuideLanding's props type, but no CI
  // step type-checks (next.config.js sets typescript.ignoreBuildErrors and
  // ci.yml runs only yarn test and the browser build), so a call site that
  // omits it still compiles — and renders a failed read as an empty city.
  // That is exactly how the combo pages slipped through. Pin the caller
  // set and the prop at source level: a new caller fails here until it
  // passes a real degraded value and is added to the list below.
  const root = fileURLToPath(new URL('../', import.meta.url))
  const callers = new Map<string, string>()
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) { walk(abs); continue }
      if (!/\.tsx?$/.test(name) || /\.(test|spec)\.tsx?$/.test(name) || name.endsWith('.d.ts')) continue
      const src = readFileSync(abs, 'utf8')
      if (src.includes('<GuideLanding')) callers.set(relative(root, abs).split('\\').join('/'), src)
    }
  }
  walk(root)
  assert.deepEqual([...callers.keys()].sort(), [
    'app/[city]/[topic]/page.tsx',
    'lib/combo-page.tsx',
    'lib/season-page.tsx',
  ], 'the GuideLanding caller set is exactly the topic, combo and season pages')
  for (const [path, src] of callers) {
    const start = src.indexOf('<GuideLanding')
    const block = src.slice(start, src.indexOf('/>', start))
    assert.match(block, /degraded=\{/, `${path} must pass its read’s degraded flag to GuideLanding`)
  }
})
