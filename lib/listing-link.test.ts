import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventOutbound, humanitixEventUrl, normalizeListingUrls, repairKnownListingUrl, sourceSearchUrl, usableUrl } from './listing-link'

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

test('an info-page URL stored in ticketUrl is More info, and junk URLs are dropped', () => {
  const info = eventOutbound({ title: 'Markets', source: 'cityofsydney', ticketUrl: 'https://whatson.cityofsydney.nsw.gov.au/events/rocks-market' })
  assert.equal(info.label, 'More info')
  assert.match(info.href, /cityofsydney/)
  assert.equal(usableUrl('https://whatson.cityofsydney.nsw.gov.au/events/undefined'), null)
  assert.equal(usableUrl('not a url'), null)
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
