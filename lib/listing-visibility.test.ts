import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collapseShowings, hiddenFromPublic, sameShowing, titleAgreesWithSession } from './listing-visibility'

const night = {
  city: 'Sydney',
  date: '2026-11-21',
  time: '21:00',
  endTime: '03:00',
  ticketUrl: 'https://tickets.example/1',
  source: 'eventbrite',
}

test('a title that names another day is not this session', () => {
  assert.equal(titleAgreesWithSession('GLASS HOUSE HALLOWEEN BLOCK PARTY', '2026-11-21'), false)
  assert.equal(titleAgreesWithSession('GLASS HOUSE HALLOWEEN BLOCK PARTY', '2026-10-31'), true)
  assert.equal(titleAgreesWithSession('GLASSHOUSE X SUNDAY SWEATS: NOVEMBER 7TH CANCER FUNDRAISER', '2026-11-21'), false)
  assert.equal(titleAgreesWithSession('GLASSHOUSE X SUNDAY SWEATS: NOVEMBER 7TH CANCER FUNDRAISER', '2026-11-07'), true)
  assert.equal(titleAgreesWithSession('GLASSHOUSE - HOME THE VENUE 21ST NOV', '2026-11-21'), true)
  assert.equal(titleAgreesWithSession('GLASSHOUSE - HOME THE VENUE 21ST NOV', '2026-11-28'), false)
  assert.equal(titleAgreesWithSession('Homemade Saturdays - 21st November 2026', '2026-11-21'), true)
  assert.equal(titleAgreesWithSession('GLASSHOUSE - HOME THE VENUE', '2026-11-21'), true)
})

test('the Home Saturday cluster keeps one Glasshouse night and one Homemade night', () => {
  const rows = [
    { ...night, id: 'halloween', title: 'GLASS HOUSE HALLOWEEN BLOCK PARTY: FEAT SECRET GUESTS + MORE', venueName: 'Home The Venue' },
    { ...night, id: 'plain', title: 'GLASSHOUSE - HOME THE VENUE', venueName: 'Home The Venue' },
    { ...night, id: 'dated', title: 'GLASSHOUSE - HOME THE VENUE 21ST NOV', venueName: 'Home The Venue' },
    { ...night, id: 'sweats', title: 'GLASSHOUSE X SUNDAY SWEATS: NOVEMBER 7TH CANCER FUNDRAISER', venueName: 'Home The Venue' },
    { ...night, id: 'main', title: 'Homemade Saturdays - 21st November 2026', venueName: 'Home Main Venue', endTime: '05:00' },
    { ...night, id: 'free', title: 'Homemade Saturdays: Free Entry + Complimentary Drink', venueName: 'Home The Venue', endTime: '04:00' },
  ]
  const visible = collapseShowings(rows.filter((row) => !hiddenFromPublic(row, new Date('2026-11-21T08:00:00+11:00'))))
  assert.deepEqual(visible.map((row) => row.id), ['dated', 'main'])
  assert.equal(sameShowing(rows[1], rows[2]), true)
  assert.equal(sameShowing(rows[4], rows[5]), true)
  assert.equal(sameShowing(rows[1], { ...rows[1], time: '18:00' }), false)
  assert.equal(sameShowing(rows[1], { ...rows[1], date: '2026-11-28' }), false)
})

test('a finish instant already past is hidden, a later finish is not', () => {
  const base = { ...night, title: 'GLASSHOUSE - HOME THE VENUE', venueName: 'Home The Venue' }
  assert.equal(hiddenFromPublic({ ...base, endsAt: '2026-11-20T16:00:00.000Z' }, new Date('2026-11-20T22:00:00.000Z')), true)
  assert.equal(hiddenFromPublic({ ...base, endsAt: '2026-11-21T16:00:00.000Z' }, new Date('2026-11-20T22:00:00.000Z')), false)
})
