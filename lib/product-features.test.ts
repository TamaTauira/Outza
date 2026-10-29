import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventsToIcs } from './ics'
import { buildOuting, OUTING_TEMPLATES, type OutingEvent } from './outings'
import { outzaVerified } from './quality'
import { nextVote, validToken, venueKey } from './together'
import { composeWatchEmail, inReminderWindow, mailDue } from './watch-shared'
import { zonedWallTime } from './zoned-time'

const sample = {
  title: 'Late show',
  date: '2026-11-02T00:00:00.000Z',
  time: '19:30',
  venueName: 'Enmore Theatre',
  city: 'Sydney',
  isFree: false,
  price: '$42',
  ticketUrl: 'https://tickets.example/show',
  source: 'ticketmaster',
  status: 'SCHEDULED',
  duplicateOfId: null,
  lastVerifiedAt: '2026-10-28T02:00:00.000Z',
  openReportReasons: [] as string[],
}
const now = Date.parse('2026-10-29T01:00:00.000Z')

test('VibePeep Verified stays off unless every check passes', () => {
  assert.equal(outzaVerified(sample, now).ok, true)
  assert.equal(outzaVerified({ ...sample, openReportReasons: undefined }, now).ok, false)
  assert.equal(outzaVerified({ ...sample, openReportReasons: ['DUPLICATE'] }, now).ok, false)
  assert.equal(outzaVerified({ ...sample, openReportReasons: ['WRONG_PRICE'] }, now).ok, true)
  assert.equal(outzaVerified({ ...sample, duplicateOfId: 'other' }, now).ok, false)
  assert.equal(outzaVerified({ ...sample, status: 'CANCELLED' }, now).ok, false)
  assert.equal(outzaVerified({ ...sample, time: null }, now).ok, false)
  assert.equal(outzaVerified({ ...sample, venueName: 'Sydney' }, now).ok, false)
  assert.equal(outzaVerified({ ...sample, source: 'somewhere' }, now).ok, false)
  assert.equal(outzaVerified({ ...sample, lastVerifiedAt: '2026-10-01T00:00:00.000Z' }, now).ok, false)
  assert.equal(outzaVerified({ ...sample, date: '2026-10-01T00:00:00.000Z' }, now).ok, false)
  assert.equal(outzaVerified({ ...sample, ticketUrl: null, organiserUrl: null }, now).ok, false)
})

test('one Together vote per person, and a repeat tap clears it', () => {
  assert.equal(nextVote(null, 'a'), 'a')
  assert.equal(nextVote('a', 'b'), 'b')
  assert.equal(nextVote('a', 'a'), null)
  assert.equal(validToken('a'.repeat(32)), true)
  assert.equal(validToken('short'), false)
  assert.equal(venueKey('Enmore Theatre', 'Sydney'), 'sydney|enmore theatre')
})

test('day plans only use listings that fit, and add dining and transport notes', () => {
  const events: OutingEvent[] = [
    { id: '1', title: 'Jazz', date: '2026-10-31', time: '19:00', venueName: 'Foundry', city: 'Sydney', category: 'Music', isFree: false, priceMin: 30 },
    { id: '2', title: 'Comedy', date: '2026-10-31', time: '21:30', venueName: 'Factory', city: 'Sydney', category: 'Arts & Culture', isFree: false, priceMin: 25 },
    { id: '3', title: 'Morning market', date: '2026-10-31', time: '09:00', venueName: 'Carriageworks', city: 'Sydney', category: 'Community', isFree: true },
    { id: '4', title: 'Kids show', date: '2026-11-01', time: '11:00', venueName: 'Riverside', city: 'Sydney', category: 'Family', isFree: false, priceMin: 20 },
    { id: '5', title: 'Pricey gala', date: '2026-11-01', time: '14:00', venueName: 'Opera House', city: 'Sydney', category: 'Family', isFree: false, priceMin: 180 },
    { id: '6', title: 'Park music', date: '2026-10-30', time: '15:00', venueName: 'The Domain', city: 'Sydney', category: 'Music', isFree: true, price: 'Free' },
  ]
  const dateNight = buildOuting(OUTING_TEMPLATES[0], events, 'Sydney')
  assert.deepEqual(dateNight.eventIds, ['1', '2'])
  assert.equal(dateNight.stops.filter((s) => s.kind === 'tip' && s.tip === 'dining').length, 1)
  assert.equal(dateNight.stops.some((s) => s.kind === 'tip' && s.tip === 'transport' && s.href.includes('transportnsw')), true)
  assert.equal(dateNight.stops.some((s) => s.kind === 'tip' && s.text.toLowerCase().includes('book')), true)

  const sunday = buildOuting(OUTING_TEMPLATES[1], events, 'Sydney')
  assert.deepEqual(sunday.eventIds, ['4'])
  assert.equal(sunday.eventIds.includes('5'), false)

  const free = buildOuting(OUTING_TEMPLATES[2], events, 'Sydney')
  assert.equal(free.eventIds.includes('6'), true)
  assert.equal(free.eventIds.includes('1'), false)
})

test('calendar export names the saved event and does not invent a timezone conversion in the stamp', () => {
  const ics = eventsToIcs([{
    id: 'evt1', title: 'Jazz', date: '2026-11-02T00:00:00.000Z', time: '19:30', venueName: 'Enmore Theatre', city: 'Sydney',
    url: 'https://outza-outza.vercel.app/events/jazz-evt1',
  }], { stamp: new Date('2026-10-29T00:00:00.000Z') })
  assert.match(ics, /SUMMARY:Jazz/)
  assert.match(ics, /DTSTART;TZID=Australia\/Sydney:20261102T193000/)
  assert.match(ics, /URL:https:\/\/outza-outza\.vercel\.app\/events\/jazz-evt1/)
  assert.equal(ics.includes('abacus'), false)
})

test('watchlist mail is opt-in shaped: empty plans send nothing, reminders use a real window', () => {
  assert.equal(composeWatchEmail({ saved: [], matches: [] }), null)
  const mail = composeWatchEmail({
    saved: [{ id: '1', title: 'Jazz', when: 'Mon 2 Nov 19:30', venue: 'Enmore Theatre, Sydney', href: 'https://outza-outza.vercel.app/events/jazz-1' }],
    matches: [],
    reminders: true,
  })
  assert.ok(mail)
  assert.match(mail.subject, /coming up/)
  assert.match(mail.text, /Jazz/)
  assert.equal(mailDue(new Date(now), 'weekly', now + 1000), false)
  assert.equal(mailDue(null, 'weekly', now), true)
  assert.equal(inReminderWindow('2026-10-30', '19:00', 'Sydney', new Date('2026-10-29T08:00:00.000Z')), true)
  assert.equal(inReminderWindow('2026-12-01', '19:00', 'Sydney', new Date('2026-10-29T08:00:00.000Z')), false)
})

test('Sydney wall time converts to the matching UTC instant', () => {
  const instant = zonedWallTime('2026-10-29', '19:00', 'Australia/Sydney')
  assert.equal(instant.toISOString(), '2026-10-29T08:00:00.000Z')
})
