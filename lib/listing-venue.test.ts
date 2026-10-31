import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyVenueOutcome,
  extractListingVenue,
  isStreetAddress,
  mergeVenueFacts,
  missingCoordsNotice,
  pinFitsCity,
} from './listing-venue'

const HALLOWQUEEN = `<!doctype html><title>HALLOWQUEEN</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"HALLOWQUEEN","location":{"@type":"Place","name":"The Kent Hotel","address":{"@type":"PostalAddress","streetAddress":"59 Beaumont St, Hamilton NSW 2303, Australia","addressLocality":"Hamilton","postalCode":"2303","addressRegion":"NSW","addressCountry":"AU"}}}</script>
<script>locationCode:"AU",address:"59 Beaumont St, Hamilton NSW 2303, Australia",venueName:"The Kent Hotel",type:"address",latLng:"-32.9209905, 151.7476604",displayLocationPrimary:"The Kent Hotel"</script>
<p>Location The Kent Hotel 59 Beaumont St, Hamilton NSW 2303, Australia</p>`

const KIKI = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"eventData":{"name":"Bottomless Brunch at KiKi Darlinghurst","eventVenue":null,"eventSuburb":{"name":"Darlinghurst"},"lat":-33.8746795,"lng":151.2155495,"addressText":"58 Riley St, Darlinghurst NSW 2010, Australia","locationAdditionalInformation":"KiKi Darlinghurst"}}}}</script>`

const KGV = `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"eventData":{"name":"KGV Fitness – Full body circuit","eventVenue":{"name":"King George V (KGV) Recreation Centre","lat":-33.860092,"lng":151.206651,"addressText":"15 Cumberland Street, The Rocks NSW 2000"},"eventSuburb":{"name":"The Rocks"},"lat":-33.860092,"lng":151.206651,"addressText":null}}}}</script>`

test('street addresses are recognised and suburb-only lines are not', () => {
  assert.equal(isStreetAddress('59 Beaumont St, Hamilton NSW 2303, Australia'), true)
  assert.equal(isStreetAddress('15 Cumberland Street, The Rocks NSW 2000'), true)
  assert.equal(isStreetAddress('58 Riley St, Darlinghurst NSW 2010, Australia'), true)
  assert.equal(isStreetAddress('Darlinghurst, NSW'), false)
  assert.equal(isStreetAddress('The Rocks, NSW'), false)
  assert.equal(isStreetAddress('Hamilton'), false)
  assert.equal(isStreetAddress('Online'), false)
  assert.equal(isStreetAddress('TBA'), false)
  assert.equal(isStreetAddress('Corner John and Mount Streets, Pyrmont NSW 2009'), true)
  assert.equal(isStreetAddress('Cnr Coventry & Cecil Sts, South Melbourne VIC 3205'), true)
  assert.equal(isStreetAddress('The Rocks, Sydney NSW 2000'), false)
})

test('Humanitix listing keeps the venue, street and map pin it publishes', () => {
  const got = extractListingVenue(HALLOWQUEEN, 'https://events.humanitix.com/hallowqueen5-0')
  assert.equal(got.venueName, 'The Kent Hotel')
  assert.equal(got.address, '59 Beaumont St, Hamilton NSW 2303, Australia')
  assert.equal(got.lat, -32.9209905)
  assert.equal(got.lng, 151.7476604)
  assert.equal(got.attendance, 'place')
  assert.equal(pinFitsCity(got.lat!, got.lng!, 'Newcastle', got.address, 'Hamilton'), true)
})

test('City of Sydney pages use addressText, and a venue record when the event address is empty', () => {
  const kiki = extractListingVenue(KIKI, 'https://whatson.cityofsydney.nsw.gov.au/events/bottomless-brunch-at-kiki-darlinghurst')
  assert.equal(kiki.venueName, 'KiKi Darlinghurst')
  assert.equal(kiki.address, '58 Riley St, Darlinghurst NSW 2010, Australia')
  assert.equal(kiki.lat, -33.8746795)
  assert.equal(kiki.lng, 151.2155495)
  assert.equal(pinFitsCity(kiki.lat!, kiki.lng!, 'Sydney', kiki.address, 'Darlinghurst'), true)

  const kgv = extractListingVenue(KGV, 'https://whatson.cityofsydney.nsw.gov.au/events/body-blast-at-kgv')
  assert.equal(kgv.venueName, 'King George V (KGV) Recreation Centre')
  assert.equal(kgv.address, '15 Cumberland Street, The Rocks NSW 2000')
  assert.equal(kgv.lat, -33.860092)
  assert.equal(kgv.lng, 151.206651)
  assert.equal(pinFitsCity(kgv.lat!, kgv.lng!, 'Sydney', kgv.address, 'The Rocks'), true)
})

test('a note is not saved as the venue name, and a stated place line replaces a city-only address', () => {
  const merged = mergeVenueFacts(
    { venueName: 'Also available online', venueAddress: '103 Regent St, Redfern NSW 2016' },
    { venueName: 'Also available online', address: '103 Regent St, Redfern NSW 2016' },
  )
  assert.equal(merged.venueName, 'Redfern')
  assert.equal(merged.venueAddress, '103 Regent St, Redfern NSW 2016')

  const rocks = mergeVenueFacts(
    { venueName: 'The Rocks Square', venueAddress: 'Sydney, NSW' },
    { venueName: 'The Rocks Square', address: 'The Rocks, Sydney NSW 2000' },
  )
  assert.equal(rocks.venueAddress, 'The Rocks, Sydney NSW 2000')
  assert.equal(rocks.venueName, 'The Rocks Square')
})

test('a stored suburb name is replaced by the venue and street the listing states', () => {
  const kiki = extractListingVenue(KIKI)
  const merged = mergeVenueFacts({ venueName: 'Darlinghurst', venueAddress: 'Darlinghurst, NSW' }, kiki)
  assert.equal(merged.venueName, 'KiKi Darlinghurst')
  assert.equal(merged.venueAddress, '58 Riley St, Darlinghurst NSW 2010, Australia')

  const moved = mergeVenueFacts({ venueName: '3/5 Beaumont St', venueAddress: '3/5 Beaumont St, Hamilton NSW 2303' }, extractListingVenue(HALLOWQUEEN))
  assert.equal(moved.venueName, 'The Kent Hotel')
  assert.equal(moved.venueAddress, '59 Beaumont St, Hamilton NSW 2303, Australia')
})

test('JSON-LD, microdata, Eventbrite, Ticketmaster and Oztix each yield the stated address', () => {
  const ld = extractListingVenue(`<script type="application/ld+json">{"@type":"MusicEvent","location":{"@type":"Place","name":"Qudos Bank Arena","address":{"@type":"PostalAddress","streetAddress":"19 Edwin Flack Ave","addressLocality":"Sydney Olympic Park","addressRegion":"NSW","postalCode":"2127"},"geo":{"@type":"GeoCoordinates","latitude":-33.85,"longitude":151.07}}}</script>`)
  assert.equal(ld.venueName, 'Qudos Bank Arena')
  assert.match(ld.address ?? '', /19 Edwin Flack Ave/)
  assert.equal(ld.lat, -33.85)

  const micro = extractListingVenue(`<div itemtype="https://schema.org/Place" itemscope><span itemprop="name">The Tote</span><div itemprop="address" itemtype="https://schema.org/PostalAddress" itemscope><span itemprop="streetAddress">68 Johnston St</span><span itemprop="addressLocality">Collingwood</span><span itemprop="addressRegion">VIC</span><span itemprop="postalCode">3066</span></div></div>`)
  assert.equal(micro.venueName, 'The Tote')
  assert.match(micro.address ?? '', /68 Johnston St/)
  assert.match(micro.address ?? '', /VIC/)

  const brite = extractListingVenue(`<script>window.__SERVER_DATA__ = {"event":{"venue":{"name":"The Tote","address":{"localized_address_display":"68 Johnston St, Collingwood VIC 3066","latitude":"-37.799","longitude":"144.978"}}}};</script>`)
  assert.equal(brite.venueName, 'The Tote')
  assert.equal(brite.address, '68 Johnston St, Collingwood VIC 3066')
  assert.equal(brite.lat, -37.799)

  const oztix = extractListingVenue(`<script>{"VenueName":"King Street","Address":"1 King St, Newcastle NSW 2300","Latitude":-32.928,"Longitude":151.77}</script>`)
  assert.equal(oztix.venueName, 'King Street')
  assert.equal(oztix.address, '1 King St, Newcastle NSW 2300')
  assert.equal(oztix.lat, -32.928)
})

test('online and TBA listings are not given a guessed street', () => {
  const online = extractListingVenue(`<script type="application/ld+json">{"@type":"Event","name":"Remote trivia","eventAttendanceMode":"https://schema.org/OnlineEventAttendanceMode","location":{"@type":"VirtualLocation","url":"https://example.com/join"}}</script>`)
  assert.equal(online.address, null)
  assert.equal(online.attendance, 'online')

  const tba = extractListingVenue(`<script>venueName:"TBA",type:"tba",address:""</script><p>Venue TBA</p>`)
  assert.equal(tba.address, null)
  assert.equal(tba.attendance, 'tba')

  const prose = extractListingVenue(`<p>The band mentioned 10 King St, Sydney NSW 2000 in the bio.</p><p>Location TBA</p>`)
  assert.equal(prose.address, null)
})

test('a visible location line is used only when structured data has no street', () => {
  const got = extractListingVenue(`<p>Doors at 7.</p><p>Location 12 Crown St, Surry Hills NSW 2010</p>`)
  assert.equal(got.address, '12 Crown St, Surry Hills NSW 2010')
})

test('a pin in the wrong city is rejected', () => {
  assert.equal(pinFitsCity(-37.8136, 144.9631, 'Newcastle', '59 Beaumont St, Hamilton NSW 2303', 'Hamilton'), false)
  assert.equal(pinFitsCity(-33.8688, 151.2093, 'Sydney', '58 Riley St, Darlinghurst NSW 2010', 'Darlinghurst'), false)
})

test('missing-coordinate notices name the reason and do not use the word verified', () => {
  const kinds = ['no-address', 'online', 'tba', 'fetch-failed', 'unplaced', 'no-link'] as const
  for (const kind of kinds) {
    const line = missingCoordsNotice('HALLOWQUEEN', kind)
    assert.equal(/verified/i.test(line), false)
    assert.equal(/not a guarantee/i.test(line), false)
    assert.match(line, /^HALLOWQUEEN:/)
  }
  assert.match(missingCoordsNotice('HALLOWQUEEN', 'no-address'), /no venue address/)
  assert.match(missingCoordsNotice('HALLOWQUEEN', 'online'), /online/)
  assert.match(missingCoordsNotice('HALLOWQUEEN', 'tba'), /TBA/)
  assert.match(missingCoordsNotice('HALLOWQUEEN', 'fetch-failed'), /tried again/)
  assert.match(missingCoordsNotice('HALLOWQUEEN', 'unplaced'), /could not be placed/)
  assert.match(missingCoordsNotice('HALLOWQUEEN', 'no-link'), /no original listing link/)
  assert.equal(classifyVenueOutcome({ fetchFailed: false, hadLink: true, extracted: extractListingVenue(KIKI), pin: { lat: -33.8746795, lng: 151.2155495 } }), 'fixed')
  assert.equal(classifyVenueOutcome({ fetchFailed: true, hadLink: true, extracted: null, pin: null }), 'fetch-failed')
  assert.equal(classifyVenueOutcome({ fetchFailed: false, hadLink: true, extracted: extractListingVenue(`<p>Location TBA</p>`), pin: null }), 'tba')
  assert.equal(classifyVenueOutcome({ fetchFailed: false, hadLink: false, extracted: null, pin: null }), 'no-link')
})
