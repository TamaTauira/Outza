import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { cosListedPrice } from './cos-event'
import { PRICE_ENRICH_BUDGET_MS, groupTargets, resolveEventPrice, type PriceFetch, type PriceResponse } from './price-lookup'
import { explicitAdmissionPrice, humanitixPayloadPrice, humanitixTicketsHtml, jsonLdPrice, oztixSaysFree, pagePrice, ticketCtas } from './price-read'
import { REFRESH_CHUNKS } from './refresh-plan'
import { priceSummary } from './quality'

const humanitixBody = JSON.stringify({
  type: 'data',
  nodes: [{
    type: 'data',
    data: [
      { event: 1, eventJsonSchema: 2 },
      { eventSlug: 3, title: 4, published: 5, public: 5, showDraft: 6, dates: 7, location: 8, eventHasPassed: 6 },
      '{"@type":"Event","offers":{"@type":"AggregateOffer","lowPrice":"30","highPrice":"125","priceCurrency":"AUD"}}',
      'broadway-dance-class-with-minnie-cooper',
      'BROADWAY DANCE CLASS WITH MINNIE COOPER',
      true,
      false,
      { startDate: 9 },
      { venueName: 10 },
      '2026-11-24T08:00:00.000Z',
      'Beresford Hotel',
    ],
  }],
})

function fetchMap(pages: Record<string, PriceResponse | ((url: string) => PriceResponse)>): PriceFetch {
  return async (req) => {
    const hit = pages[req.url]
    if (!hit) throw new Error(`unexpected fetch ${req.url}`)
    return typeof hit === 'function' ? hit(req.url) : hit
  }
}

test('price lookup stays outside the listings refresh', () => {
  assert.equal(REFRESH_CHUNKS.some((chunk) => chunk.id === 'price-enrich'), false)
  assert.equal(REFRESH_CHUNKS.find((chunk) => chunk.id === 'finalize')?.budgetMs, 150_000)
  assert.equal(REFRESH_CHUNKS.find((chunk) => chunk.id === 'finalize')?.minute, 23)
  assert.ok(PRICE_ENRICH_BUDGET_MS <= 90_000)
})

test('price enrich does not build an index on the request path', () => {
  const src = readFileSync(new URL('./price-enrich.ts', import.meta.url), 'utf8')
  assert.equal(src.includes('CREATE INDEX'), false)
  assert.match(src, /CONCURRENCY = 1/)
  assert.match(src, /withStatementTimeout/)
})

test('humanitix payload prices are a range, and a class fee in prose is kept', () => {
  const parsed = humanitixPayloadPrice(humanitixBody)
  assert.equal(parsed.event, true)
  assert.equal(parsed.read?.price, '$30 – $125')
  assert.equal(explicitAdmissionPrice('Small group • $22 per class, pay on the spot')?.price, '$22')
  assert.equal(explicitAdmissionPrice('step-free entry and free parking'), null)
  assert.equal(explicitAdmissionPrice('From $25')?.price, 'From $25')
})

test('a humanitix tickets page supplies the price the event payload omitted', () => {
  const paid = '{"@type":"Offer",name:"1 class",price:30,availability:"InStock"},{"@type":"Offer",name:"5 classes at $25 each",price:125,availability:"InStock"}'
  assert.equal(humanitixTicketsHtml(paid)?.price, '$30 – $125')
  const shown = 'displayPrice:"$27.50" displayPrice:"$22.00" {"@type":"Offer",name:"Adult",price:25}'
  assert.equal(humanitixTicketsHtml(shown)?.price, '$22 – $27.50')
  assert.equal(humanitixTicketsHtml('displayPrice:"$1,100.00"')?.price, '$1100')
  const free = '<span class="price-label">Free </span> {"@type":"Offer",name:"By donation on the day",price:0} displayPrice:"Free"'
  assert.equal(humanitixTicketsHtml(free)?.isFree, true)
  assert.equal(humanitixTicketsHtml('{"@type":"Offer",name:"By donation",price:0}'), null)
})

test('json-ld, oztix free and ticket buttons', () => {
  const html = `<script type="application/ld+json">{"@type":"MusicEvent","name":"Show","offers":{"@type":"AggregateOffer","lowPrice":"40","highPrice":"60"}}</script>
    <a href="https://premier.ticketek.com.au/shows/show.aspx">Get tickets</a>
    <a href="https://events.humanitix.com/a-real-show">Buy tickets</a>
    <div class="event-tag">Free Event</div>`
  assert.equal(jsonLdPrice(html)?.price, '$40 – $60')
  assert.equal(oztixSaysFree(html), true)
  assert.deepEqual(ticketCtas(html, 'https://example.com/event'), ['https://events.humanitix.com/a-real-show'])
  assert.equal(pagePrice('<script type="application/ld+json">{"@type":"Event","isAccessibleForFree":true}</script>')?.price, 'Free')
  assert.equal(pagePrice('<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"context":{"seo":{"offersSchema":[{"lowPrice":"0.0","highPrice":"0.0"}]}}}}}</script>')?.price ?? null, null)
})

test('city of sydney min and max are used when the price rows are empty', () => {
  assert.equal(cosListedPrice({ minPrice: 262.5, maxPrice: 325 }), '$262.50 – $325')
  assert.equal(cosListedPrice({ prices: [{ category: 'Adult', value: '325.00' }, { category: 'Concession', value: '262.50' }] }), '$262.50 – $325')
  assert.equal(priceSummary({ isFree: false, price: 'From $25', priceMin: 25, priceMax: 25 }).range, 'From $25')
})

test('same ticket url is one lookup, and ticketek is not fetched', async () => {
  const groups = groupTargets([
    { id: 'a', source: 'humanitix', title: 'Class', ticketUrl: 'https://events.humanitix.com/broadway-dance-class-with-minnie-cooper', sourceUrl: 'https://events.humanitix.com/broadway-dance-class-with-minnie-cooper', date: new Date('2026-11-18') },
    { id: 'b', source: 'humanitix', title: 'Class', ticketUrl: 'https://events.humanitix.com/broadway-dance-class-with-minnie-cooper/', sourceUrl: null, date: new Date('2026-11-24') },
  ])
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].ids, ['a', 'b'])

  let calls = 0
  const fetch = fetchMap({
    'https://events.humanitix.com/broadway-dance-class-with-minnie-cooper/__data.json': { status: 200, body: humanitixBody },
  })
  const wrapped: PriceFetch = async (req) => {
    calls += 1
    assert.equal(req.url.includes('ticketek'), false)
    return fetch(req)
  }
  const priced = await resolveEventPrice({
    source: 'humanitix',
    title: 'BROADWAY DANCE CLASS WITH MINNIE COOPER',
    ticketUrl: 'https://events.humanitix.com/broadway-dance-class-with-minnie-cooper',
    sourceUrl: 'https://events.humanitix.com/broadway-dance-class-with-minnie-cooper',
  }, wrapped)
  assert.equal(priced.price, '$30 – $125')
  assert.equal(priced.isFree, false)
  assert.equal(calls, 1)

  const ticketek = await resolveEventPrice({
    source: 'frontier',
    title: 'Tour',
    ticketUrl: 'https://premier.ticketek.com.au/shows/example',
    sourceUrl: null,
  }, async () => { throw new Error('ticketek was fetched') })
  assert.equal(ticketek.price, null)
  assert.match(ticketek.reason ?? '', /Ticketek/)
})

test('a source page with no price follows the ticket button, and a blocked page is retried later', async () => {
  const fetch = fetchMap({
    'https://venue.example/class': {
      status: 200,
      body: '<a href="https://events.humanitix.com/broadway-dance-class-with-minnie-cooper">Get tickets</a>',
    },
    'https://events.humanitix.com/broadway-dance-class-with-minnie-cooper/__data.json': { status: 200, body: humanitixBody },
  })
  const followed = await resolveEventPrice({
    source: 'cityofsydney',
    title: 'Class',
    ticketUrl: null,
    sourceUrl: 'https://venue.example/class',
  }, fetch)
  assert.equal(followed.price, '$30 – $125')
  assert.equal(followed.ticketPage, 'https://events.humanitix.com/broadway-dance-class-with-minnie-cooper')

  const blocked = await resolveEventPrice({
    source: 'moshtix',
    title: 'Night',
    ticketUrl: 'https://www.moshtix.com.au/v2/event/oracle-nights/202018',
    sourceUrl: 'https://www.moshtix.com.au/v2/event/oracle-nights/202018',
  }, async (req) => {
    if (req.url.includes('graphql')) {
      return { status: 200, body: JSON.stringify({ data: { viewer: { getEvent: { id: 202018 }, getTicketTypes: { items: [] } } } }) }
    }
    return { status: 403, body: '{"response":"block"}', blocked: true }
  })
  assert.equal(blocked.price, null)
  assert.match(blocked.reason ?? '', /blocked|Moshtix/)
})

test('eventbrite pay-on-arrival text is the price, and a zero offer is not free', async () => {
  const id = '1997817699519'
  const page = 'https://www.eventbrite.com.au/e/yoga-practice-in-chatswood-tickets-1997817699519'
  const outcome = await resolveEventPrice({
    source: 'eventbrite',
    title: 'Yoga Practice in Chatswood',
    ticketUrl: page,
    sourceUrl: page,
  }, async (req) => {
    if (req.url.includes('destination/events')) {
      return { status: 200, body: JSON.stringify({ events: [{ ticket_availability: { is_free: false, minimum_ticket_price: null, maximum_ticket_price: null } }] }) }
    }
    return { status: 200, body: '<p>Small group • $22 per class, pay on the spot</p>' }
  })
  assert.equal(outcome.price, '$22')
  assert.equal(outcome.ticketPage, page)
  assert.ok(id)
})
