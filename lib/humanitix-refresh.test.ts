import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceVolumeSignal, sweepRunFromLog, volumeDropDetail } from './source-health'
import { isPartialRefresh } from './refresh-plan'
import { cityFromPlace } from './venue-city'
import { toSydneyParts } from './event-store-parts'
import {
  featuredSlice,
  featuredSlotAfter,
  humanitixAuShardUrls,
  humanitixCarouselUrls,
  humanitixEventUrlFromHref,
  humanitixEventUrlsFromShard,
  humanitixListingsFromJson,
  humanitixOriginalImage,
  humanitixPlainText,
  humanitixResume,
  orderHumanitixUrls,
  slugEventDate,
} from './humanitix-refresh'

const TODAY = '2026-11-11'

test('sitemap shards skip ticket URLs and non-AU files', () => {
  const index = `<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>https://events.humanitix.com/sitemaps/sitemap-au-0.xml</loc></sitemap>
    <sitemap><loc>https://events.humanitix.com/sitemaps/sitemap-au-5.xml</loc></sitemap>
    <sitemap><loc>https://events.humanitix.com/sitemaps/sitemap-us-0.xml</loc></sitemap>
    <sitemap><loc>https://events.humanitix.com/sitemaps/sitemap-nz-0.xml</loc></sitemap>
  </sitemapindex>`
  assert.deepEqual(humanitixAuShardUrls(index), [
    'https://events.humanitix.com/sitemaps/sitemap-au-0.xml',
    'https://events.humanitix.com/sitemaps/sitemap-au-5.xml',
  ])
  const shard = `<?xml version="1.0"?><urlset>
    <url><loc>https://events.humanitix.com/beef13nov</loc></url>
    <url><loc>https://events.humanitix.com/beef13nov/tickets</loc></url>
    <url><loc>https://events.humanitix.com/host/rolling-sets-festival</loc></url>
    <url><loc>https://events.humanitix.com/workshop-12-november-2026</loc></url>
  </urlset>`
  assert.deepEqual(humanitixEventUrlsFromShard(shard), [
    'https://events.humanitix.com/beef13nov',
    'https://events.humanitix.com/workshop-12-november-2026',
  ])
})

test('carousel cards are the primary button link, not the card title', () => {
  const urls = humanitixCarouselUrls([
    {
      cardTitle: 'The Business Show Australia 2026',
      primaryButtonHref: 'https://events.humanitix.com/the-business-show-australia-2026?hxref=srf%3Afcl&hxchl=mkt-loc',
    },
    { cardTitle: 'Tickets for good', primaryButtonHref: 'https://humanitix.com/for-hosts?hxchl=mkt-loc' },
    { cardTitle: 'A host page', primaryButtonHref: 'https://events.humanitix.com/host/rolling-sets-festival' },
    { cardTitle: 'Checkout only', primaryButtonHref: 'https://events.humanitix.com/beef13nov/tickets' },
    { cardTitle: 'Same show again', primaryButtonHref: 'https://events.humanitix.com/the-business-show-australia-2026' },
  ])
  assert.deepEqual(urls, ['https://events.humanitix.com/the-business-show-australia-2026'])
  assert.equal(humanitixEventUrlFromHref('https://events.humanitix.com/beef13nov'), 'https://events.humanitix.com/beef13nov')
})

test('soonest slug dates are crawled before the rest of the sitemap', () => {
  assert.equal(slugEventDate('beef13nov', TODAY), '2026-11-13')
  assert.equal(slugEventDate('workshop-12-november-2026', TODAY), '2026-11-12')
  assert.equal(slugEventDate('the-business-show-australia-2026', TODAY), null)
  assert.equal(slugEventDate('10-maybe-later', TODAY), null)
  assert.equal(slugEventDate('connector-brisbane-tuesday-10th-november-2026', TODAY), '2026-11-10')
  assert.equal(slugEventDate('november-2026-conference', TODAY), null)
  const ordered = orderHumanitixUrls([
    'https://events.humanitix.com/some-undated-show',
    'https://events.humanitix.com/beef13nov',
    'https://events.humanitix.com/festival-25-march-2027',
    'https://events.humanitix.com/workshop-12-november-2026',
    'https://events.humanitix.com/beef13nov',
  ], TODAY)
  assert.deepEqual(ordered, [
    'https://events.humanitix.com/workshop-12-november-2026',
    'https://events.humanitix.com/beef13nov',
    'https://events.humanitix.com/some-undated-show',
    'https://events.humanitix.com/festival-25-march-2027',
  ])
})

test('the sitemap cursor resumes and a finished sweep starts again', () => {
  assert.deepEqual(humanitixResume(0, 100), { index: 0, continuation: false, done: false })
  assert.deepEqual(humanitixResume(73, 100), { index: 73, continuation: true, done: false })
  assert.deepEqual(humanitixResume(100, 100), { index: 0, continuation: true, done: true })
  assert.deepEqual(featuredSlice(19, 2, 20), [19, 0])
  assert.equal(featuredSlotAfter(19, 2, 20), 1)
  assert.equal(featuredSlotAfter(0, 0, 20), 0)
})

test('an open Humanitix sweep is not a volume or fault drop', () => {
  const open = sourceVolumeSignal(
    [sweepRunFromLog(79, null)],
    { events: 30, continuation: false, more: true, unmarked: false },
  )
  assert.equal(open.signal, null)

  const finished = sourceVolumeSignal(
    [
      sweepRunFromLog(40, '[sweep:continued+more]'),
      sweepRunFromLog(120, '[sweep:more]'),
      sweepRunFromLog(79, null),
    ],
    { events: 50, continuation: true, more: false, unmarked: false },
  )
  assert.equal(finished.signal, null)
  assert.equal(finished.comparison.comparable, true)
  assert.equal(finished.comparison.currentTotal, 210)
  assert.equal(finished.comparison.previousTotal, 79)
  assert.match(volumeDropDetail('Humanitix', 'drop', finished.comparison), /full sweep/)

  const shrunk = sourceVolumeSignal(
    [
      sweepRunFromLog(50, '[sweep:continued]'),
      sweepRunFromLog(160, '[sweep:more]'),
    ],
    { events: 20, continuation: false, more: false, unmarked: false },
  )
  assert.equal(shrunk.signal, 'drop')
  assert.equal(shrunk.comparison.previousTotal, 210)
  assert.equal(shrunk.comparison.currentTotal, 20)
  assert.equal(isPartialRefresh('Humanitix: time budget reached after saving 40 events'), true)
  assert.equal(isPartialRefresh('Humanitix: Humanitix sitemap was unavailable'), false)
})

test('a Humanitix event page keeps the full description, image, price, and Sydney time', () => {
  const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/humanitix-beef-data.json'), 'utf8')
  const listings = humanitixListingsFromJson(body)
  assert.equal(listings.length, 1)
  const event = listings[0]
  assert.equal(event.slug, 'beef13nov')
  assert.equal(event.title, 'BEEFCAKE Leather 🥩 Sydney @ Trough X')
  assert.match(event.description ?? '', /Ready to play harder/)
  assert.match(event.description ?? '', /DRESS CODE/)
  assert.equal(event.imageUrl, 'https://images.humanitix.com/i/d75b8bae-66a2-454b-9bff-8d899854fc79.png@original')
  assert.deepEqual(event.prices, [35, 45, 55])
  assert.equal(event.venueName, 'Trough X')
  assert.match(event.venueAddress ?? '', /273 Crown St/)
  const when = toSydneyParts(event.start, 'Australia/Sydney')
  assert.equal(when.date, '2026-11-13')
  assert.equal(when.time, '21:00')
  const end = event.end ? toSydneyParts(event.end, 'Australia/Sydney') : null
  assert.equal(end?.date, '2026-11-14')
  assert.equal(end?.time, '04:00')
  assert.equal(cityFromPlace({
    name: event.venueName,
    address: event.venueAddress,
    locality: event.locality,
    region: event.region,
    postcode: event.postcode,
    lat: event.lat,
    lng: event.lng,
  })?.name, 'Sydney')
  assert.equal(event.passed, false)
  assert.equal(event.listed, true)
  assert.ok((event.description ?? '').length > 600)
})

test('plain text and original images drop the markup and the seo rendition', () => {
  assert.equal(humanitixPlainText('<p>Hello<br>there</p><p>Friend</p>'), 'Hello\nthere\nFriend')
  assert.equal(
    humanitixOriginalImage('https://images.humanitix.com/i/abc.png@seo-500.jpg'),
    'https://images.humanitix.com/i/abc.png@original',
  )
  assert.equal(
    humanitixOriginalImage('https://images.humanitix.com/i/abc.png@original'),
    'https://images.humanitix.com/i/abc.png@original',
  )
})
