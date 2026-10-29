import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildVisitor, buildWeekend, visitorCopy, weekendCopy } from './crowd-shape'
import { footfallMissingDetail, resolveMarket } from './markets'
import { composeInsights, type AreaSignals } from './reach'
import { parseDotsStateQuarters, parseNvsRegions, regionSlug } from './tra-parse'
import { latestPeriod } from './rows'
import { rowsFromSheetXml } from './xlsx-read'
import { parseDnswHeadline } from './util'
import { voiceFor } from './voice'

test('sensor coordinates do not become the latest period', () => {
  assert.equal(latestPeriod([
    { measure: 'LAT', geoType: 'SENSOR', geoCode: '1', period: 'site', value: 1 },
    { measure: 'AVG_HOURLY', geoType: 'CITY', geoCode: 'Melbourne', period: '2026-09', value: 1 },
    { measure: 'DOM_TRIPS', geoType: 'TOURISM', geoCode: 'sydney', period: 'YE-2026-06', value: 1 },
  ]), 'YE-2026-06')
})

test('a CBD where weekdays beat the weekend says so', () => {
  const row = (day: string, avg: number) => [
    { measure: 'AVG_HOURLY', period: '2025-06', category: day, value: avg },
    { measure: 'HOURS', period: '2025-06', category: day, value: 10 },
  ]
  const signal = buildWeekend([
    ...row('MON', 100), ...row('TUE', 110), ...row('WED', 110), ...row('THU', 120),
    ...row('FRI', 100), ...row('SAT', 80), ...row('SUN', 60),
  ], { seriesLabel: 'City of Sydney sensors', caveat: 'Trial ended June 2025.', url: 'https://example.com', licence: 'CC BY 4.0' })
  assert.ok(signal)
  assert.ok(signal.friIndex < 1 && signal.sunIndex < 1)
  const copy = weekendCopy(signal, 'Friday', 5, 'the venue')
  assert.match(copy.detail, /still busier on a weekday/)
  assert.match(copy.detail, /Trial ended June 2025/)
})

test('sheet xml keeps empty cells so quarters line up with values', () => {
  const xml = `<worksheet><sheetData>
    <row r="1"><c r="B1"><v>1</v></c><c r="C1"><v>2</v></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Sydney</t></is></c><c r="B2"><v>3</v></c></row>
  </sheetData></worksheet>`
  const rows = rowsFromSheetXml(xml, [])
  assert.equal(rows[0][1], '1')
  assert.equal(rows[1][0], 'Sydney')
  assert.equal(rows[1][1], '3')
})

test('NVS region rows keep Sydney trips and skip totals', () => {
  const header = ['Overnight trips (\'000)', 'Year ending December 2023', 'Year ending December 2024']
  const rows = parseNvsRegions([
    header,
    ['Sydney', '10', '11'],
    ['Total NSW', '40', '41'],
    ['Visitor nights (\'000)'],
    ['Sydney', '30', '31'],
  ], 2019)
  const trips = rows.filter((r) => r.measure === 'DOM_TRIPS')
  assert.equal(trips.length, 2)
  assert.equal(trips.find((r) => r.period === 'YE-2024-12')?.value, 11000)
  assert.equal(rows.find((r) => r.measure === 'DOM_NIGHTS' && r.period === 'YE-2024-12')?.value, 31000)
  assert.equal(regionSlug("Australia's South West"), 'australias-south-west')
})

test('DoTS quarters map states and pick a peak later', () => {
  const rows = parseDotsStateQuarters([
    ['', 'June quarter 2025', 'December quarter 2025'],
    ["Overnight trips('000)"],
    ['New South Wales', '1', '3'],
    ['Queensland', '2', '2.5'],
    ['Visitor nights(\'000)'],
    ['New South Wales', '4', '9'],
  ])
  assert.equal(rows.find((r) => r.geoCode === 'NSW' && r.period === '2025-Q4' && r.measure === 'DOM_TRIPS')?.value, 3000)
  assert.equal(rows.find((r) => r.geoCode === 'QLD' && r.measure === 'DOM_TRIPS' && r.period === '2025-Q2')?.value, 2000)
})

test('a Launceston address filed under Hobart stays in the north', () => {
  const market = resolveMarket({ city: 'Hobart', suburb: 'Launceston', address: '71 Civic Square, Launceston TAS 7250', lgaName: null })
  assert.equal(market.id, 'Launceston')
  assert.equal(market.domesticRegion, 'Launceston and the North')
  assert.equal(market.useStateTiming, false)
  const cairns = resolveMarket({ city: 'Brisbane', suburb: 'Cairns', address: null })
  assert.equal(cairns.domesticRegion, 'Tropical North Queensland')
  assert.equal(cairns.footfall, null)
  assert.equal(resolveMarket({ city: 'Sydney', suburb: 'Newtown', address: 'Enmore' }).footfall, 'sydney')
  assert.match(footfallMissingDetail('Cairns'), /not used as a stand-in/)
  assert.match(footfallMissingDetail('Sydney'), /not in the database yet/)
})

test('weekend index is Friday Saturday Sunday against Monday to Thursday', () => {
  const row = (day: string, avg: number) => [
    { measure: 'AVG_HOURLY', period: '2026-09', category: day, value: avg },
    { measure: 'HOURS', period: '2026-09', category: day, value: 100 },
  ]
  const signal = buildWeekend([
    ...row('MON', 100), ...row('TUE', 100), ...row('WED', 100), ...row('THU', 100),
    ...row('FRI', 150), ...row('SAT', 200), ...row('SUN', 80),
  ], { seriesLabel: 'Test sensors', caveat: 'A test caveat.', url: 'https://example.com', licence: 'CC BY 4.0' })
  assert.ok(signal)
  assert.equal(signal.busiest, 'Saturday')
  assert.equal(signal.quietest, 'Sunday')
  assert.equal(signal.satIndex, 2)
  assert.equal(signal.friIndex, 1.5)
  const copy = weekendCopy(signal, 'Sunday', 0, 'the venue')
  assert.match(copy.detail, /Sunday is the soft one/)
  assert.match(copy.detail, /A test caveat/)
  assert.doesNotMatch(copy.detail, /\byour venue\b/)
})

test('state timing is a promo clock only for capitals', () => {
  const domestic = [
    { measure: 'DOM_TRIPS', period: 'YE-2023-12', value: 10_000_000, category: 'Sydney' },
    { measure: 'DOM_TRIPS', period: 'YE-2024-12', value: 11_000_000, category: 'Sydney' },
    { measure: 'DOM_NIGHTS', period: 'YE-2024-12', value: 30_000_000, category: 'Sydney' },
  ]
  const quarters = [
    { measure: 'DOM_TRIPS', period: '2025-Q2', value: 9_000_000, category: 'New South Wales' },
    { measure: 'DOM_TRIPS', period: '2025-Q4', value: 11_000_000, category: 'New South Wales' },
  ]
  const sydney = resolveMarket({ city: 'Sydney', suburb: 'Newtown' })
  const signal = buildVisitor(sydney, 12, domestic, [], [], quarters)
  assert.ok(signal)
  assert.equal(signal.sameSeason, true)
  assert.equal(signal.domesticYoyPct, 10)
  const copy = visitorCopy(signal, 'Saturday', 'the venue')
  assert.match(copy.detail, /Get the listing findable before people arrive/)
  assert.match(copy.detail, /whole state/)
  const cairns = buildVisitor(resolveMarket({ city: 'Brisbane', suburb: 'Cairns' }), 7, [
    { measure: 'DOM_TRIPS', period: 'YE-2024-12', value: 2_000_000, category: 'Tropical North Queensland' },
  ], [], [], quarters.map((q) => ({ ...q, category: 'Queensland' })))
  assert.ok(cairns)
  assert.equal(cairns.useStateTiming, false)
  assert.match(visitorCopy(cairns, 'Sunday', 'the venue').detail, /not the clock/)
})

test('a loaded visitor series removes the tourism gap, and a loaded weekend removes the footfall gap', () => {
  const visitor = buildVisitor(resolveMarket({ city: 'Melbourne' }), 3, [
    { measure: 'DOM_TRIPS', period: 'YE-2024-12', value: 10_000_000, category: 'Melbourne' },
  ], [], [], [
    { measure: 'DOM_TRIPS', period: '2026-Q1', value: 8_000_000, category: 'Victoria' },
  ])
  const weekend = buildWeekend([
    { measure: 'AVG_HOURLY', period: '2026-09', category: 'MON', value: 10 },
    { measure: 'HOURS', period: '2026-09', category: 'MON', value: 10 },
    { measure: 'AVG_HOURLY', period: '2026-09', category: 'TUE', value: 10 },
    { measure: 'HOURS', period: '2026-09', category: 'TUE', value: 10 },
    { measure: 'AVG_HOURLY', period: '2026-09', category: 'WED', value: 10 },
    { measure: 'HOURS', period: '2026-09', category: 'WED', value: 10 },
    { measure: 'AVG_HOURLY', period: '2026-09', category: 'THU', value: 10 },
    { measure: 'HOURS', period: '2026-09', category: 'THU', value: 10 },
    { measure: 'AVG_HOURLY', period: '2026-09', category: 'FRI', value: 12 },
    { measure: 'HOURS', period: '2026-09', category: 'FRI', value: 10 },
    { measure: 'AVG_HOURLY', period: '2026-09', category: 'SAT', value: 20 },
    { measure: 'HOURS', period: '2026-09', category: 'SAT', value: 10 },
    { measure: 'AVG_HOURLY', period: '2026-09', category: 'SUN', value: 8 },
    { measure: 'HOURS', period: '2026-09', category: 'SUN', value: 10 },
  ], { seriesLabel: 'City of Melbourne pedestrian sensors', caveat: 'CBD sensors, not the door.', url: 'https://example.com', licence: 'other-open' })
  const area = {
    status: 'ok', areaName: 'Fitzroy', benchLabel: 'Greater Melbourne', stateName: 'Victoria', spendLabel: 'Victoria',
    transportCovered: false, ages: [], agePeriod: null, under15: null, bornOverseas: null, food: null,
    station: null, stationsWithoutTaps: false, recreationYoy: null, hospitalityYoy: null, alcoholYoy: null, spendMonth: null,
    tourism: null, visitor, weekend, marketId: 'Melbourne', seifa: null, areaLoaded: true,
  } as AreaSignals
  const { gaps, insights } = composeInsights(
    voiceFor(false, 'Forum'),
    { venueName: 'Forum', suburb: 'Fitzroy', city: 'Melbourne', category: 'Music', subTags: [], dateLabel: 'Saturday, 14 March 2026', dowName: 'Saturday', dow: 6, goal: 'tickets', queer: false, priceLabel: null, bandLabel: null, stateCode: '2', stateName: 'Victoria' },
    area,
    { sameNightTotal: 0, sameNightCategory: 0, sameNightSuburb: 0, sameVenueTitles: [], otherNightTitles: [], sameNightMore: 0, categoryTotal: 0, weekdayMedian: 0, otherDayMedian: 0, weekdayEnough: false, goingOutSuburb: 0, goingOutCity: 0, bandLabel: null, comps: null, compsMin: null, compsMax: null },
  )
  assert.equal(gaps.some((g) => /Tourism/.test(g.title)), false)
  assert.equal(gaps.some((g) => /footfall|Footfall/.test(g.title)), false)
  assert.ok(insights.some((i) => /Visitor season|Outside the|Visitors to/.test(i.title)))
  assert.match(insights.map((i) => i.detail).join('\n'), /Saturday is the busy one/)
})

test('Brisbane without a weekend series does not pretend Opal is a Friday count', () => {
  const { gaps } = composeInsights(
    voiceFor(false, 'The Tivoli'),
    { venueName: 'The Tivoli', suburb: 'Fortitude Valley', city: 'Brisbane', category: 'Music', subTags: [], dateLabel: 'Friday, 13 March 2026', dowName: 'Friday', dow: 5, goal: 'tickets', queer: false, priceLabel: null, bandLabel: null, stateCode: '3', stateName: 'Queensland' },
    { status: 'ok', areaName: 'Fortitude Valley', benchLabel: 'Greater Brisbane', stateName: 'Queensland', spendLabel: 'Queensland', transportCovered: false, ages: [], agePeriod: null, under15: null, bornOverseas: null, food: null, station: null, stationsWithoutTaps: false, recreationYoy: null, hospitalityYoy: null, alcoholYoy: null, spendMonth: null, tourism: null, visitor: null, weekend: null, marketId: 'Brisbane', seifa: null, areaLoaded: true },
    { sameNightTotal: 0, sameNightCategory: 0, sameNightSuburb: 0, sameVenueTitles: [], otherNightTitles: [], sameNightMore: 0, categoryTotal: 0, weekdayMedian: 0, otherDayMedian: 0, weekdayEnough: false, goingOutSuburb: 0, goingOutCity: 0, bandLabel: null, comps: null, compsMin: null, compsMax: null },
  )
  const gap = gaps.find((g) => g.title === 'Weekend footfall needs an import')
  assert.ok(gap)
  assert.match(gap.detail, /Queen Street Mall/)
  assert.doesNotMatch(gap.detail, /Opal/)
})

test('Destination NSW headlines still parse after the year-on-year label was inserted', () => {
  const sydney = parseDnswHeadline('YEAR ENDING JUNE 2026 VISITORS 68.4 million NIGHTS 122.8 million EXPENDITURE $35.1 billion In the year ended June 2026 , Sydney welcomed 64.6 million domestic visitors, who spent $21.4 billion in the state. Domestic overnight visitors stayed a total of 33.8 million nights. Sydney also welcomed 3.8 million international visitors. They stayed 89.0 million nights and spent $13.7 billion in the city.')
  assert.equal(sydney?.period, 'YE-2026-06')
  assert.equal(sydney?.visitors, 68_400_000)
  assert.equal(sydney?.intlVisitors, 3_800_000)
  const nsw = parseDnswHeadline('YEAR ENDING JUNE 2026 YOY % CHANGE VISITORS 130.6 million 5.1% NIGHTS 225.7 million 3% EXPENDITURE $62.9 billion 12.8% In the year ending June 2026, NSW welcomed 126.4 million domestic visitors, who spent $47.8 billion in the state. The 39.2 million domestic overnight visitors to NSW stayed 119.2 million nights. NSW also welcomed 4.1 million international visitors. They stayed 106.6 million nights and spent $15.1 billion in the state.')
  assert.equal(nsw?.visitors, 130_600_000)
  assert.equal(nsw?.domVisitors, 126_400_000)
  assert.equal(nsw?.intlSpend, 15_100_000_000)
})
