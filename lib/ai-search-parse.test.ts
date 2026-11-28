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
  assert.equal(markets.dateFrom, '2026-10-30')
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
  assert.equal(bondi.dateFrom, '2026-10-30')
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
  assert.equal(nextWeekend.dateFrom, '2026-11-06')
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
  assert.equal(theatre.dateFrom, '2026-10-30')

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
  assert.equal(free.dateFrom, '2026-10-30')
  assert.deepEqual(free.keywords, [])
})

test('Gay 2027 is the whole year, with LGBTIQ+ inferred and the word kept', () => {
  const gay = interpretQuery('Gay 2027', '2026-11-03')
  assert.equal(gay.dateFrom, '2027-01-01')
  assert.equal(gay.dateTo, '2027-12-31')
  assert.equal(gay.lgbtiq, true)
  assert.equal(gay.categoryStrict, false)
  assert.deepEqual(gay.keywords, ['gay'])
  assert.equal(gay.city, '')

  for (const word of ['queer', 'lgbt', 'pride', 'lgbtiq', 'lesbian']) {
    const parsed = interpretQuery(`${word} 2027`, '2026-11-03')
    assert.equal(parsed.lgbtiq, true, word)
    assert.equal(parsed.dateFrom, '2027-01-01', word)
    assert.equal(parsed.dateTo, '2027-12-31', word)
    assert.ok(parsed.keywords.includes(word), word)
  }

  const gaylard = interpretQuery('Charlie Gaylard', '2026-11-03')
  assert.equal(gaylard.lgbtiq, false)
  assert.deepEqual(gaylard.keywords, ['charlie', 'gaylard'])
})

test('LGBTIQ+ this week is one week, and the identity word is not a second filter chip source', () => {
  const saturday = '2026-11-21'
  const parsed = interpretQuery('LGBTIQ+ this week', saturday)
  assert.equal(parsed.lgbtiq, true)
  assert.equal(parsed.dateFrom, saturday)
  assert.equal(parsed.dateTo, '2026-11-27')
  assert.equal(parsed.keywords.includes('week'), false)
  assert.equal(parsed.keywords.includes('this'), false)
})

test('ordinary plurals singularise so the search needle can hit a singular title', () => {
  const zoe = interpretQuery('nightclubs and DJ sets in Sydney this weekend', FRIDAY)
  assert.deepEqual(zoe.keywords, ['nightclub', 'set'])
  assert.equal(zoe.city, 'Sydney')
  assert.equal(zoe.dateFrom, '2026-10-30')
  assert.equal(zoe.dateTo, '2026-11-01')

  const tom = interpretQuery('classical concerts and theatre in Adelaide this weekend', FRIDAY)
  assert.deepEqual(tom.keywords, ['classical', 'concert', 'theatre'])
  assert.equal(tom.city, 'Adelaide')

  assert.deepEqual(interpretQuery('gigs in Sydney', FRIDAY).keywords, ['gig'])
  assert.deepEqual(interpretQuery('boat parties in Sydney', FRIDAY).keywords, ['boat', 'party'])
  assert.deepEqual(interpretQuery('dance classes in Sydney', FRIDAY).keywords, ['dance', 'class'])
  assert.deepEqual(interpretQuery('ladies night in Sydney', FRIDAY).keywords, ['lady'])
  assert.deepEqual(interpretQuery('workshops in Sydney', FRIDAY).keywords, ['workshop'])

  // Model-supplied keywords are stemmed too, not only the rule-based ones.
  const model = interpretQuery('in Sydney', FRIDAY, { keywords: ['Nightclubs'] })
  assert.deepEqual(model.keywords, ['nightclub'])
})

test('-ie plurals stem to the -ie singular, not a -y needle that matches nothing', () => {
  // foodies → foody would be a substring of neither "Foodie" nor "Foodies",
  // so this query — which matched titles before stemming existed — would
  // return a guaranteed zero. The -ie singular hits both forms.
  assert.deepEqual(interpretQuery('foodies in Sydney', FRIDAY).keywords, ['foodie'])
  assert.deepEqual(interpretQuery('indies in Sydney', FRIDAY).keywords, ['indie'])
  assert.deepEqual(interpretQuery('ties in Sydney', FRIDAY).keywords, ['tie'])

  // The -y family the ties/dies rule exists for still converts.
  assert.deepEqual(interpretQuery('boat parties in Sydney', FRIDAY).keywords, ['boat', 'party'])
  assert.deepEqual(interpretQuery('ladies night in Sydney', FRIDAY).keywords, ['lady'])

  // Regression shape: the needle produced for a "foodies" keyword must
  // substring-match titles carrying the word, singular or plural.
  const [needle] = interpretQuery('foodies in Sydney', FRIDAY).keywords
  assert.ok('Sydney Foodies Market'.toLowerCase().includes(needle))
  assert.ok('Foodie Walking Tour'.toLowerCase().includes(needle))
})

test('words that merely end in s are not mangled', () => {
  assert.deepEqual(interpretQuery('jazz in Sydney', FRIDAY).keywords, ['jazz'])
  assert.deepEqual(interpretQuery('glass in Sydney', FRIDAY).keywords, ['glass'])
  assert.deepEqual(interpretQuery('bass in Sydney', FRIDAY).keywords, ['bass'])
  assert.deepEqual(interpretQuery('chorus in Sydney', FRIDAY).keywords, ['chorus'])
  assert.deepEqual(interpretQuery('paris in Sydney', FRIDAY).keywords, ['paris'])
  assert.deepEqual(interpretQuery('canvas in Sydney', FRIDAY).keywords, ['canvas'])
  // A stem that is not a word (movies → movi) would match nothing at all,
  // so these keep the plural form a title can still carry.
  assert.deepEqual(interpretQuery('movies in Sydney', FRIDAY).keywords, ['movies'])
  assert.deepEqual(interpretQuery('galleries in Sydney', FRIDAY).keywords, ['galleries'])
})

test('folded-in places resolve to their board, and the place is not a keyword', () => {
  // Newcastle has no board of its own: the ask lands on the Sydney board with
  // Newcastle kept as the focus, and "newcastle" must not survive as a word
  // the listings are ANDed against — no listing's text has to say it.
  const liam = interpretQuery('indie gigs in Newcastle', FRIDAY)
  assert.equal(liam.city, 'Sydney')
  assert.equal(liam.suburb, 'Newcastle')
  assert.equal(liam.category, 'Music')
  assert.deepEqual(liam.keywords, ['indie', 'gig'])

  // Wollongong files to Sydney the same way.
  const gong = interpretQuery('markets in Wollongong', FRIDAY)
  assert.equal(gong.city, 'Sydney')
  assert.equal(gong.suburb, 'Wollongong')
  assert.deepEqual(gong.keywords, ['market'])

  // A suburb of a folded-in place names the place's board too.
  const hamilton = interpretQuery('gigs in Hamilton', FRIDAY)
  assert.equal(hamilton.city, 'Sydney')
  assert.equal(hamilton.suburb, 'Hamilton')
  assert.deepEqual(hamilton.keywords, ['gig'])

  // A catalogue city named outright still wins over a folded-in place.
  const perth = interpretQuery('gigs in Perth', FRIDAY)
  assert.equal(perth.city, 'Perth')
  assert.equal(perth.suburb, '')
})

test('a model-supplied place word never survives as a keyword when the fallback found none', () => {
  // "music in Newcastle": every content word is a stop word or the place
  // itself, so the fallback's keyword list is empty and the merge keeps the
  // model's keywords. The model cannot name Newcastle as a city (the prompt
  // offers catalogue cities only), so the place can only arrive as a
  // keyword — where the route would AND it as a text needle and zero the
  // ask. The place is the focus filter, never a keyword.
  const newcastle = interpretQuery('music in Newcastle', FRIDAY, { keywords: ['newcastle'] })
  assert.equal(newcastle.city, 'Sydney')
  assert.equal(newcastle.suburb, 'Newcastle')
  assert.deepEqual(newcastle.keywords, [])

  const gong = interpretQuery('music in Wollongong', FRIDAY, { keywords: ['wollongong'] })
  assert.equal(gong.city, 'Sydney')
  assert.equal(gong.suburb, 'Wollongong')
  assert.deepEqual(gong.keywords, [])

  // The catalogue-city twin: normalise filters model keywords against the
  // city only, so a suburb focus leaks the same way without the guard.
  const bondi = interpretQuery('music in Bondi', FRIDAY, { keywords: ['bondi'] })
  assert.equal(bondi.city, 'Sydney')
  assert.equal(bondi.suburb, 'Bondi')
  assert.deepEqual(bondi.keywords, [])

  // A real keyword riding alongside the place word survives; only the
  // place word is dropped.
  const mixed = interpretQuery('music in Newcastle', FRIDAY, { keywords: ['newcastle', 'jazz'] })
  assert.deepEqual(mixed.keywords, ['jazz'])
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
