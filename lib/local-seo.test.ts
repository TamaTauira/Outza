import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CITIES } from './cities'
import {
  evaluateGuides, guideCopy, matchesTopic, parseCombo, relatedGuides, specFromParsed, whenRange,
  type InvRow,
} from './local-seo'
import { isLandingSuburb, type TopicKey } from './seo'

const sydney = CITIES.find((c) => c.name === 'Sydney')!
const NOW = new Date('2026-10-28T12:00:00Z') // Wednesday in Australia/Sydney

function row(partial: Partial<InvRow> & Pick<InvRow, 'id' | 'dates'>): InvRow {
  const suburb = partial.suburb ?? null
  return {
    id: partial.id,
    dates: partial.dates,
    time: partial.time ?? '19:00',
    endTime: partial.endTime ?? null,
    suburb,
    suburbSlug: partial.suburbSlug ?? (suburb ? suburb.toLowerCase().replace(/[^a-z0-9]+/g, '-') : null),
    source: partial.source ?? 'event',
    topics: partial.topics ?? [],
    organiserSubmitted: partial.organiserSubmitted ?? false,
  }
}

const suburbs = [{ name: 'Newtown', slug: 'newtown' }]

test('when windows follow the city calendar', () => {
  assert.deepEqual(whenRange(sydney, 'tonight', NOW), { from: '2026-10-28', to: '2026-10-28' })
  assert.deepEqual(whenRange(sydney, 'this-weekend', NOW), { from: '2026-10-30', to: '2026-11-01' })
  assert.deepEqual(whenRange(sydney, 'friday', NOW), { from: '2026-10-30', to: '2026-10-30' })
  assert.deepEqual(whenRange(sydney, 'saturday', NOW), { from: '2026-10-31', to: '2026-10-31' })
  assert.deepEqual(whenRange(sydney, 'sunday', NOW), { from: '2026-11-01', to: '2026-11-01' })
  const sunday = new Date('2026-11-01T12:00:00Z')
  assert.deepEqual(whenRange(sydney, 'sunday', sunday), { from: '2026-11-01', to: '2026-11-01' })
  assert.deepEqual(whenRange(sydney, 'this-weekend', sunday), { from: '2026-11-01', to: '2026-11-01' })
})

test('weekday and topic slugs cannot become suburb pages', () => {
  assert.equal(isLandingSuburb('Friday', sydney), false)
  assert.equal(isLandingSuburb('Sunday', sydney), false)
  assert.equal(isLandingSuburb('Markets', sydney), false)
  assert.equal(isLandingSuburb('Newtown', sydney), true)
})

test('topic matchers follow listing text, not a generic article', () => {
  const base = { category: 'Community', isFree: false, isLGBTI: false, subTags: [] as string[] }
  assert.equal(matchesTopic({ ...base, title: 'Glebe Markets' }, 'markets'), true)
  assert.equal(matchesTopic({ ...base, title: 'Marketing workshop' }, 'markets'), false)
  assert.equal(matchesTopic({ ...base, category: 'Business', title: 'Sunday market' }, 'markets'), false)
  assert.equal(matchesTopic({ ...base, title: 'Garage sale on King St' }, 'garage-sales'), true)
  assert.equal(matchesTopic({ ...base, category: 'Music', title: 'Comedy night at the factory' }, 'live-music'), false)
  assert.equal(matchesTopic({ ...base, category: 'Music', title: 'Pub gig' }, 'live-music'), true)
  assert.equal(matchesTopic({ ...base, category: 'Music', title: 'Pub gig', isFree: true }, 'free-events'), true)
})

test('combination URLs accept only activity, suburb and when in that grammar', () => {
  const marketsSunday = parseCombo(sydney, ['markets', 'sunday'], suburbs)
  assert.equal(marketsSunday?.kind, 'city-activity-when')
  assert.equal(specFromParsed(marketsSunday!).activity, 'markets')
  assert.equal(specFromParsed(marketsSunday!).when, 'sunday')

  assert.equal(parseCombo(sydney, ['newtown', 'markets'], suburbs)?.kind, 'suburb-activity')
  assert.equal(parseCombo(sydney, ['newtown', 'sunday'], suburbs)?.kind, 'suburb-when')
  assert.equal(parseCombo(sydney, ['newtown', 'markets', 'sunday'], suburbs)?.kind, 'suburb-activity-when')
  assert.equal(parseCombo(sydney, ['Markets', 'This-Weekend'], suburbs)?.kind, 'city-activity-when')

  assert.equal(parseCombo(sydney, ['events', 'sunday'], suburbs), null)
  assert.equal(parseCombo(sydney, ['this-weekend', 'markets'], suburbs), null)
  assert.equal(parseCombo(sydney, ['markets', 'newtown'], suburbs), null)
  assert.equal(parseCombo(sydney, ['newtown', 'friday', 'markets'], suburbs), null)
  assert.equal(parseCombo(sydney, ['garage-sales', 'near-me'], suburbs), null)
  assert.equal(parseCombo(sydney, ['no-such-suburb', 'markets'], suburbs), null)
  assert.equal(parseCombo(melbourneGuard(), ['newtown', 'markets'], []), null)
})

function melbourneGuard() {
  return CITIES.find((c) => c.name === 'Melbourne')!
}

test('copy names the place, the date intent and a real venue', () => {
  const copy = guideCopy({
    city: 'Sydney',
    activity: { key: 'markets', label: 'Markets', heading: (c) => `Markets in ${c}`, blurb: () => '' },
    when: 'sunday',
    suburb: 'Newtown',
    total: 6,
    from: '2026-11-01',
    to: '2026-11-01',
    venues: ['Carriageworks', 'Sydney'],
  })
  assert.equal(copy.h1, 'Markets in Newtown, Sydney on Sunday')
  assert.match(copy.title, /Markets in Newtown, Sydney on Sunday/)
  assert.match(copy.title, /VibePeep/)
  assert.match(copy.description, /6 upcoming markets in Newtown, Sydney on Sunday/)
  assert.match(copy.description, /Carriageworks/)
  assert.doesNotMatch(copy.description, /On this page: Sydney/)
})

test('empty inventory indexes nothing', () => {
  assert.deepEqual(evaluateGuides(sydney, [], NOW), [])
})

test('a distinct weekend slice is indexed and a repeated Sunday is not', () => {
  const rows: InvRow[] = [
    ...Array.from({ length: 6 }, (_, i) => row({ id: `sun-${i}`, dates: ['2026-11-01'], topics: ['markets'] as TopicKey[], suburb: i < 2 ? 'Newtown' : 'Marrickville' })),
    ...Array.from({ length: 10 }, (_, i) => row({ id: `sat-${i}`, dates: ['2026-10-31'], topics: ['markets'] as TopicKey[], suburb: 'Marrickville' })),
  ]
  const decisions = evaluateGuides(sydney, rows, NOW)
  const byPath = new Map(decisions.map((d) => [d.path, d]))
  assert.equal(byPath.get('/sydney/markets')?.index, true)
  assert.equal(byPath.get('/sydney/markets/sunday')?.index, true)
  assert.equal(byPath.get('/sydney/markets/this-weekend')?.reason, 'near-duplicate')
  assert.equal(byPath.get('/sydney/markets/this-weekend')?.canonicalPath, '/sydney/markets')
  assert.equal(byPath.has('/sydney/sunday'), false)

  const allSunday = Array.from({ length: 6 }, (_, i) => row({ id: `only-${i}`, dates: ['2026-11-01'], topics: ['markets'] as TopicKey[] }))
  const collapsed = evaluateGuides(sydney, allSunday, NOW)
  const sunday = collapsed.find((d) => d.path === '/sydney/markets/sunday')
  const weekend = collapsed.find((d) => d.path === '/sydney/markets/this-weekend')
  assert.equal(sunday?.reason, 'near-duplicate')
  assert.equal(sunday?.canonicalPath, '/sydney/markets')
  assert.equal(weekend?.reason, 'near-duplicate')
  assert.equal(weekend?.canonicalPath, '/sydney/markets')
  assert.equal(collapsed.find((d) => d.path === '/sydney/markets')?.index, true)
})

test('free events this weekend index only with enough distinct listings', () => {
  const thin = Array.from({ length: 4 }, (_, i) => row({ id: `f-${i}`, dates: ['2026-10-31'], topics: ['free-events'] as TopicKey[] }))
  assert.equal(evaluateGuides(sydney, thin, NOW).find((d) => d.path === '/sydney/free-events/this-weekend')?.reason, 'thin')

  const rows = [
    ...Array.from({ length: 6 }, (_, i) => row({ id: `free-${i}`, dates: ['2026-10-31'], topics: ['free-events'] as TopicKey[] })),
    ...Array.from({ length: 10 }, (_, i) => row({ id: `paid-${i}`, dates: ['2026-10-31'], topics: ['live-music'] as TopicKey[] })),
    ...Array.from({ length: 8 }, (_, i) => row({ id: `later-${i}`, dates: ['2026-12-01'], topics: ['free-events'] as TopicKey[] })),
  ]
  const freeWeekend = evaluateGuides(sydney, rows, NOW).find((d) => d.path === '/sydney/free-events/this-weekend')
  assert.equal(freeWeekend?.index, true)
  assert.equal(freeWeekend?.total, 6)
})

test('suburb activity pages refuse thin, stale and near-duplicate sets', () => {
  const markets = (id: string, date: string, topic: TopicKey = 'markets'): InvRow =>
    row({ id, dates: [date], topics: [topic], suburb: 'Newtown', suburbSlug: 'newtown' })
  const freshDistinct = [
    ...Array.from({ length: 2 }, (_, i) => markets(`f-${i}`, '2026-11-01')),
    ...Array.from({ length: 3 }, (_, i) => markets(`l-${i}`, '2026-12-20')),
    ...Array.from({ length: 5 }, (_, i) => markets(`o-${i}`, '2026-11-01', 'live-music')),
    ...Array.from({ length: 6 }, (_, i) => row({ id: `else-${i}`, dates: ['2026-11-01'], topics: ['markets'], suburb: 'Marrickville', suburbSlug: 'marrickville' })),
  ]
  const ok = evaluateGuides(sydney, freshDistinct, NOW).find((d) => d.path === '/sydney/newtown/markets')
  assert.equal(ok?.index, true)
  assert.equal(ok?.fresh, 2)

  const stale = [
    ...Array.from({ length: 6 }, (_, i) => markets(`s-${i}`, '2026-12-20')),
    ...Array.from({ length: 4 }, (_, i) => markets(`g-${i}`, '2026-11-01', 'live-music')),
  ]
  assert.equal(evaluateGuides(sydney, stale, NOW).find((d) => d.path === '/sydney/newtown/markets')?.reason, 'stale')

  const same = Array.from({ length: 6 }, (_, i) => markets(`m-${i}`, '2026-11-01'))
  const dup = evaluateGuides(sydney, same, NOW).find((d) => d.path === '/sydney/newtown/markets')
  assert.equal(dup?.reason, 'near-duplicate')
  assert.equal(dup?.canonicalPath, '/sydney/markets')
})

test('related links point at other indexable slices, not the current page', () => {
  const rows: InvRow[] = [
    ...Array.from({ length: 6 }, (_, i) => row({ id: `nt-${i}`, dates: ['2026-11-01'], topics: ['markets'], suburb: 'Newtown', suburbSlug: 'newtown' })),
    ...Array.from({ length: 6 }, (_, i) => row({ id: `nt-other-${i}`, dates: ['2026-11-02'], topics: ['live-music'], suburb: 'Newtown', suburbSlug: 'newtown' })),
    ...Array.from({ length: 10 }, (_, i) => row({ id: `sat-${i}`, dates: ['2026-10-31'], topics: ['markets'], suburb: 'Marrickville', suburbSlug: 'marrickville' })),
    ...Array.from({ length: 8 }, (_, i) => row({ id: `other-${i}`, dates: ['2026-11-10'], topics: ['live-music'], suburb: 'Marrickville', suburbSlug: 'marrickville' })),
  ]
  const decisions = evaluateGuides(sydney, rows, NOW)
  const links = relatedGuides(decisions, '/sydney/markets', 'Sydney')
  const hrefs = links.map((l) => l.href)
  assert.equal(hrefs.includes('/sydney/markets'), false)
  assert.equal(hrefs.includes('/sydney/markets/sunday'), true)
  assert.equal(hrefs.includes('/sydney/newtown/markets'), true)
  assert.match(links.find((l) => l.href === '/sydney/newtown/markets')!.title, /Newtown/)
})

test('every supported city can host the same combination paths', () => {
  for (const city of CITIES) {
    const parsed = parseCombo(city, ['markets', 'this-weekend'], [])
    assert.equal(parsed?.kind, 'city-activity-when')
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => row({ id: `${city.name}-w-${i}`, dates: ['2026-10-31'], topics: ['markets'] as TopicKey[] })),
      ...Array.from({ length: 6 }, (_, i) => row({ id: `${city.name}-o-${i}`, dates: ['2026-10-31'], topics: ['live-music'] as TopicKey[] })),
      ...Array.from({ length: 4 }, (_, i) => row({ id: `${city.name}-l-${i}`, dates: ['2026-12-01'], topics: ['markets'] as TopicKey[] })),
    ]
    const path = `/${city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/markets/this-weekend`
    const decision = evaluateGuides(city, rows, NOW).find((d) => d.path === path)
    assert.equal(decision?.index, true, city.name)
  }
})
