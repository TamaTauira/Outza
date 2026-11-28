import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { degradedLandingResult, guideListMode, normTitle, presentLocalListings, scanInChunks, shapeLandingEvents, shapeLandingRows, SuburbScanTruncatedError, SUBURB_TOTALS_MEMO_MAX_AGE_MS, suburbCountsFromRows, suburbGuideTotalsFromRows, suburbLinkCount, suburbTotalsFallback, type LandingEvent, type LandingLocal, type LocalRow, type SuburbCountRow } from './seo-server'
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

const loc = (over: Partial<LandingLocal> = {}): LandingLocal => ({
  id: 'l1', title: 'Newtown Markets', category: 'MARKET', description: '', suburb: 'Newtown', address: '1 King St, Newtown',
  startTime: '09:00', endTime: '15:00', priceNote: null, date: '2027-03-06', schedule: 'One-off', recurring: false, organiserName: 'Sam',
  ...over,
})

test('suburb guide totals are the totals the suburb pages print: shaped events plus the page local arm', () => {
  const rows = [
    sub({ id: 'n1', suburb: 'Newtown', title: 'Gig Night', venueName: 'King Street Theatre', venueAddress: '1 King St, Newtown NSW 2042' }),
    sub({ id: 'n2', suburb: 'Newtown', title: 'Gig Night', venueName: 'King Street Theatre', venueAddress: '1 King St, Newtown NSW 2042', source: 'eventbrite' }),
    sub({ id: 'n3', suburb: 'Newtown', title: 'Solo Show', venueName: 'King Street Theatre', venueAddress: '1 King St, Newtown NSW 2042', date: new Date('2027-03-06T00:00:00Z') }),
    sub({ id: 'n4', suburb: 'Newtown', title: 'Past Show', venueName: 'King Street Theatre', venueAddress: '1 King St, Newtown NSW 2042', date: new Date('2020-01-03T00:00:00Z') }),
    sub({ id: 'n5', suburb: 'Newtown', title: 'Gig Night 7 November', venueName: 'King Street Theatre', venueAddress: '1 King St, Newtown NSW 2042' }),
    sub({ id: 'n6', suburb: 'Newtown', title: 'Far Away', venueName: 'Forum Melbourne', venueAddress: '154 Flinders St, Melbourne VIC 3000' }),
    sub({ id: 'e1' }),
    sub({ id: 'e2', suburb: 'enmore', title: 'Third Gig', venueName: 'The Warren', date: new Date('2027-03-07T00:00:00Z') }),
  ]
  const locals = [
    loc({ id: 'l1', title: 'Gig Night', suburb: 'Newtown' }),
    loc({ id: 'l2', title: 'Newtown Markets', suburb: 'Newtown' }),
    loc({ id: 'l3', title: 'Enmore Yoga', suburb: 'Enmore' }),
    loc({ id: 'l4', title: 'Far Thing', suburb: 'Melbourne' }),
  ]
  // The page side, built the way landingData builds a suburb page:
  // landingEvents' shaped rows for the suburb (the shared core, grouped
  // by slug), plus landingLocal's rows for the suburb whose title no
  // shaped event on the page already carries.
  const kept = shapeLandingRows(rows, sydney)
  const pageTotal = (slug: string) => {
    const events = kept.filter((r) => isLandingSuburb(r.suburb, sydney) && slugify(r.suburb) === slug)
    const titles = new Set(events.map((r) => normTitle(r.title ?? '')))
    const localCount = locals.filter((l) => isLandingSuburb(l.suburb, sydney) && slugify(l.suburb) === slug && !titles.has(normTitle(l.title))).length
    return events.length + localCount
  }
  assert.equal(pageTotal('newtown'), 3, 'page construction: duplicate showing collapsed, past, title-mismatched and other-state rows dropped, one local counted, the title-matching local not')
  assert.equal(pageTotal('enmore'), 3, 'page construction: two shaped events plus one local')
  // The events-only count path is the page total minus the local arm.
  assert.deepEqual(
    Object.fromEntries(suburbCountsFromRows(rows, sydney, 1).map((c) => [c.slug, c.count])),
    { enmore: 2, newtown: 2 },
    'the shaped event counts the nav total builds on',
  )
  const totals = suburbGuideTotalsFromRows(rows, locals, sydney, 1)
  assert.deepEqual(
    Object.fromEntries(totals.map((t) => [t.slug, t.count])),
    { newtown: pageTotal('newtown'), enmore: pageTotal('enmore') },
    'the nav total for a suburb equals the total its page prints',
  )
  assert.deepEqual(totals.map((t) => t.slug), ['newtown', 'enmore'], 'equal counts keep scan order (Newtown’s rows came first)')
})

const lr = (over: Record<string, unknown> = {}): LocalRow => ({
  id: 'l1', title: 'Garage Sale', category: 'GARAGE', description: '', suburb: 'Newtown', address: '1 King St, Newtown NSW 2042',
  startDate: '2027-03-06', endDate: null, startTime: '08:00', endTime: '14:00', recurrence: 'NONE', recurUntil: null,
  priceNote: null, organiserName: 'Sam',
  ...over,
} as unknown as LocalRow)

test('presentLocalListings maps next occurrences and shows a repeated listing once', () => {
  const out = presentLocalListings([
    lr({ id: 'a' }),
    lr({ id: 'b', title: 'Later Sale', startDate: '2027-06-05' }),
    lr({ id: 'c' }),
    lr({ id: 'd', title: 'Weekly Yoga', category: 'COMMUNITY', startDate: '2027-02-20', recurrence: 'WEEKLY', startTime: '07:00' }),
  ], 'Sydney', '2027-03-01', '2027-04-30')
  assert.deepEqual(out.map((x) => x.id).sort(), ['a', 'd'], 'the out-of-range listing drops and the identical repeat shows once')
  const weekly = out.find((x) => x.id === 'd')!
  assert.equal(weekly.date, '2027-03-06', 'a weekly listing started before the window maps to its next occurrence inside it')
  assert.equal(weekly.recurring, true)
  assert.equal(out.find((x) => x.id === 'a')!.date, '2027-03-06')
})

test('a failed suburb totals read serves last good totals, marked not ok, for an hour', () => {
  // citySuburbTotals' fail-safe: a failed read (truncated scan,
  // saturated database, failed local read) serves the totals this
  // process last computed — attached to an ok: false result, so no
  // caller mistakes them for a fresh read — while they are under an
  // hour old. Past that they are treated as unavailable: a number that
  // old is not a page's count either.
  const totals = [{ name: 'Newtown', slug: 'newtown', count: 281 }]
  const at = 1_000_000_000_000
  assert.deepEqual(suburbTotalsFallback({ at, totals }, at + 5 * 60 * 1000), { ok: false, totals }, 'fresh last good totals ride along, marked not ok')
  assert.deepEqual(suburbTotalsFallback({ at, totals }, at + SUBURB_TOTALS_MEMO_MAX_AGE_MS), { ok: false, totals }, 'exactly an hour old still serves')
  assert.deepEqual(suburbTotalsFallback({ at, totals }, at + SUBURB_TOTALS_MEMO_MAX_AGE_MS + 1), { ok: false, totals: [] }, 'past an hour the last good totals are unavailable')
  assert.deepEqual(suburbTotalsFallback(undefined, at), { ok: false, totals: [] }, 'a process that never computed totals has nothing to serve')
})

test('suburb link counts come only from the totals read', () => {
  // The number beside a suburb link is the totals read's own: fresh on
  // ok, last good on a failed read that still holds totals, and no
  // count at all when the read holds none. Nothing else is ever
  // substituted — in particular not the guide model's inventory total,
  // which counts stored rows without the pages' showing collapse.
  const fresh = { ok: true, totals: [{ name: 'Newtown', slug: 'newtown', count: 281 }] }
  assert.equal(suburbLinkCount(fresh, 'newtown'), 281)
  assert.equal(suburbLinkCount(fresh, 'enmore'), 0, 'a fresh read is authoritative: a suburb it does not list counts 0')
  const lastGood = { ok: false, totals: fresh.totals }
  assert.equal(suburbLinkCount(lastGood, 'newtown'), 281, 'a failed read still prints its last good totals')
  assert.equal(suburbLinkCount(lastGood, 'enmore'), null, 'a suburb missing from last good totals gets no count: last good may predate it')
  assert.equal(suburbLinkCount({ ok: false, totals: [] }, 'newtown'), null, 'a failed read with nothing kept prints no count')
})

test('suburb link counts never fall back to the guide model total', () => {
  // The guide model's suburb totals (d.total) count stored rows with
  // no showing collapse, so they disagree with the suburb pages by
  // design. #324 moved the nav to citySuburbTotals but left d.total as
  // the fallback when that read failed — and the read fails on any
  // cold process under saturation, so the model number kept printing
  // beside the links (Newtown labelled 292 over a page printing 280).
  // Pin both renderers to the totals read at source level, the way the
  // GuideLanding caller set is pinned above: no CI step type-checks,
  // and the substitution is a one-line regression.
  const root = fileURLToPath(new URL('../', import.meta.url))
  const regions: Record<string, [string, string]> = {
    'app/[city]/[topic]/page.tsx': ['const pageCount', 'const origin'],
    'lib/combo-page.tsx': ['suburbs={', 'guides={'],
  }
  for (const [path, [from, to]] of Object.entries(regions)) {
    const src = readFileSync(join(root, path), 'utf8')
    const start = src.indexOf(from)
    assert.notEqual(start, -1, `${path}: the suburb link construction is where this test expects it`)
    const region = src.slice(start, src.indexOf(to, start))
    assert.match(region, /suburbLinkCount\(/, `${path} takes its suburb link counts from the totals read`)
    assert.doesNotMatch(region, /d\.total/, `${path} must not fall back to the guide model total for a suburb count`)
  }
  const landing = readFileSync(join(root, 'components/guide-landing.tsx'), 'utf8')
  assert.match(landing, /count: number \| null/, 'GuideLanding admits a suburb link with no count')
  assert.match(landing, /s\.count !== null/, 'GuideLanding renders the count only when one is supplied')
})
