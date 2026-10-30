import assert from 'node:assert/strict'
import { test } from 'node:test'
import { interpretQuery } from './ai-search-parse'

const TODAY = '2026-10-28'

test('explicit years are not replaced by the default two-week window', () => {
  const year = interpretQuery('upcoming top music artists in Sydney in 2027', TODAY, {
    dateFrom: TODAY, dateTo: '2026-11-11', category: 'Music', keywords: ['upcoming', '2027', 'sydney'],
  })
  assert.equal(year.dateFrom, '2027-01-01')
  assert.equal(year.dateTo, '2027-12-31')
  assert.equal(year.city, 'Sydney')
  assert.equal(year.category, 'Music')
  assert.equal(year.keywords.includes('upcoming'), false)

  const month = interpretQuery('in January 2027', TODAY)
  assert.equal(month.dateFrom, '2027-01-01')
  assert.equal(month.dateTo, '2027-01-31')

  const sydney = interpretQuery('Sydney music 2027', TODAY)
  assert.equal(sydney.dateFrom, '2027-01-01')
  assert.equal(sydney.dateTo, '2027-12-31')
  assert.equal(sydney.city, 'Sydney')
  assert.equal(sydney.category, 'Music')

  const label = (key: string) => {
    const d = new Date(`${key}T00:00:00Z`)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return `${days[d.getUTCDay()]}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${key.slice(0, 4)}`
  }
  const chip = `${label(year.dateFrom)} – ${label(year.dateTo)}`
  assert.match(chip, /1 Jan 2027/)
  assert.match(chip, /31 Dec 2027/)
})

const FRIDAY = '2026-10-30'

test('markets stay a keyword and are not a hard Community filter', () => {
  const markets = interpretQuery('Markets this weekend', FRIDAY)
  assert.equal(markets.dateFrom, '2026-10-31')
  assert.equal(markets.dateTo, '2026-11-01')
  assert.equal(markets.category, '')
  assert.equal(markets.subTag, '')
  assert.equal(markets.categoryStrict, false)
  assert.deepEqual(markets.keywords, ['market'])
  assert.equal(markets.keywords.includes('weekend'), false)

  const glebe = interpretQuery('glebe markets', FRIDAY)
  assert.equal(glebe.suburb, 'Glebe')
  assert.deepEqual(glebe.keywords, ['market'])

  const qvm = interpretQuery('Queen Victoria Market', FRIDAY)
  assert.deepEqual(qvm.keywords, ['queen', 'victoria', 'market'])

  const bondi = interpretQuery('markets in Bondi this weekend', FRIDAY)
  assert.equal(bondi.suburb, 'Bondi')
  assert.equal(bondi.dateFrom, '2026-10-31')
  assert.deepEqual(bondi.keywords, ['market'])

  const rocks = interpretQuery('the rocks markets', FRIDAY)
  assert.equal(rocks.category, '')
  assert.equal(rocks.suburb, 'The Rocks')
  assert.deepEqual(rocks.keywords, ['market'])

  const fremantle = interpretQuery('fremantle markets', FRIDAY)
  assert.equal(fremantle.city, 'Perth')
  assert.equal(fremantle.suburb, 'Fremantle')
  assert.deepEqual(fremantle.keywords, ['market'])
})

test('dates use the Sydney calendar and do not leak into keywords', () => {
  const nextWeekend = interpretQuery('next weekend', FRIDAY)
  assert.equal(nextWeekend.dateFrom, '2026-11-07')
  assert.equal(nextWeekend.dateTo, '2026-11-08')
  assert.equal(nextWeekend.keywords.includes('next'), false)
  assert.equal(nextWeekend.keywords.includes('weekend'), false)

  const nextWeek = interpretQuery('next week', FRIDAY)
  assert.equal(nextWeek.dateFrom, '2026-11-02')
  assert.equal(nextWeek.dateTo, '2026-11-08')
  assert.deepEqual(nextWeek.keywords, [])

  const saturday = interpretQuery('on Saturday', FRIDAY)
  assert.equal(saturday.dateFrom, '2026-10-31')
  assert.equal(saturday.dateTo, '2026-10-31')
  assert.deepEqual(saturday.keywords, [])

  const sundayNight = interpretQuery('sunday night', FRIDAY)
  assert.equal(sundayNight.dateFrom, '2026-11-01')
  assert.equal(sundayNight.timeOfDay, 'evening')
  assert.deepEqual(sundayNight.keywords, [])

  const friday = interpretQuery('friday', FRIDAY)
  assert.equal(friday.dateFrom, FRIDAY)
  assert.equal(friday.dateTo, FRIDAY)

  const seventh = interpretQuery('events 7 Nov', FRIDAY)
  assert.equal(seventh.dateFrom, '2026-11-07')
  assert.equal(seventh.dateTo, '2026-11-07')
  assert.deepEqual(seventh.keywords, [])

  const fourteenth = interpretQuery('14 November', FRIDAY)
  assert.equal(fourteenth.dateFrom, '2026-11-14')
  assert.equal(fourteenth.dateTo, '2026-11-14')

  const november = interpretQuery('events in November', FRIDAY)
  assert.equal(november.dateFrom, '2026-11-01')
  assert.equal(november.dateTo, '2026-11-30')

  const month = interpretQuery('this month', FRIDAY)
  assert.equal(month.dateFrom, FRIDAY)
  assert.equal(month.dateTo, '2026-10-31')

  const christmas = interpretQuery('Christmas', FRIDAY)
  assert.equal(christmas.dateFrom, '2026-12-25')
  assert.equal(christmas.dateTo, '2026-12-25')
  assert.deepEqual(christmas.keywords, [])

  const nye = interpretQuery('NYE', FRIDAY)
  assert.equal(nye.dateFrom, '2026-12-31')
  assert.deepEqual(nye.keywords, [])

  const tonight = interpretQuery('trivia tonight', FRIDAY)
  assert.equal(tonight.dateFrom, FRIDAY)
  assert.equal(tonight.timeOfDay, 'evening')
  assert.deepEqual(tonight.keywords, ['trivia'])

  const tomorrow = interpretQuery('markets tomorrow', FRIDAY)
  assert.equal(tomorrow.dateFrom, '2026-10-31')
  assert.deepEqual(tomorrow.keywords, ['market'])
})

test('topic words survive category guesses, and typos fold in', () => {
  const art = interpretQuery('art exhibition', FRIDAY)
  assert.ok(art.keywords.includes('exhibition'))
  assert.ok(art.keywords.includes('art'))
  assert.equal(art.categoryStrict, false)

  const food = interpretQuery('food festival', FRIDAY)
  assert.ok(food.keywords.includes('food'))
  assert.ok(food.keywords.includes('festival'))
  assert.equal(food.category, '')

  const opera = interpretQuery('opera', FRIDAY)
  assert.deepEqual(opera.keywords, ['opera'])
  assert.equal(opera.categoryStrict, false)

  const hop = interpretQuery('hip hop', FRIDAY)
  assert.ok(hop.keywords.includes('hip'))
  assert.ok(hop.keywords.includes('hop'))

  const theatre = interpretQuery('theatre this weekend', FRIDAY)
  assert.deepEqual(theatre.keywords, ['theatre'])
  assert.equal(theatre.dateFrom, '2026-10-31')

  assert.deepEqual(interpretQuery('markts', FRIDAY).keywords, ['market'])
  assert.deepEqual(interpretQuery('comdey', FRIDAY).keywords, ['comedy'])
  assert.deepEqual(interpretQuery('jaz bar', FRIDAY).keywords, ['jazz'])
  assert.deepEqual(interpretQuery('bazaar', FRIDAY).keywords, ['market'])
  assert.deepEqual(interpretQuery('makers market', FRIDAY).keywords, ['market'])

  const perth = interpretQuery('comedy in Perth', FRIDAY)
  assert.equal(perth.city, 'Perth')
  assert.deepEqual(perth.keywords, ['comedy'])
  assert.equal(perth.categoryStrict, false)

  const free = interpretQuery('free events this weekend', FRIDAY)
  assert.equal(free.isFree, true)
  assert.equal(free.dateFrom, '2026-10-31')
  assert.deepEqual(free.keywords, [])
})

test('relative dates still resolve when no year is named', () => {
  const tonight = interpretQuery('live music tonight', TODAY)
  assert.equal(tonight.dateFrom, TODAY)
  assert.equal(tonight.dateTo, TODAY)
  assert.equal(tonight.timeOfDay, 'evening')
  const loose = interpretQuery('upcoming jazz', TODAY)
  assert.equal(loose.dateFrom, TODAY)
  assert.equal(loose.dateTo, '2026-11-10')
  assert.equal(loose.keywords.includes('upcoming'), false)
})
