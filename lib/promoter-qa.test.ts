import assert from 'node:assert/strict'
import { test } from 'node:test'
import { interpretQuery } from './ai-search-parse'
import { publicEmailError } from './email'
import { isHiddenFromPublic } from './community-shared'
import { applyListingField, campaignEndsBeforeEvent, campaignScheduleNote, finishTimeError, listingHiddenOnCreate, listingPayloadPrice, parsePromoterListing } from './promoter-listing'
import { outzaVerified, priceSummary, scheduleCue } from './quality'
import { extractPostcode, pinIsCityDump, placeFromText } from './venue-place'

const NOW = new Date('2026-10-29T01:00:00.000Z')

test('suburb addresses pin on the suburb, not the CBD', () => {
  const fitzroy = placeFromText({ venueAddress: '123 Brunswick St, Fitzroy VIC 3065', venueName: 'The Old Bar', city: 'Melbourne' })
  assert.equal(fitzroy.suburb, 'Fitzroy')
  assert.equal(fitzroy.postcode, '3065')
  assert.ok(fitzroy.lat != null && fitzroy.lat < -37.79)
  assert.equal(pinIsCityDump(-37.8136, 144.9631, 'Melbourne', 'Fitzroy', '3065'), true)
  assert.equal(pinIsCityDump(-37.8136, 144.9631, 'Melbourne', null, '3000'), false)

  const glebe = placeFromText({ venueAddress: 'Glebe NSW 2037', venueName: 'Glebe Town Hall', city: 'Sydney' })
  assert.equal(glebe.postcode, '2037')
  assert.equal(glebe.suburb, 'Glebe')
  assert.ok(glebe.lng != null && glebe.lng < 151.2)

  const bondi = placeFromText({ venueAddress: 'Bondi Beach, Bondi NSW 2026', venueName: 'Bondi Pavilion', city: 'Sydney' })
  assert.equal(bondi.postcode, '2026')
  assert.equal(extractPostcode('Party 2027 at Bondi'), null)
  const valley = placeFromText({ venueAddress: 'Brunswick St, Fortitude Valley QLD 4006', venueName: 'The Zoo', city: 'Brisbane' })
  assert.equal(valley.suburb, 'Fortitude Valley')
  assert.equal(valley.postcode, '4006')
  const fremantle = placeFromText({ venueAddress: 'South Tce, Fremantle WA 6160', venueName: 'Markets', city: 'Perth' })
  assert.equal(fremantle.suburb, 'Fremantle')
  assert.ok(fremantle.lat != null && fremantle.lat < -32)
})

test('promoter listing keeps price, rejects bad dates and treats free text as free', () => {
  const paid = parsePromoterListing({
    title: 'Jazz', date: '2026-12-12', venueName: 'The Tote', venueAddress: 'Fitzroy VIC 3065', city: 'Melbourne',
    category: 'Music', price: '$25', ticketUrl: 'https://tickets.example/jazz', imageUrl: 'https://images.humanitix.com/i/jazz.jpg@original', isLGBTI: true,
  }, NOW)
  assert.equal(paid.ok, true)
  if (paid.ok) {
    assert.equal(paid.listing.price, '$25')
    assert.equal(paid.listing.isFree, false)
    assert.equal(paid.listing.ticketUrl, 'https://tickets.example/jazz')
    assert.equal(paid.listing.imageUrl, 'https://images.humanitix.com/i/jazz.jpg@original')
    assert.equal(paid.listing.isLGBTI, true)
  }
  const free = parsePromoterListing({ title: 'Market', date: '2026-12-01', venueName: 'Hall', city: 'Sydney', price: 'Free entry', category: 'Community', subTags: ['Markets'] }, NOW)
  assert.equal(free.ok, true)
  if (free.ok) {
    assert.equal(free.listing.isFree, true)
    assert.equal(free.listing.price, 'Free')
    assert.deepEqual(free.listing.subTags, ['Markets'])
  }
  const zero = parsePromoterListing({ title: 'Market', date: '2026-12-01', venueName: 'Hall', city: 'Sydney', price: '0' }, NOW)
  assert.equal(zero.ok && zero.listing.isFree, true)
  assert.equal(parsePromoterListing({ title: 'X', date: '2026-01-01', venueName: 'Hall', city: 'Sydney' }, NOW).ok, false)
  assert.equal(parsePromoterListing({ title: 'X', date: '2026-12-02', endDate: '2026-12-01', venueName: 'Hall', city: 'Sydney' }, NOW).ok, false)
  assert.match(parsePromoterListing({ title: 'X', date: '2026-12-01', venueName: 'Hall', city: 'Sydney', price: '-$10' }, NOW).ok ? '' : 'negative', /negative|Price/)
  assert.equal(parsePromoterListing({ title: 'X', date: '2026-12-01', venueName: 'Hall', city: 'Sydney', ticketUrl: 'not a url' }, NOW).ok, false)
  const early = parsePromoterListing({ title: 'X', date: '2026-12-01', time: '19:00', endTime: '18:00', venueName: 'Hall', city: 'Sydney' }, NOW)
  assert.equal(early.ok, false)
  if (!early.ok) assert.match(early.error, /Finish time needs to be after the start time/)
  assert.equal(finishTimeError({ startDate: '01/12/2026', endDate: '', time: '19:00', endTime: '18:00' }), 'Finish time needs to be after the start time.')
  assert.equal(finishTimeError({ startDate: '2026-12-01', endDate: '2026-12-02', time: '19:00', endTime: '18:00' }), null)
  const nextDay = parsePromoterListing({ title: 'X', date: '2026-12-01', endDate: '2026-12-02', time: '19:00', endTime: '18:00', venueName: 'Hall', city: 'Sydney' }, NOW)
  assert.equal(nextDay.ok, true)
  if (nextDay.ok) assert.equal(nextDay.listing.overnight, true)
  assert.equal(priceSummary({ isFree: false, price: 'Free entry', priceMin: null, priceMax: null }).fees, null)
  assert.equal(priceSummary({ isFree: false, price: '0', priceMin: 0, priceMax: 0 }).range, 'Free')
})

test('a new organiser listing is not VibePeep Verified, and overnight times are labelled', () => {
  const sample = {
    title: 'Late show', date: '2026-11-02T00:00:00.000Z', time: '19:30', venueName: 'Enmore Theatre', city: 'Sydney',
    isFree: false, price: '$42', ticketUrl: 'https://tickets.example/show', source: 'promoter', status: 'SCHEDULED',
    duplicateOfId: null, lastVerifiedAt: '2026-10-28T02:00:00.000Z', openReportReasons: [] as string[],
  }
  assert.equal(outzaVerified(sample, NOW.getTime()).ok, false)
  const cue = scheduleCue({ time: '22:00', endTime: '01:00' })
  assert.match(cue.label, /midnight/)
  assert.match(cue.detail, /10:00 pm – 1:00 am the next day/)
  assert.doesNotMatch(cue.detail, /22:00|01:00/)
  const morning = scheduleCue({ time: '08:30', endTime: '07:30', date: '2026-06-02', endDate: '2026-07-28' })
  assert.match(morning.detail, /8:30 am/)
  assert.doesNotMatch(morning.detail, /7:30 am/)
  assert.match(morning.detail, /2 June 2026/)
  assert.match(morning.detail, /28 July 2026/)
})

test('mail failures never include an address', () => {
  const leaked = 'You can only send testing emails to your own email address (tama.tauira@gmail.com).'
  const pub = publicEmailError(leaked)
  assert.equal(pub.includes('@'), false)
  assert.equal(pub.includes('tama'), false)
  assert.match(pub, /RESEND_FROM_EMAIL/)
  assert.match(publicEmailError('Email sending is turned off'), /turned off/)
  assert.equal(publicEmailError('HTTP 500').includes('500'), false)
})

test('ask hears NYE, weekend, suburb, markets and paid', () => {
  const nye = interpretQuery('NYE in Sydney', '2026-10-29')
  assert.equal(nye.dateFrom, '2026-12-31')
  assert.equal(nye.dateTo, '2026-12-31')
  assert.equal(nye.city, 'Sydney')
  const weekend = interpretQuery('free markets in Parramatta this weekend', '2026-10-29')
  assert.equal(weekend.dateFrom, '2026-10-30')
  assert.equal(weekend.dateTo, '2026-11-01')
  assert.equal(weekend.category, '')
  assert.equal(weekend.subTag, '')
  assert.deepEqual(weekend.keywords, ['market'])
  assert.equal(weekend.isFree, true)
  assert.equal(weekend.suburb, 'Parramatta')
  const film = interpretQuery('film screenings in Surry Hills in January', '2026-10-29')
  assert.equal(film.category, 'Arts & Culture')
  assert.equal(film.subTag, 'Film')
  assert.equal(film.suburb, 'Surry Hills')
  assert.equal(film.dateFrom, '2027-01-01')
  const paid = interpretQuery('paid gigs in Brunswick', '2026-10-29')
  assert.equal(paid.paidOnly, true)
  assert.equal(paid.suburb, 'Brunswick')
  assert.equal(paid.city, 'Melbourne')
  assert.equal(campaignEndsBeforeEvent('2026-12-12', 30, Date.parse('2026-10-29T00:00:00Z')), true)
  assert.equal(campaignEndsBeforeEvent('2026-11-20', 30, Date.parse('2026-10-29T00:00:00Z')), false)
  const note = campaignScheduleNote('2026-12-12', 30, Date.parse('2026-10-29T00:00:00Z'))
  assert.match(note ?? '', /starts now and finishes on 28 Nov 2026/)
  assert.match(note ?? '', /event is later, on 12 Dec 2026/)
  assert.equal(campaignScheduleNote('2026-11-20', 30, Date.parse('2026-10-29T00:00:00Z')), null)
})

test('a new organiser listing is a hidden draft until publish, and Free clears the price', () => {
  assert.equal(listingHiddenOnCreate(undefined), true)
  assert.equal(listingHiddenOnCreate(false), true)
  assert.equal(listingHiddenOnCreate('true'), true)
  assert.equal(listingHiddenOnCreate(true), false)
  assert.equal(isHiddenFromPublic({ hidden: listingHiddenOnCreate(undefined) }), true)
  assert.equal(isHiddenFromPublic({ hidden: listingHiddenOnCreate(true) }), false)
  const cleared = applyListingField({ price: '$25', isFree: false, subTag: 'Jazz' }, 'isFree', true)
  assert.equal(cleared.isFree, true)
  assert.equal(cleared.price, '')
  assert.equal(listingPayloadPrice(true, '$25'), '')
  assert.equal(listingPayloadPrice(false, '$40'), '$40')
})
