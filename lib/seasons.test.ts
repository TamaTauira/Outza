import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CITIES } from './cities'
import type { InvRow } from './local-seo'
import { isLandingSuburb } from './seo'
import { easterSunday, evaluateSeasons, seasonCopy, seasonWindow } from './seasons'

const sydney = CITIES.find((c) => c.name === 'Sydney')!
const NOW = new Date('2026-10-30T02:00:00Z')

function row(id: string, date: string): InvRow {
  return { id, dates: [date], time: '11:00', endTime: null, suburb: null, suburbSlug: null, source: 'event', topics: [], organiserSubmitted: false }
}

test('easter sunday matches the published dates', () => {
  assert.equal(easterSunday(2024), '2024-03-31')
  assert.equal(easterSunday(2026), '2026-04-05')
  assert.equal(easterSunday(2027), '2027-03-28')
  assert.equal(easterSunday(2028), '2028-04-16')
})

test('season windows are upcoming and clipped to today', () => {
  assert.deepEqual(seasonWindow('christmas', sydney, NOW), { from: '2026-12-01', to: '2026-12-26' })
  assert.deepEqual(seasonWindow('new-years-eve', sydney, NOW), { from: '2026-12-31', to: '2027-01-01' })
  assert.deepEqual(seasonWindow('summer', sydney, NOW), { from: '2026-12-01', to: '2027-02-28' })
  assert.deepEqual(seasonWindow('school-holidays', sydney, NOW), { from: '2026-12-15', to: '2027-01-31' })
  assert.deepEqual(seasonWindow('easter', sydney, NOW), { from: '2027-03-26', to: '2027-03-29' })

  const lateChristmas = new Date('2026-12-20T02:00:00Z')
  assert.deepEqual(seasonWindow('christmas', sydney, lateChristmas), { from: '2026-12-20', to: '2026-12-26' })
  const afterChristmas = new Date('2026-12-27T02:00:00Z')
  assert.deepEqual(seasonWindow('christmas', sydney, afterChristmas), { from: '2027-12-01', to: '2027-12-26' })

  const midSummer = new Date('2028-01-15T02:00:00Z')
  assert.deepEqual(seasonWindow('summer', sydney, midSummer), { from: '2028-01-15', to: '2028-02-29' })
})

test('season titles use the clipped window, not a stale start date', () => {
  const copy = seasonCopy({
    city: 'Sydney',
    season: { key: 'christmas', label: 'Christmas', h1: (c) => `Christmas events in ${c}`, blurb: () => 'Markets and carols.' },
    from: '2026-12-20',
    to: '2026-12-26',
    total: 4,
  })
  assert.match(copy.title, /20 Dec/)
  assert.match(copy.title, /26 Dec/)
  assert.doesNotMatch(copy.title, /1 Dec/)
  assert.match(copy.description, /4 upcoming listings/)
})

test('seasonal pages index only a distinct slice of the city inventory', () => {
  assert.equal(isLandingSuburb('Christmas', sydney), false)
  assert.equal(isLandingSuburb('Summer Hill', sydney), true)

  const rows = [
    ...Array.from({ length: 6 }, (_, i) => row(`xmas-${i}`, '2026-12-20')),
    ...Array.from({ length: 10 }, (_, i) => row(`mar-${i}`, '2027-03-01')),
  ]
  const decisions = evaluateSeasons(sydney, rows, NOW)
  const christmas = decisions.find((d) => d.key === 'christmas')
  const nye = decisions.find((d) => d.key === 'new-years-eve')
  assert.equal(christmas?.index, true)
  assert.equal(christmas?.total, 6)
  assert.equal(nye?.reason, 'empty')
  assert.equal(nye?.index, false)

  const onlyChristmas = Array.from({ length: 6 }, (_, i) => row(`only-${i}`, '2026-12-20'))
  const collapsed = evaluateSeasons(sydney, onlyChristmas, NOW).find((d) => d.key === 'christmas')
  assert.equal(collapsed?.reason, 'near-duplicate')
  assert.equal(collapsed?.index, false)

  const thin = evaluateSeasons(sydney, [row('a', '2026-12-20'), row('b', '2026-12-21'), row('c', '2027-03-01')], NOW)
  assert.equal(thin.find((d) => d.key === 'christmas')?.reason, 'thin')
})
