import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkLGBTI } from '../categories'
import {
  buildCatalogueSnapshot, composeInsights, insightText, listedPrice, priceBand, queerPromoLinks, reachGoal, shareSum, weekdayMedians,
  type AreaSignals, type CatalogueSnapshot, type EventFacts,
} from './reach'
import { intelOwnerVoice, voiceFor } from './voice'

const BANNED = /\byour (venue|listing|audience|event|ad|ticket)\b/i

function facts(over: Partial<EventFacts> = {}): EventFacts {
  return {
    venueName: 'Enmore Theatre', suburb: 'Newtown', city: 'Sydney', category: 'Music', subTags: [],
    dateLabel: 'Saturday, 14 March 2026', dowName: 'Saturday', dow: 6, goal: 'tickets', queer: false,
    priceLabel: '$45', bandLabel: '$30–$79', stateCode: '1', stateName: 'New South Wales', ...over,
  }
}

function area(over: Partial<AreaSignals> = {}): AreaSignals {
  return {
    status: 'ok', areaName: 'Newtown - Camperdown', benchLabel: 'Greater Sydney', stateName: 'New South Wales', spendLabel: 'New South Wales',
    transportCovered: true, ages: [], agePeriod: '2024', under15: null, bornOverseas: null, food: null,
    station: { name: 'Newtown Station', distanceKm: 0.4, entries: 12345, month: '2026-03', yoyPct: 2.5 },
    stationsWithoutTaps: false, recreationYoy: 3.2, hospitalityYoy: -1.1, alcoholYoy: 4, spendMonth: '2026-03',
    tourism: { title: 'Visitors to Sydney', period: 'YE-2026-06', intlVisitors: 4_200_000, yoyPct: 6.5 },
    seifa: { area: 'Newtown', decile: 8 }, areaLoaded: true, ...over,
  }
}

function catalogue(over: Partial<CatalogueSnapshot> = {}): CatalogueSnapshot {
  return {
    sameNightTotal: 2, sameNightCategory: 1, sameNightSuburb: 1, sameVenueTitles: [], otherNightTitles: ['Other Gig at Factory Theatre'],
    sameNightMore: 1, categoryTotal: 20, weekdayMedian: 4, otherDayMedian: 1, weekdayEnough: true,
    goingOutSuburb: 6, goingOutCity: 40, bandLabel: '$30–$79', comps: 4, compsMin: 40, compsMax: 70, ...over,
  }
}

test('only promoter-created and local organiser listings use owner voice', () => {
  assert.equal(intelOwnerVoice('promoter'), true)
  assert.equal(intelOwnerVoice('local'), true)
  for (const source of ['ticketmaster', 'moshtix', 'oztix', 'eventbrite', 'humanitix', 'frontier', 'cityofsydney', 'ticketek', 'curated']) {
    assert.equal(intelOwnerVoice(source), false)
  }
  assert.equal(voiceFor(false, 'Enmore Theatre').venue, 'the venue')
  assert.equal(voiceFor(false, 'Enmore Theatre').venueNamed, 'Enmore Theatre')
  assert.equal(voiceFor(false, '  ').venueNamed, 'the venue')
  assert.equal(voiceFor(true, 'Enmore Theatre').listing, 'your listing')
})

test('a missing age band is not treated as zero', () => {
  assert.equal(shareSum([10, null, 5]), null)
  assert.equal(shareSum([10, 5]), 15)
})

test('price bands come only from a published price', () => {
  assert.equal(priceBand(true, 80)?.id, 'free')
  assert.equal(priceBand(false, 0)?.id, 'free')
  assert.equal(priceBand(false, null), null)
  assert.equal(priceBand(false, 29.5)?.label, 'under $30')
  assert.equal(priceBand(false, 30)?.id, '30-79')
  assert.equal(priceBand(false, 80)?.id, '80-149')
  assert.equal(priceBand(false, 150)?.id, '150+')
  assert.equal(listedPrice(false, 30, 80, 'From $30'), '$30–$80')
  assert.equal(listedPrice(false, null, null, null), null)
})

test('reach goal splits tickets from people at the venue', () => {
  assert.equal(reachGoal('Music', true), 'tickets')
  assert.equal(reachGoal('Food & Drink', false), 'visits')
  assert.equal(reachGoal('Nightlife', true), 'both')
  assert.equal(reachGoal('Community', false), 'reach')
})

test('weekday medians count empty days, so a quiet night is not dropped', () => {
  const counts = []
  for (let day = 1; day <= 14; day++) {
    const key = `2026-03-${String(day).padStart(2, '0')}`
    const dow = new Date(`${key}T00:00:00Z`).getUTCDay()
    if (dow !== 3) counts.push({ day: key, n: 2 })
  }
  const wed = weekdayMedians('2026-03-04', '2026-03-01', '2026-03-14', counts)
  assert.equal(wed.enough, true)
  assert.equal(wed.sameMedian, 0)
  assert.ok(wed.otherMedian >= 2)
})

test('ingested listings never say your venue, and they name the real one', () => {
  const { insights, gaps } = composeInsights(voiceFor(false, 'Enmore Theatre'), facts(), area(), catalogue())
  const text = insightText(insights, gaps)
  assert.doesNotMatch(text, BANNED)
  assert.match(text, /Enmore Theatre/)
  assert.match(text, /the venue/)
  assert.match(text, /the listing/)
  assert.match(text, /Other Gig at Factory Theatre/)
  assert.match(text, /\$40/)
  assert.match(text, /\$70/)
  assert.match(text, /Newtown Station/)
  assert.match(text, /12,345/)
  assert.match(text, /ticket sales/)
  assert.equal(insights.some((i) => i.highlight), false)
  assert.equal(gaps.some((g) => g.title === 'Weekend footfall needs an import'), true)
  assert.equal(gaps.some((g) => /Weather/.test(g.title)), false)
  assert.equal(gaps.some((g) => /Tourism figures need an import/.test(g.title)), false)
})

test('a promoter-created listing can say your venue', () => {
  const { insights } = composeInsights(voiceFor(true, 'Enmore Theatre'), facts(), area(), catalogue())
  const text = insightText(insights, [])
  assert.match(text, /your venue \(Enmore Theatre\)/)
  assert.match(text, /your listing/)
})

test('food and nightlife listings chase people at the venue, not a ticket chart', () => {
  const { insights } = composeInsights(
    voiceFor(false, 'The Bearded Tit'),
    facts({ category: 'Food & Drink', goal: 'visits', venueName: 'The Bearded Tit', priceLabel: null, bandLabel: null }),
    area({ tourism: null, station: null, stationsWithoutTaps: false, recreationYoy: null, hospitalityYoy: 5, alcoholYoy: 2, seifa: null }),
    catalogue({ bandLabel: null, comps: null, compsMin: null, compsMax: null, goingOutSuburb: 3 }),
  )
  const text = insightText(insights, [])
  assert.doesNotMatch(text, BANNED)
  assert.match(text, /people at the venue/)
  assert.match(text, /full room/)
  assert.match(text, /alcoholic beverages and tobacco/)
  assert.match(text, /hotels, cafes and restaurants/)
  assert.match(text, /No price is published/)
  assert.match(text, /Nothing here is guessed/)
})

test('too few catalogue rows do not get called a hot night', () => {
  const { insights } = composeInsights(
    voiceFor(false, 'Town Hall'),
    facts({ dow: 3, dowName: 'Wednesday', dateLabel: 'Wednesday, 4 March 2026' }),
    area({ tourism: null }),
    catalogue({ categoryTotal: 2, weekdayEnough: false, weekdayMedian: 2, otherDayMedian: 0, sameNightTotal: 0, otherNightTitles: [], sameNightMore: 0, sameNightCategory: 0, sameNightSuburb: 0 }),
  )
  const card = insights.find((i) => i.title.startsWith('Music on Wednesday'))
  assert.ok(card)
  assert.match(card.detail, /Too few/)
  assert.doesNotMatch(card.detail, /bunch up/)
  assert.equal(card.confidence, 'insufficient')
  const text = insightText(insights, [])
  assert.equal(text.includes('Weekend footfall'), false)
})

test('a crowded weekday uses the medians it was given', () => {
  const { insights } = composeInsights(voiceFor(false, 'Enmore Theatre'), facts(), area({ tourism: null }), catalogue({ weekdayMedian: 4, otherDayMedian: 1 }))
  const card = insights.find((i) => i.title.startsWith('Music on Saturday'))
  assert.ok(card)
  assert.match(card.detail, /bunch up on Saturdays/)
  assert.match(card.detail, /has 4, versus 1/)
})

test('outdoor events say weather needs an import instead of inventing a temperature', () => {
  const { gaps } = composeInsights(voiceFor(false, 'Park'), facts({ category: 'Sports', subTags: [] }), area({ tourism: null }), catalogue())
  const gap = gaps.find((g) => g.title === 'Weather seasonality needs an import')
  assert.ok(gap)
  assert.doesNotMatch(gap.detail, /\d+\s*°|degrees|mm of rain/)
  assert.match(gap.detail, /not imported/)
})

test('states outside NSW do not borrow Destination NSW as a local tourism peak', () => {
  const { insights, gaps } = composeInsights(
    voiceFor(false, 'Forum'),
    facts({ city: 'Melbourne', stateCode: '2', stateName: 'Victoria', suburb: 'Fitzroy' }),
    area({ stateName: 'Victoria', spendLabel: 'Victoria', tourism: null, transportCovered: false, station: null }),
    catalogue(),
  )
  assert.equal(insights.some((i) => /International visitors/.test(i.title)), false)
  const gap = gaps.find((g) => g.title === 'Tourism peaks for this state need an import')
  assert.ok(gap)
  assert.match(gap.detail, /Victoria/)
  assert.match(gap.detail, /Tourism Research Australia/)
})

test('a pinned venue with no ABS rows says the profile needs an import', () => {
  const { gaps } = composeInsights(voiceFor(false, 'Hall'), facts(), area({ areaLoaded: false, ages: [], tourism: { title: 'Visitors to Sydney', period: 'YE-2026-06', intlVisitors: 1, yoyPct: 1 } }), catalogue())
  assert.ok(gaps.some((g) => g.title === 'Resident profile needs an import'))
})

test('queer listings get an VibePeep line plus real channels, and no made-up audience size', () => {
  const cities = ['Sydney', 'Melbourne', 'Brisbane', 'Gold Coast', 'Perth', 'Adelaide', 'Canberra', 'Hobart', 'Darwin', 'Newcastle'] as const
  const must: Record<string, string[]> = {
    Sydney: ['starobserver.com.au', 'mardigras.org.au', 'stonewallhotel.com', '/sydney/lgbtiq'],
    Melbourne: ['joy.org.au', 'midsumma.org.au', '/melbourne/lgbtiq'],
    Brisbane: ['qnews.com.au', 'brisbanepride.org.au', '/brisbane/lgbtiq'],
    'Gold Coast': ['qnews.com.au', '/gold-coast/lgbtiq'],
    Perth: ['outinperth.com', 'pridewa.com.au', '/perth/lgbtiq'],
    Adelaide: ['feast.org.au', 'dnamagazine.com.au', '/adelaide/lgbtiq'],
    Canberra: ['fusemagazine.com.au', 'springout.com.au', '/canberra/lgbtiq'],
    Hobart: ['taspride.com', '/hobart/lgbtiq'],
    Darwin: ['topendpride.com.au', '/darwin/lgbtiq'],
    Newcastle: ['starobserver.com.au', 'mardigras.org.au', '/newcastle/lgbtiq'],
  }
  for (const city of cities) {
    const links = queerPromoLinks(city, 'Music')
    const urls = links.map((l) => l.url).join(' ')
    for (const needle of must[city]) assert.ok(urls.includes(needle), `${city} missing ${needle}`)
    assert.ok(links.length <= 5)
    const notes = links.map((l) => l.note).join('\n')
    assert.doesNotMatch(notes, /\d+(\.\d+)?%|million|listeners|readers|followers/)
  }
  assert.equal(queerPromoLinks('Newcastle', 'Music').some((l) => l.url.includes('stonewall')), false)
  assert.equal(queerPromoLinks('Sydney', 'Business').some((l) => l.url.includes('frooty')), false)
  assert.equal(queerPromoLinks('Sydney', 'Music').some((l) => l.url.includes('frooty')), true)

  const { insights } = composeInsights(voiceFor(false, 'Enmore Theatre'), facts({ queer: true }), area(), catalogue())
  const card = insights.find((i) => i.highlight)
  assert.ok(card)
  assert.match(card.detail, /LGBTIQ\+ filter/)
  assert.match(card.detail, /best place to advertise/)
  assert.match(card.detail, /have not measured one/)
  assert.doesNotMatch(card.detail, BANNED)
  assert.doesNotMatch(insightText([card], []), /\d+(\.\d+)?%/)
})

test('pride in the title is a queer listing even before the flag is stored', () => {
  assert.equal(checkLGBTI('Rainbow pride party', ''), true)
  assert.equal(checkLGBTI('Jazz at the basin', 'a normal gig'), false)
})

test('catalogue snapshot keeps same-venue titles apart and does not invent the rest of the night', () => {
  const snap = buildCatalogueSnapshot({
    eventDate: '2026-03-14', windowStart: '2026-03-01', windowEnd: '2026-03-28',
    category: 'Music', suburb: 'Newtown', venueName: 'Enmore Theatre', bandLabel: '$30–$79',
    countsByDay: [{ day: '2026-03-14', n: 4 }, { day: '2026-03-07', n: 4 }],
    nightTitles: [
      { title: 'Late Show', venueName: 'The Enmore Theatre', category: 'Music' },
      { title: 'Other Gig', venueName: 'Factory Theatre', category: 'Music' },
    ],
    sameNightTotal: 5, sameNightCategory: 3, sameNightSuburb: 2, goingOutSuburb: 1, goingOutCity: 9,
    comps: 2, compsMin: 40, compsMax: 40,
  })
  assert.deepEqual(snap.sameVenueTitles, ['Late Show'])
  assert.deepEqual(snap.otherNightTitles, ['Other Gig at Factory Theatre'])
  assert.equal(snap.sameNightMore, 3)
  const { insights } = composeInsights(voiceFor(false, 'Enmore Theatre'), facts(), area({ tourism: null }), snap)
  const night = insights.find((i) => i.title.startsWith('What else is listed'))
  assert.ok(night)
  assert.match(night.detail, /Also at the venue that day: Late Show/)
  assert.match(night.detail, /And 3 more/)
  const priced = insights.find((i) => i.title.startsWith('Similar'))
  assert.ok(priced)
  assert.match(priced.detail, /Listed at \$40/)
  assert.doesNotMatch(insightText(insights, []), BANNED)
})
