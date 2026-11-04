import assert from 'node:assert/strict'
import test from 'node:test'
import { eventPath } from './seo'
import {
  assertNoOwnershipTransfer,
  canonicalizeListingUrl,
  compareCatalogue,
  decideDuplicate,
  matchSourceSession,
  type IdentityEvent,
} from './event-identity'

const day = '2026-11-14'

function row(partial: Partial<IdentityEvent> & Pick<IdentityEvent, 'title' | 'venueName'>): IdentityEvent {
  return { date: day, city: 'Sydney', time: '19:30', ...partial }
}

test('tracking parameters drop and session ids stay', () => {
  const url = canonicalizeListingUrl('https://www.Example.com/events/show/?utm_source=news&eventid=55&fbclid=abc')
  assert.equal(url, 'https://www.example.com/events/show?eventid=55')
  const affiliate = canonicalizeListingUrl('https://www.example.com/events/show?aff=partner&ref=mail')
  assert.equal(affiliate, 'https://www.example.com/events/show')
  const councilA = canonicalizeListingUrl('https://www.brisbane.qld.gov.au/trumba?trumbaEmbed=view%3Devent%26eventid%3D1')
  const councilB = canonicalizeListingUrl('https://www.brisbane.qld.gov.au/trumba?trumbaEmbed=view%3Devent%26eventid%3D2')
  assert.notEqual(councilA, councilB)
  assert.equal(canonicalizeListingUrl('https://tickets.example/search?q=jazz'), null)
  const coredna = canonicalizeListingUrl('https://frontiertouringcom.coredna.site/bensonboone')
  const www = canonicalizeListingUrl('https://www.frontiertouring.com/bensonboone/')
  assert.equal(coredna, www)
  assert.equal(coredna, 'https://www.frontiertouring.com/bensonboone')
})

test('same source id links a reschedule and a different id stays a separate session', () => {
  const moved = decideDuplicate(
    row({ title: 'La Bohème', venueName: 'Sydney Opera House', date: '2026-11-14', externalId: 'soh-1', source: 'venue', time: '19:30' }),
    row({ title: 'La Bohème', venueName: 'Sydney Opera House', date: '2026-12-02', externalId: 'soh-1', source: 'venue', time: '19:30' }),
  )
  assert.equal(moved.action, 'link')
  assert.ok(moved.contradictions.includes('rescheduled'))
  const sessions = decideDuplicate(
    row({ title: 'La Bohème', venueName: 'Joan Sutherland Theatre', externalId: 'soh-1', source: 'venue', time: '14:00' }),
    row({ title: 'La Bohème', venueName: 'Joan Sutherland Theatre', externalId: 'soh-2', source: 'venue', time: '19:30' }),
  )
  assert.equal(sessions.action, 'separate')
  assert.equal(sessions.layer, 'exact_id')
})

test('a shared street address does not merge Allianz Stadium and the SCG', () => {
  const decision = decideDuplicate(
    row({ title: 'Saturday fixture', venueName: 'Allianz Stadium', address: 'Moore Park, Sydney NSW' }),
    row({ title: 'Saturday fixture', venueName: 'Sydney Cricket Ground', address: 'Moore Park, Sydney NSW' }),
  )
  assert.equal(decision.action, 'separate')
  assert.equal(decision.layer, 'venue')
})

test('tour-title wording is not an automatic merge without a strong id', () => {
  const decision = decideDuplicate(
    row({ title: 'Artist X Live in Sydney', venueName: 'Enmore Theatre', time: '20:00' }),
    row({ title: 'Artist X: Sydney Tour 2027', venueName: 'Enmore Theatre', time: '20:00' }),
  )
  assert.notEqual(decision.action, 'link')
})

test('the same show at Enmore from two sources links, and a later session does not', () => {
  const same = decideDuplicate(
    row({ title: 'Jazz night', venueName: 'Enmore Theatre', time: '19:30', source: 'ticketmaster', organiserName: 'Frontier Touring' }),
    row({ title: 'Jazz night live', venueName: 'The Enmore Theatre', time: '20:00', source: 'moshtix', organiserName: 'Frontier' }),
  )
  assert.equal(same.action, 'link')
  assert.ok(same.confidence >= 85)
  assert.ok(same.confidence < 98)
  const later = decideDuplicate(
    row({ title: 'Jazz night', venueName: 'Enmore Theatre', time: '14:00' }),
    row({ title: 'Jazz night', venueName: 'Enmore Theatre', time: '20:00' }),
  )
  assert.equal(later.action, 'separate')
  assert.equal(later.layer, 'session')
})

test('cancelled is the same event when the id matches, and a weekly repeat is not', () => {
  const cancelled = decideDuplicate(
    row({ title: 'Air fryer fun', venueName: 'Community shed', externalId: '210630782', source: 'brisbanecouncil', status: 'SCHEDULED' }),
    row({ title: 'Air fryer fun', venueName: 'Community shed', externalId: '210630782', source: 'brisbanecouncil', status: 'CANCELLED' }),
  )
  assert.equal(cancelled.action, 'link')
  const weekly = decideDuplicate(
    row({ title: 'parkrun', venueName: 'Wishart Community Park', date: '2026-11-14', time: '07:00', externalId: '1', source: 'brisbanecouncil' }),
    row({ title: 'parkrun', venueName: 'Wishart Community Park', date: '2026-11-21', time: '07:00', externalId: '2', source: 'brisbanecouncil' }),
  )
  assert.equal(weekly.action, 'separate')
})

test('catalogue comparison counts new sessions separately from uncertain pairs', () => {
  const source = [
    row({ title: 'Jazz night', venueName: 'Enmore Theatre', time: '19:30', price: '$30', url: 'https://tickets.example/jazz' }),
    row({ title: 'Jazz night', venueName: 'Enmore Theatre', time: '14:00' }),
    row({ title: 'Park working bee', venueName: 'Wishart Community Park', time: '09:00', address: '106A Kavanagh Road, Wishart' }),
    row({ title: 'Called off', venueName: 'Hall', status: 'CANCELLED' }),
  ]
  const catalogue = [
    row({ title: 'Jazz night live', venueName: 'The Enmore Theatre', time: '20:00', organiserName: 'Frontier', source: 'moshtix' }),
  ]
  const audit = compareCatalogue(source, catalogue)
  assert.equal(audit.valid, 3)
  assert.equal(audit.cancelledOrOutdated, 1)
  assert.equal(audit.alreadyPresent, 1)
  assert.equal(audit.additionalSessions, 1)
  assert.equal(audit.confirmedNew, 2)
  assert.equal(audit.uncertain, 0)
  assert.equal(audit.uniqueRate, 2 / 3)
})

test('the same title and start time link when the venue matches or the street is shared', () => {
  const jazz = decideDuplicate(
    row({ title: 'Jazz Wednesdays - A Midweek Taste of Paris', venueName: 'Cardea Barangaroo', time: '17:30', source: 'cityofsydney', address: '300 Barangaroo Avenue, Barangaroo NSW 2000' }),
    row({ title: 'Jazz Wednesdays - A Midweek Taste of Paris (free entry)', venueName: 'Cardea Barangaroo', time: '17:30', source: 'moshtix', address: 'Shop 2, 300 Barangaroo Ave, Barangaroo NSW 2000' }),
  )
  assert.equal(jazz.action, 'link')
  assert.equal(jazz.layer, 'venue')

  const slice = decideDuplicate(
    row({ title: 'Slice of the Point', venueName: 'Llankelly Pl', time: '17:00', source: 'cityofsydney', address: 'Llankelly Pl, Potts Point, NSW 2011' }),
    row({ title: 'Slice of the Point', venueName: 'PIÑA, Room Ten and Dear Sainte Éloise', time: '17:00', source: 'cityofsydney', address: 'Llankelly Pl, Potts Point NSW 2011, Australia' }),
  )
  assert.equal(slice.action, 'link')
  assert.equal(slice.layer, 'address')

  const otherShow = decideDuplicate(
    row({ title: 'Trivia night', venueName: 'The Roosevelt', time: '19:00', address: 'Llankelly Pl, Potts Point NSW 2011' }),
    row({ title: 'Jazz upstairs', venueName: 'Dear Sainte Éloise', time: '19:00', address: 'Llankelly Pl, Potts Point NSW 2011' }),
  )
  assert.equal(otherShow.action, 'separate')

  const later = decideDuplicate(
    row({ title: 'Slice of the Point', venueName: 'Llankelly Pl', time: '12:00', address: 'Llankelly Pl, Potts Point NSW 2011' }),
    row({ title: 'Slice of the Point', venueName: 'PIÑA', time: '17:00', address: 'Llankelly Pl, Potts Point NSW 2011' }),
  )
  assert.equal(later.action, 'separate')
})

test('the same listing page links even when the venue strings differ, and a later week stays separate', () => {
  const page = 'https://whatson.cityofsydney.nsw.gov.au/events/slice-of-the-point'
  const sameNight = decideDuplicate(
    row({ title: 'Slice of the Point', venueName: 'Llankelly Pl', time: '17:00', source: 'cityofsydney', url: page, address: 'Llankelly Pl, Potts Point NSW 2011' }),
    row({ title: 'Slice of the Point', venueName: 'PIÑA, Room Ten and Dear Sainte Éloise', time: '17:00', source: 'cityofsydney', url: page, address: 'Llankelly Pl, Potts Point NSW 2011' }),
  )
  assert.equal(sameNight.action, 'link')
  assert.equal(sameNight.layer, 'exact_url')

  const suburbLabel = decideDuplicate(
    row({ title: 'Anticipated Collapse.', venueName: 'Darlinghurst', time: '19:00', source: 'cityofsydney', url: 'https://whatson.cityofsydney.nsw.gov.au/events/anticipated-collapse' }),
    row({ title: 'Anticipated Collapse.', venueName: 'East Sydney Community and Arts Centre (ESCAC)', time: '19:00', source: 'cityofsydney', url: 'https://whatson.cityofsydney.nsw.gov.au/events/anticipated-collapse' }),
  )
  assert.equal(suburbLabel.action, 'link')

  const nextWeek = decideDuplicate(
    row({ title: 'Jazz Wednesdays - A Midweek Taste of Paris', venueName: 'Cardea Barangaroo', date: '2026-10-27', time: null, source: 'cityofsydney', url: 'https://whatson.cityofsydney.nsw.gov.au/events/wednesdays-unplugged-at-cardea-barangaroo' }),
    row({ title: 'Jazz Wednesdays - A Midweek Taste of Paris', venueName: 'Cardea Barangaroo', date: '2026-11-04', time: '17:30', source: 'cityofsydney', url: 'https://whatson.cityofsydney.nsw.gov.au/events/wednesdays-unplugged-at-cardea-barangaroo' }),
  )
  assert.equal(nextWeek.action, 'review')
  assert.equal(nextWeek.layer, 'exact_url')
})

test('ticket tiers, scarcity notes and tour subtitles link, and a different package or age group does not', () => {
  const stakes = decideDuplicate(
    row({ title: 'CBT Keith Noud Stakes Day - Owners Admission Tickets', venueName: 'Brisbane Racing Club - Doomben Racecourse', time: '10:00', source: 'ticketmaster', externalId: 'ga' }),
    row({ title: 'CBT Keith Noud Stakes Day - General Admission', venueName: 'Brisbane Racing Club - Doomben Racecourse', time: '10:00', source: 'ticketmaster', externalId: 'owners' }),
  )
  assert.equal(stakes.action, 'link')
  const packageSeat = decideDuplicate(
    row({ title: 'Crown Oaks Day - General Admission', venueName: 'Flemington Racecourse', time: '11:30', source: 'ticketmaster' }),
    row({ title: 'Crown Oaks Day - The Peak', venueName: 'Flemington Racecourse', time: '11:30', source: 'ticketmaster' }),
  )
  assert.notEqual(packageSeat.action, 'link')
  const ages = decideDuplicate(
    row({ title: 'Fun soccer for 2-3 years', venueName: 'Ferny Grove Picnic Ground Park', time: '15:30', source: 'brisbanecouncil' }),
    row({ title: 'Fun soccer for 4-5 years', venueName: 'Ferny Grove Picnic Ground Park', time: '16:05', source: 'brisbanecouncil' }),
  )
  assert.notEqual(ages.action, 'link')
  const tour = decideDuplicate(
    row({ title: 'Hoodoo Gurus', venueName: 'Hindley Street Music Hall', time: '18:00', source: 'frontier' }),
    row({ title: 'Hoodoo Gurus Rewind Tour - All Killer, No Filler', venueName: 'Hindley St Music Hall', time: '18:00', source: 'ticketmaster' }),
  )
  assert.equal(tour.action, 'link')
  const scarce = decideDuplicate(
    row({ title: 'Rick Price "Call On Me" Tour 2026', venueName: 'The Duke of George', time: '19:30', source: 'ticketmaster' }),
    row({ title: 'Rick Price "Call On Me" Tour 2026 | 3 x TICKETS LEFT', venueName: 'The Duke of George', time: '19:30', source: 'ticketmaster' }),
  )
  assert.equal(scarce.action, 'link')
  const freeNote = decideDuplicate(
    row({ title: 'POOF DOOF 15th Birthday - Sat 7th November', venueName: 'Chasers Nightclub', time: '22:00' }),
    row({ title: 'POOF DOOF 15th Birthday - Sat 7th November (Free Event)', venueName: 'Chasers Nightclub', time: '22:00' }),
  )
  assert.equal(freeNote.action, 'link')
  const pin = decideDuplicate(
    row({ title: 'Night market', venueName: 'North lawn', time: '17:00', lat: -33.8688, lng: 151.2093 }),
    row({ title: 'Night market', venueName: 'South gate', time: '17:00', lat: -33.8689, lng: 151.2094 }),
  )
  assert.equal(pin.action, 'link')
  const twoShow = decideDuplicate(
    row({ title: 'Spacey Jane', venueName: 'Riverstage', time: '17:00', source: 'frontier' }),
    row({ title: 'Spacey Jane | Heading Back Down Under Australian Tour - Two Show Pass', venueName: 'Riverstage', time: '17:00', source: 'ticketmaster' }),
  )
  assert.notEqual(twoShow.action, 'link')
  const support = decideDuplicate(
    row({ title: 'Killswitch Engage', venueName: 'Metropolis Fremantle', time: '19:00' }),
    row({ title: 'SLIPKNOT vs SYSTEM OF A DOWN + KILLSWITCH ENGAGE', venueName: 'Metropolis Fremantle', time: '19:00' }),
  )
  assert.notEqual(support.action, 'link')
  const britpop = decideDuplicate(
    row({ title: 'Robbie Williams', venueName: 'Marvel Stadium', time: null, source: 'frontier', url: 'https://frontiertouringcom.coredna.site/robbiewilliams' }),
    row({ title: 'Robbie Williams - BRITPOP WORLD TOUR', venueName: 'Marvel Stadium', time: '17:00', source: 'ticketmaster', url: 'https://www.ticketmaster.com.au/robbie-williams' }),
  )
  assert.equal(britpop.action, 'link')
  const oneWord = decideDuplicate(
    row({ title: 'Searows', venueName: 'The Triffid', time: null, source: 'frontier' }),
    row({ title: 'Searows - Death in the Business of Whaling Tour', venueName: 'The Triffid', time: '19:00', source: 'ticketmaster' }),
  )
  assert.equal(oneWord.action, 'link')
  const asked = decideDuplicate(
    row({ title: 'DOMi & JD BECK', venueName: '170 Russell', time: '19:30', source: 'frontier', url: 'https://frontiertouringcom.coredna.site/domiandjdbeck' }),
    row({ title: 'DOMi & JD BECK - WHO ASKED? Tour', venueName: '170 Russell', time: '19:30', source: 'ticketmaster', url: 'https://www.moshtix.com.au/v2/event/domi-jd-beck-who-asked-tour/198645' }),
  )
  assert.equal(asked.action, 'link')
  const otherRoom = decideDuplicate(
    row({ title: 'Daine', venueName: 'Metro Social', time: '19:30', source: 'moshtix', address: '624 George St, Sydney, NSW 2000' }),
    row({ title: 'daine - the In Endless Awe & Agony tour (18+)', venueName: 'Metro Theatre', time: '19:30', source: 'ticketmaster', address: '624 George Street, Sydney' }),
  )
  assert.notEqual(otherRoom.action, 'link')
})

test('the same listing URL and start is one row, and another night on that page is not', () => {
  const page = 'https://frontiertouringcom.coredna.site/bensonboone'
  const again = decideDuplicate(
    row({ title: 'Benson Boone', venueName: 'Sydney Opera House Concert Hall', date: '2026-11-06', time: null, source: 'frontier', url: page }),
    row({ title: 'Benson Boone', venueName: 'Sydney Opera House, Drama Theatre', date: '2026-11-06', time: null, source: 'frontier', url: 'https://www.frontiertouring.com/bensonboone' }),
  )
  assert.equal(again.action, 'link')
  assert.equal(again.layer, 'exact_url')
  const nextNight = decideDuplicate(
    row({ title: 'Benson Boone', venueName: 'Brisbane Entertainment Centre', date: '2026-11-06', time: null, source: 'frontier', url: page }),
    row({ title: 'Benson Boone', venueName: 'Brisbane Entertainment Centre', date: '2026-11-07', time: null, source: 'frontier', url: page }),
  )
  assert.equal(nextNight.action, 'review')
  const laterClock = decideDuplicate(
    row({ title: 'Lassù Parramatta', venueName: 'Rosehill Gardens Racecourse', date: '2026-11-14', time: '18:00', source: 'ticketmaster', url: 'https://www.universe.com/events/lassu-parramatta-tickets-VFJHS5?ref=ticketmaster' }),
    row({ title: 'Lassù Parramatta', venueName: 'Rosehill Gardens Racecourse', date: '2026-11-05', time: '18:00', source: 'ticketmaster', url: 'https://www.universe.com/events/lassu-parramatta-tickets-VFJHS5' }),
  )
  assert.equal(laterClock.action, 'review')
})

test('a shared tour URL matches its own start and not another date', () => {
  const rows = [
    { eventId: 'night-6', sessionKey: '2026-11-06|' },
    { eventId: 'night-7', sessionKey: '2026-11-07|' },
  ]
  assert.equal(matchSourceSession(rows, { date: '2026-11-06', time: null }), 'night-6')
  assert.equal(matchSourceSession([{ eventId: 'only', sessionKey: '2026-11-06|' }], { date: '2026-11-14', time: null }), null)
  assert.equal(matchSourceSession([{ eventId: 'open', sessionKey: '2026-11-10|' }], { date: '2026-11-10', time: '19:30' }), 'open')
  assert.equal(matchSourceSession([
    { eventId: 'early', sessionKey: '2026-11-14|14:00' },
    { eventId: 'late', sessionKey: '2026-11-14|19:30' },
  ], { date: '2026-11-14', time: '19:30:00' }), 'late')
  assert.equal(matchSourceSession([
    { eventId: 'early', sessionKey: '2026-11-14|14:00' },
    { eventId: 'late', sessionKey: '2026-11-14|19:30' },
  ], { date: '2026-11-14', time: null }), null)
})

test('a source link cannot move ownership, and the public event path stays id-based', () => {
  assert.throws(() => assertNoOwnershipTransfer({ promoterId: 'ada' }), /promoterId/)
  assert.doesNotThrow(() => assertNoOwnershipTransfer({ sources: ['brisbanecouncil'], ticketUrl: 'https://example.com/go' }))
  const path = eventPath({ id: 'clabc123', title: 'Jazz night' })
  assert.equal(path, '/events/jazz-night-clabc123')
  assert.equal(eventPath({ id: 'clabc123', title: 'Jazz night live' }).endsWith('-clabc123'), true)
})
