import assert from 'node:assert/strict'
import test from 'node:test'
import { eventPath } from './seo'
import {
  assertNoOwnershipTransfer,
  canonicalizeListingUrl,
  compareCatalogue,
  decideDuplicate,
  type IdentityEvent,
} from './event-identity'

const day = '2026-11-14'

function row(partial: Partial<IdentityEvent> & Pick<IdentityEvent, 'title' | 'venueName'>): IdentityEvent {
  return { date: day, city: 'Sydney', time: '19:30', ...partial }
}

test('tracking parameters drop and session ids stay', () => {
  const url = canonicalizeListingUrl('https://www.Example.com/events/show/?utm_source=news&eventid=55&fbclid=abc')
  assert.equal(url, 'https://www.example.com/events/show?eventid=55')
  assert.equal(canonicalizeListingUrl('https://tickets.example/search?q=jazz'), null)
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

test('a source link cannot move ownership, and the public event path stays id-based', () => {
  assert.throws(() => assertNoOwnershipTransfer({ promoterId: 'ada' }), /promoterId/)
  assert.doesNotThrow(() => assertNoOwnershipTransfer({ sources: ['brisbanecouncil'], ticketUrl: 'https://example.com/go' }))
  const path = eventPath({ id: 'clabc123', title: 'Jazz night' })
  assert.equal(path, '/events/jazz-night-clabc123')
  assert.equal(eventPath({ id: 'clabc123', title: 'Jazz night live' }).endsWith('-clabc123'), true)
})
