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

test('an uncovered place is named in the parse, never silently swapped for the board city', () => {
  const auckland = interpretQuery("what's on in Auckland", FRIDAY)
  assert.equal(auckland.uncoveredPlace, 'Auckland')
  assert.equal(auckland.city, '')
  // The place's own word is spent on the note, not left as a keyword the
  // board city's events would have to contain.
  assert.deepEqual(auckland.keywords, [])

  assert.equal(interpretQuery('gigs in Wellington', FRIDAY).uncoveredPlace, 'Wellington')
  assert.equal(interpretQuery('concerts in Byron Bay', FRIDAY).uncoveredPlace, 'Byron Bay')
  assert.equal(interpretQuery('things to do in Geelong', FRIDAY).uncoveredPlace, 'Geelong')
  assert.equal(interpretQuery('Auckland gigs', FRIDAY).uncoveredPlace, 'Auckland')
  assert.equal(interpretQuery('gigs near Queenstown', FRIDAY).uncoveredPlace, 'Queenstown')
})

test('covered places never read as uncovered', () => {
  // Catalogue cities.
  assert.equal(interpretQuery('gigs in Sydney', FRIDAY).uncoveredPlace, undefined)
  assert.equal(interpretQuery('gigs in Perth', FRIDAY).uncoveredPlace, undefined)
  // Folded places resolve onto the Sydney board.
  assert.equal(interpretQuery('gigs in Newcastle', FRIDAY).uncoveredPlace, undefined)
  assert.equal(interpretQuery('gigs in Wollongong', FRIDAY).uncoveredPlace, undefined)
  // Known suburbs and areas of covered cities.
  assert.equal(interpretQuery('markets in Bondi', FRIDAY).uncoveredPlace, undefined)
  assert.equal(interpretQuery('fremantle markets', FRIDAY).uncoveredPlace, undefined)
  // A bare mention mid-sentence is a name, not the place being asked about.
  assert.equal(interpretQuery('an Auckland band plays the hits', FRIDAY).uncoveredPlace, undefined)
  // No place at all.
  assert.equal(interpretQuery('jazz gigs', FRIDAY).uncoveredPlace, undefined)
})

test('every uncovered place named is stripped from the keywords, not just the one in the note', () => {
  // The note names one place (the longest match, as before), but the
  // other place's word must not survive as an ANDed keyword either way
  // round — it would filter the board city's events by a word they
  // cannot contain.
  const both = interpretQuery('gigs in Auckland or Wellington', FRIDAY)
  assert.equal(both.uncoveredPlace, 'Wellington')
  assert.deepEqual(both.keywords, ['gig'])

  const reversed = interpretQuery('gigs in Wellington or Auckland', FRIDAY)
  assert.equal(reversed.uncoveredPlace, 'Wellington')
  assert.deepEqual(reversed.keywords, ['gig'])
})

test('a compound landmark name is not the uncovered place it ends with', () => {
  // "Mount Wellington" is a Hobart landmark, not an ask about Wellington.
  assert.equal(interpretQuery('walks on Mount Wellington', FRIDAY).uncoveredPlace, undefined)
  // …while the place itself, asked about plainly, still flags — by
  // preposition and by closing position alike.
  assert.equal(interpretQuery('things to do in Wellington', FRIDAY).uncoveredPlace, 'Wellington')
  assert.equal(interpretQuery('best markets Wellington', FRIDAY).uncoveredPlace, 'Wellington')
})

test('past asks are flagged and answered with the coming weekend instead of a silent remap', () => {
  const last = interpretQuery('gigs last weekend', FRIDAY)
  assert.equal(last.pastIntent, true)
  assert.equal(last.dateFrom, '2026-10-30')
  assert.equal(last.dateTo, '2026-11-01')
  // The word "last" is spent on the date, not left as a keyword an event
  // title would have to contain.
  assert.deepEqual(last.keywords, ['gig'])

  const named = interpretQuery('concerts in December 2024', FRIDAY)
  assert.equal(named.pastIntent, true)
  assert.equal(named.dateFrom, '2026-10-30')
  assert.equal(named.dateTo, '2026-11-01')

  // A model-supplied range that has already ended is a past ask too.
  const model = interpretQuery('jazz gigs', FRIDAY, { dateFrom: '2026-10-23', dateTo: '2026-10-25', keywords: ['jazz'] })
  assert.equal(model.pastIntent, true)
  assert.equal(model.dateFrom, '2026-10-30')
  assert.equal(model.dateTo, '2026-11-01')
})

test('title-shaped phrases are not past asks', () => {
  // "Yesterday" and "Last <Weekday> Night" are event titles as often as
  // they are dates. They keep their words as keywords and search over
  // the normal window — firing the past branch on them would also stop
  // the title words out of the keywords and gut the search.
  const yesterday = interpretQuery('Yesterday Once More', FRIDAY)
  assert.equal(yesterday.pastIntent, undefined)
  assert.ok(yesterday.keywords.includes('yesterday'))
  assert.equal(yesterday.dateFrom, FRIDAY)
  assert.equal(yesterday.dateTo, '2026-11-12')

  // The deliberate trade-off: a bare "yesterday" ask reads as a title too.
  const gigsYesterday = interpretQuery('gigs yesterday', FRIDAY)
  assert.equal(gigsYesterday.pastIntent, undefined)
  assert.ok(gigsYesterday.keywords.includes('yesterday'))

  assert.equal(interpretQuery('Last Night of the Proms', FRIDAY).pastIntent, undefined)
  assert.equal(interpretQuery('last friday night party', FRIDAY).pastIntent, undefined)

  // …while the unambiguous past shapes still fire: "last <weekday>"
  // bare is a date, not a title.
  const tuesday = interpretQuery('shows last tuesday', FRIDAY)
  assert.equal(tuesday.pastIntent, true)
  assert.equal(tuesday.dateFrom, '2026-10-30')
  assert.equal(tuesday.dateTo, '2026-11-01')
})

test('periods still in progress or still to come are not past asks', () => {
  const month = interpretQuery('events in October', FRIDAY)
  assert.equal(month.pastIntent, undefined)
  assert.equal(month.dateFrom, '2026-10-30')
  assert.equal(month.dateTo, '2026-10-31')

  const weekend = interpretQuery('gigs this weekend', FRIDAY)
  assert.equal(weekend.pastIntent, undefined)
  assert.equal(weekend.dateFrom, '2026-10-30')
  assert.equal(weekend.dateTo, '2026-11-01')
})

test('an ask with no parseable signal parses to no signal at all', () => {
  // The route's no-signal guard reads exactly these fields: an emoji-only
  // ask must arrive with none of them set and the default window in place.
  const emoji = interpretQuery('🎉🎉', FRIDAY)
  assert.deepEqual(emoji.keywords, [])
  assert.equal(emoji.category, '')
  assert.equal(emoji.suburb, '')
  assert.equal(emoji.city, '')
  assert.equal(emoji.isFree, false)
  assert.equal(emoji.paidOnly, false)
  assert.equal(emoji.maxPrice, null)
  assert.equal(emoji.lgbtiq, false)
  assert.equal(emoji.timeOfDay, 'any')
  assert.equal(emoji.dateFrom, FRIDAY)
  assert.equal(emoji.dateTo, '2026-11-12')
  assert.equal(emoji.uncoveredPlace, undefined)
  assert.equal(emoji.pastIntent, undefined)

  // Keyword-shaped gibberish is a different thing: the word is the signal,
  // so it runs as a real (empty) search rather than the no-signal path.
  assert.deepEqual(interpretQuery('asdfgh', FRIDAY).keywords, ['asdfgh'])
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
