import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bccEventPageUrl, eventOutbound, humanitixEventUrl, isGenericCouncilLanding, normalizeListingUrls, repairKnownListingUrl, rewriteCouncilListingUrl, sourceSearchUrl, usableUrl } from './listing-link'

test('get tickets is the plain ticketing url, with affiliate parameters removed', () => {
  const ticketek = eventOutbound({
    title: 'Show',
    source: 'ticketek',
    ticketUrl: 'https://premier.ticketek.com.au/shows/show.aspx?s=ABC&irclickid=abc&aff=partner',
  })
  assert.equal(ticketek.label, 'Get tickets')
  assert.equal(ticketek.href, 'https://premier.ticketek.com.au/shows/show.aspx?s=ABC')
  assert.doesNotMatch(ticketek.href, /aff=|irclickid=|affiliate|clickid=|[?&]u=/)

  const eventbrite = eventOutbound({
    title: 'Paint and sip',
    source: 'cityofsydney',
    ticketUrl: 'https://www.eventbrite.com.au/e/paint-and-sip-tickets-1991353979358?aff=oddtdtcreator',
  })
  assert.equal(eventbrite.label, 'Get tickets')
  assert.equal(eventbrite.href, 'https://www.eventbrite.com.au/e/paint-and-sip-tickets-1991353979358')

  const stored = normalizeListingUrls({
    source: 'moshtix',
    ticketUrl: 'https://www.moshtix.com.au/v2/event/swing-west/193808?ref=RSS_Lazybones&skin=lazybones',
  })
  assert.equal(stored.ticketUrl, 'https://www.moshtix.com.au/v2/event/swing-west/193808?skin=lazybones')
})

test('ticket link wins, then source, organiser, then a search on the source site', () => {
  const tickets = eventOutbound({ title: 'Late show', source: 'ticketmaster', ticketUrl: 'https://www.ticketmaster.com.au/event/abc', sourceUrl: 'https://example.com/listing', organiserUrl: 'https://venue.example' })
  assert.equal(tickets.label, 'Get tickets')
  assert.equal(tickets.kind, 'ticket')
  assert.match(tickets.href, /ticketmaster\.com\.au/)

  const source = eventOutbound({ title: 'Farmers market', source: 'curated', ticketUrl: null, sourceUrl: 'https://qvm.com.au/', organiserUrl: 'https://other.example' })
  assert.equal(source.label, 'More info')
  assert.equal(source.href, 'https://qvm.com.au/')

  const org = eventOutbound({ title: 'House show', source: 'promoter', organiserUrl: 'https://house.example/gig' })
  assert.equal(org.label, 'More info')
  assert.equal(org.kind, 'organiser')

  const search = eventOutbound({ title: 'Jazz night', source: 'moshtix' })
  assert.equal(search.label, 'More info')
  assert.equal(search.kind, 'search')
  assert.equal(search.href, sourceSearchUrl('moshtix', 'Jazz night'))
  assert.match(search.href, /moshtix\.com\.au/)
  assert.match(search.href, /Jazz/)
})

test('a missing link is not a Google search', () => {
  assert.equal(eventOutbound({ title: 'Harbour Sunset Concert', source: 'curated' }), null)
  assert.equal(eventOutbound({ title: 'Harbour Sunset Concert', source: 'promoter' }), null)
  assert.equal(eventOutbound({ title: 'Harbour Sunset Concert' }), null)
  const real = eventOutbound({ title: 'Harbour Sunset Concert', source: 'curated', sourceUrl: 'https://venue.example/gig' })
  assert.equal(real?.href, 'https://venue.example/gig')
  assert.equal(real?.label, 'More info')
})

test('an info-page URL stored in ticketUrl is More info, and junk URLs are dropped', () => {
  const info = eventOutbound({ title: 'Markets', source: 'cityofsydney', ticketUrl: 'https://whatson.cityofsydney.nsw.gov.au/events/rocks-market' })
  assert.equal(info.label, 'More info')
  assert.match(info.href, /cityofsydney/)
  assert.equal(usableUrl('https://whatson.cityofsydney.nsw.gov.au/events/undefined'), null)
  assert.equal(usableUrl('not a url'), null)
})

test('Brisbane council links open the event, not the generic what\'s on page', () => {
  const stored = 'https://www.brisbane.qld.gov.au/trumba?trumbaEmbed=view%3Devent%26eventid%3D212118402'
  const page = bccEventPageUrl('212118402')
  assert.equal(rewriteCouncilListingUrl(stored), page)
  assert.equal(isGenericCouncilLanding('https://www.brisbane.qld.gov.au/events-arts-and-culture/what-s-on-in-brisbane'), true)
  const info = eventOutbound({ title: 'parkrun', source: 'brisbanecouncil', sourceUrl: stored })
  assert.equal(info.href, page)
  assert.equal(info.label, 'More info')
  const generic = eventOutbound({ title: 'parkrun', source: 'brisbanecouncil', sourceUrl: 'https://www.brisbane.qld.gov.au/events-arts-and-culture/what-s-on-in-brisbane' })
  assert.match(generic.href, /event-search\?q=/)
  assert.match(generic.href, /parkrun/)
  assert.equal(normalizeListingUrls({ source: 'brisbanecouncil', sourceUrl: stored }).sourceUrl, page)
})

test('humanitix joins host and slug, and repairs a glued hostname', () => {
  assert.equal(humanitixEventUrl('https://events.humanitix.com', 'summer-fair'), 'https://events.humanitix.com/summer-fair')
  assert.equal(humanitixEventUrl('events.humanitix.com/', '/summer-fair'), 'https://events.humanitix.com/summer-fair')
  assert.equal(humanitixEventUrl('https://events.humanitix.com', ''), null)
  const fixed = repairKnownListingUrl('https://events.humanitix.comsummer-fair', 'humanitix')
  assert.equal(fixed, 'https://events.humanitix.com/summer-fair')
})

test('stored links keep a ticket URL and always keep a source URL when any link exists', () => {
  assert.deepEqual(
    normalizeListingUrls({ source: 'eventbrite', ticketUrl: 'https://www.eventbrite.com.au/e/jazz-123' }),
    { ticketUrl: 'https://www.eventbrite.com.au/e/jazz-123', sourceUrl: 'https://www.eventbrite.com.au/e/jazz-123', organiserUrl: null },
  )
  assert.deepEqual(
    normalizeListingUrls({ source: 'curated', ticketUrl: 'https://qvm.com.au/', organiserUrl: 'https://qvm.com.au/' }),
    { ticketUrl: null, sourceUrl: 'https://qvm.com.au/', organiserUrl: 'https://qvm.com.au/' },
  )
  assert.deepEqual(
    normalizeListingUrls({ source: 'promoter', organiserUrl: 'https://band.example' }),
    { ticketUrl: null, sourceUrl: 'https://band.example/', organiserUrl: 'https://band.example/' },
  )
})
