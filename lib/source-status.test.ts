import assert from 'node:assert/strict'
import test from 'node:test'
import type { PriceFetch, PriceResponse } from './price-lookup'
import {
  jsonLdEventStatus,
  jsonLdEventStatusFor,
  nearStartAction,
  nearStartHideAllowed,
  readSourceStatus,
  NEAR_START_HIDE_CAP_PER_SOURCE,
  type SourceStatusRow,
} from './source-status'

function fetchMap(pages: Record<string, PriceResponse | ((url: string) => PriceResponse)>): PriceFetch {
  return async (req) => {
    const hit = pages[req.url]
    if (!hit) throw new Error(`unexpected fetch ${req.url}`)
    return typeof hit === 'function' ? hit(req.url) : hit
  }
}

const ok = (body: unknown): PriceResponse => ({
  status: 200,
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

const DAY = new Date(Date.UTC(2026, 10, 29))

function row(partial: Partial<SourceStatusRow>): SourceStatusRow {
  return { source: 'eventbrite', ticketUrl: null, sourceUrl: null, date: DAY, ...partial }
}

const EB_PAGE = 'https://www.eventbrite.com.au/e/some-show-tickets-123456789'
const EB_API =
  'https://www.eventbrite.com.au/api/v3/destination/events/?event_ids=123456789&expand=ticket_availability&page_size=1'

test('eventbrite: an empty destination result alone does not prove the occurrence is gone', async () => {
  // Unlisted and draft events drop out of the destination API while their
  // page still resolves. With the page alive, the verdict is unknown.
  const fetch = fetchMap({
    [EB_API]: ok({ events: [] }),
    [EB_PAGE]: ok('<html><body>the listing page</body></html>'),
  })
  assert.equal(await readSourceStatus(row({ sourceUrl: EB_PAGE }), fetch), 'unknown')
})

test('eventbrite: an empty destination result plus a dead listing page means gone', async () => {
  const fetch = fetchMap({
    [EB_API]: ok({ events: [] }),
    [EB_PAGE]: { status: 404, body: null },
  })
  assert.equal(await readSourceStatus(row({ sourceUrl: EB_PAGE }), fetch), 'gone')
})

test('eventbrite: a cancelled occurrence reads as cancelled', async () => {
  const fetch = fetchMap({
    [EB_API]: ok({ events: [{ status: 'canceled', start: { utc: '2026-11-29T09:00:00Z' } }] }),
  })
  assert.equal(await readSourceStatus(row({ sourceUrl: EB_PAGE }), fetch), 'cancelled')
})

test('eventbrite: an ended occurrence reads as ended', async () => {
  const fetch = fetchMap({
    [EB_API]: ok({ events: [{ status: 'completed', start: { utc: '2026-11-29T09:00:00Z' } }] }),
  })
  assert.equal(await readSourceStatus(row({ sourceUrl: EB_PAGE }), fetch), 'ended')
})

test('eventbrite: a live occurrence on the stored day reads as live', async () => {
  const fetch = fetchMap({
    [EB_API]: ok({ events: [{ status: 'live', start: { utc: '2026-11-29T09:00:00Z' } }] }),
  })
  assert.equal(await readSourceStatus(row({ sourceUrl: EB_PAGE }), fetch), 'live')
})

test('eventbrite: a live occurrence moved into the past reads as ended', async () => {
  const fetch = fetchMap({
    [EB_API]: ok({ events: [{ status: 'live', start: { utc: '2026-11-14T09:00:00Z' } }] }),
  })
  assert.equal(await readSourceStatus(row({ sourceUrl: EB_PAGE }), fetch), 'ended')
})

test('eventbrite: an API error proves nothing', async () => {
  const fetch = fetchMap({ [EB_API]: { status: 500, body: null } })
  assert.equal(await readSourceStatus(row({ sourceUrl: EB_PAGE }), fetch), 'unknown')
})

const MX_PAGE = 'https://www.moshtix.com.au/v2/event/some-show/123456'
const MX_API = 'https://api.moshtix.com/v1/graphql'

test('moshtix: a null event means the occurrence is gone', async () => {
  const fetch = fetchMap({ [MX_API]: ok({ data: { viewer: { getEvent: null } } }) })
  assert.equal(await readSourceStatus(row({ source: 'moshtix', sourceUrl: MX_PAGE }), fetch), 'gone')
})

test('moshtix: a present event reads as live', async () => {
  const fetch = fetchMap({ [MX_API]: ok({ data: { viewer: { getEvent: { id: 123456 } } } }) })
  assert.equal(await readSourceStatus(row({ source: 'moshtix', sourceUrl: MX_PAGE }), fetch), 'live')
})

const TM_PAGE = 'https://www.ticketmaster.com.au/event/AB12CD34'
const TM_API = 'https://app.ticketmaster.com/discovery/v2/events/AB12CD34.json?apikey=KEY'

test('ticketmaster: a cancelled status code reads as cancelled', async () => {
  const fetch = fetchMap({ [TM_API]: ok({ dates: { status: { code: 'cancelled' } } }) })
  const status = await readSourceStatus(row({ source: 'ticketmaster', sourceUrl: TM_PAGE }), fetch, {
    ticketmasterKey: 'KEY',
  })
  assert.equal(status, 'cancelled')
})

test('ticketmaster: onsale reads as live, offsale proves nothing', async () => {
  const on = fetchMap({ [TM_API]: ok({ dates: { status: { code: 'onsale' } } }) })
  assert.equal(
    await readSourceStatus(row({ source: 'ticketmaster', sourceUrl: TM_PAGE }), on, { ticketmasterKey: 'KEY' }),
    'live',
  )
  const off = fetchMap({ [TM_API]: ok({ dates: { status: { code: 'offsale' } } }) })
  assert.equal(
    await readSourceStatus(row({ source: 'ticketmaster', sourceUrl: TM_PAGE }), off, { ticketmasterKey: 'KEY' }),
    'unknown',
  )
})

test('ticketmaster: without an API key nothing is claimed', async () => {
  const fetch = fetchMap({})
  const status = await readSourceStatus(row({ source: 'ticketmaster', sourceUrl: TM_PAGE }), fetch)
  assert.equal(status, 'unknown')
})

test('generic: a 404 or 410 page means the occurrence is gone', async () => {
  const gone = fetchMap({ 'https://example.com/show/1': { status: 404, body: null } })
  assert.equal(await readSourceStatus(row({ source: 'curated', sourceUrl: 'https://example.com/show/1' }), gone), 'gone')
  const gone410 = fetchMap({ 'https://example.com/show/1': { status: 410, body: null } })
  assert.equal(
    await readSourceStatus(row({ source: 'curated', sourceUrl: 'https://example.com/show/1' }), gone410),
    'gone',
  )
})

test('generic: a page that loads proves nothing about this occurrence', async () => {
  const fetch = fetchMap({ 'https://example.com/show/1': ok('<html><body>a series page</body></html>') })
  assert.equal(await readSourceStatus(row({ source: 'curated', sourceUrl: 'https://example.com/show/1' }), fetch), 'unknown')
})

test('generic: a JSON-LD EventCancelled for THIS event reads as cancelled', async () => {
  const html =
    '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Some Show","startDate":"2026-11-29T19:00:00","eventStatus":"https://schema.org/EventCancelled"}</script></head></html>'
  const fetch = fetchMap({ 'https://example.com/show/1': ok(html) })
  assert.equal(await readSourceStatus(row({ source: 'curated', sourceUrl: 'https://example.com/show/1' }), fetch), 'cancelled')
})

test('generic: a cancelled JSON-LD sibling on a shared page does not condemn this event', async () => {
  // A tour page carries one JSON-LD node per night. The cancelled node is
  // a different night of the same show; this event's own node is
  // scheduled. Taking the first eventStatus on the page (the old
  // behaviour) would hide every row pointing at the page.
  const html =
    '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[' +
    '{"@type":"Event","name":"Some Show","startDate":"2026-11-22T19:00:00","eventStatus":"https://schema.org/EventCancelled"},' +
    '{"@type":"Event","name":"Some Show","startDate":"2026-11-29T19:00:00","eventStatus":"https://schema.org/EventScheduled"}' +
    ']}</script></head></html>'
  const fetch = fetchMap({ 'https://example.com/show/1': ok(html) })
  assert.equal(await readSourceStatus(row({ source: 'curated', sourceUrl: 'https://example.com/show/1' }), fetch), 'unknown')
})

test('generic: a JSON-LD status with no identity match at all proves nothing', async () => {
  const html =
    '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Another Show Entirely","startDate":"2027-03-05T19:00:00","url":"https://example.com/other","eventStatus":"https://schema.org/EventCancelled"}</script></head></html>'
  const fetch = fetchMap({ 'https://example.com/show/1': ok(html) })
  assert.equal(
    await readSourceStatus(row({ source: 'curated', sourceUrl: 'https://example.com/show/1', title: 'Some Show' }), fetch),
    'unknown',
  )
})

test('conflicting URLs: one definitive negative and one live read is unknown, never a hide', async () => {
  // The source page 404s (gone) but the ticket link's own API still lists
  // the event (live). The two disagree, so nothing may act on either.
  const fetch = fetchMap({
    'https://example.com/show/1': { status: 404, body: null },
    [MX_API]: ok({ data: { viewer: { getEvent: { id: 123456 } } } }),
  })
  const status = await readSourceStatus(
    row({ source: 'moshtix', sourceUrl: 'https://example.com/show/1', ticketUrl: MX_PAGE }),
    fetch,
  )
  assert.equal(status, 'unknown')
  assert.equal(nearStartAction(status), 'flag')
})

test('agreeing URLs: a negative from both reads still acts', async () => {
  const fetch = fetchMap({
    'https://example.com/show/1': { status: 404, body: null },
    'https://example.com/show/2': { status: 410, body: null },
  })
  const status = await readSourceStatus(
    row({ source: 'curated', sourceUrl: 'https://example.com/show/1', ticketUrl: 'https://example.com/show/2' }),
    fetch,
  )
  assert.equal(status, 'gone')
})

test('generic: a blocked page proves nothing', async () => {
  const fetch = fetchMap({ 'https://example.com/show/1': { status: 403, body: null, blocked: true } })
  assert.equal(await readSourceStatus(row({ source: 'curated', sourceUrl: 'https://example.com/show/1' }), fetch), 'unknown')
})

test('humanitix: a missing data payload means the occurrence is gone', async () => {
  const page = 'https://events.humanitix.com/some-show'
  const fetch = fetchMap({ [`${page}/__data.json`]: { status: 404, body: null } })
  assert.equal(await readSourceStatus(row({ source: 'humanitix', sourceUrl: page }), fetch), 'gone')
})

test('jsonLdEventStatus finds a status inside a graph', () => {
  const html =
    '<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"Event","eventStatus":"https://schema.org/EventScheduled"}]}</script>'
  assert.equal(jsonLdEventStatus(html), 'https://schema.org/EventScheduled')
  assert.equal(jsonLdEventStatus('<p>no ld+json here</p>'), null)
})

test('jsonLdEventStatusFor returns the matching node status, not the first on the page', () => {
  const html =
    '<script type="application/ld+json">{"@graph":[' +
    '{"@type":"Event","name":"Some Show","startDate":"2026-11-22T19:00:00","eventStatus":"https://schema.org/EventCancelled"},' +
    '{"@type":"Event","name":"Some Show","startDate":"2026-11-29T19:00:00","eventStatus":"https://schema.org/EventScheduled"}' +
    ']}</script>'
  assert.equal(
    jsonLdEventStatusFor(html, { name: 'Some Show', date: DAY }),
    'https://schema.org/EventScheduled',
  )
  assert.equal(jsonLdEventStatusFor(html, { name: 'Some Show', date: new Date(Date.UTC(2026, 11, 6)) }), null)
  assert.equal(
    jsonLdEventStatusFor(html, { url: 'https://example.com/show/1' }),
    null,
    'no node carries that URL, so no confident match',
  )
})

test('nearStartHideAllowed stops at the per-source cap', () => {
  const hides = new Map<string, number>()
  for (let n = 0; n < NEAR_START_HIDE_CAP_PER_SOURCE; n++) {
    assert.equal(nearStartHideAllowed(hides, 'eventbrite'), true)
    hides.set('eventbrite', (hides.get('eventbrite') ?? 0) + 1)
  }
  assert.equal(nearStartHideAllowed(hides, 'eventbrite'), false, 'cap reached for this source')
  assert.equal(nearStartHideAllowed(hides, 'moshtix'), true, 'other sources keep their own budget')
})

test('nearStartAction only hides on a definitive negative', () => {
  assert.equal(nearStartAction('gone'), 'hide')
  assert.equal(nearStartAction('ended'), 'hide')
  assert.equal(nearStartAction('cancelled'), 'hide')
  assert.equal(nearStartAction('live'), 'verified')
  assert.equal(nearStartAction('unknown'), 'flag')
})
