import assert from 'node:assert/strict'
import { test } from 'node:test'
import { interpretQuery } from './ai-search-parse'
import { addDaysStr } from './local-shared'
import { filterLocalSearch, localDateBounds, localOccurrenceWindow, LOCAL_SEARCH_CAP_DAYS, type LocalSearchItem } from './local-search'

const TODAY = '2026-11-19'

function item(extra: Partial<LocalSearchItem> & { id: string }): LocalSearchItem & { id: string } {
  return {
    title: 'Neighbourhood gathering',
    section: 'community-events',
    suburb: 'Glebe',
    city: 'Sydney',
    date: TODAY,
    isFree: true,
    price: 'Free',
    ...extra,
  }
}

test('a suburb query keeps that suburb', () => {
  const query = 'Newtown'
  const parsed = interpretQuery(query, TODAY)
  assert.equal(parsed.suburb, 'Newtown')
  const rows = [
    item({ id: 'newtown', suburb: 'Newtown', title: 'School fete' }),
    item({ id: 'bondi', suburb: 'Bondi', title: 'School fete' }),
  ]
  assert.deepEqual(filterLocalSearch(rows, parsed, query, TODAY).map((row) => row.id), ['newtown'])
})

test('a free filter drops paid listings', () => {
  const query = 'free'
  const parsed = interpretQuery(query, TODAY)
  assert.equal(parsed.isFree, true)
  const rows = [
    item({ id: 'free', title: 'Park picnic', isFree: true, price: 'Free' }),
    item({ id: 'paid', title: 'Ticketed gig', isFree: false, price: '$20' }),
  ]
  assert.deepEqual(filterLocalSearch(rows, parsed, query, TODAY).map((row) => row.id), ['free'])
})

test('paid keeps listings with a price', () => {
  const query = 'paid'
  const parsed = interpretQuery(query, TODAY)
  assert.equal(parsed.paidOnly, true)
  const rows = [
    item({ id: 'free', title: 'Park picnic', isFree: true, price: 'Free' }),
    item({ id: 'paid', title: 'Ticketed gig', isFree: false, price: '$20' }),
  ]
  assert.deepEqual(filterLocalSearch(rows, parsed, query, TODAY).map((row) => row.id), ['paid'])
})

test('tonight keeps events on that day', () => {
  const query = 'jazz tonight'
  const parsed = interpretQuery(query, TODAY)
  assert.equal(parsed.dateFrom, TODAY)
  assert.equal(parsed.dateTo, TODAY)
  const rows = [
    item({ id: 'tonight', title: 'Jazz at the hall', date: TODAY }),
    item({ id: 'later', title: 'Jazz brunch', date: '2026-11-21' }),
    item({ id: 'other', title: 'Garage sale', date: TODAY, section: 'garage-sales' }),
  ]
  assert.deepEqual(filterLocalSearch(rows, parsed, query, TODAY).map((row) => row.id), ['tonight'])
})

test('a keyword matches the title', () => {
  const query = 'pottery'
  const parsed = interpretQuery(query, TODAY)
  const rows = [
    item({ id: 'pot', title: 'Pottery studio open day' }),
    item({ id: 'sale', title: 'Garage sale', section: 'garage-sales' }),
  ]
  assert.deepEqual(filterLocalSearch(rows, parsed, query, TODAY).map((row) => row.id), ['pot'])
})

test('keywords also match a blurb, a section and a venue', () => {
  const pottery = interpretQuery('pottery', TODAY)
  const textRows = [
    item({ id: 'blurb', title: 'Open studio', blurb: 'A pottery wheel you can try.' }),
    item({ id: 'venue', title: 'Open studio', venueName: 'The Pottery Shed' }),
    item({ id: 'nope', title: 'Open studio', blurb: 'Watercolour only.', venueName: 'School hall' }),
  ]
  assert.deepEqual(filterLocalSearch(textRows, pottery, 'pottery', TODAY).map((row) => row.id), ['blurb', 'venue'])

  const markets = interpretQuery('markets this weekend', TODAY)
  const marketRows = [
    item({ id: 'market', title: 'Stall holders', section: 'farmers-markets', date: '2026-11-21' }),
    item({ id: 'early', title: 'Stall holders', section: 'farmers-markets', date: TODAY }),
    item({ id: 'garage', title: 'Garage sale', section: 'garage-sales', date: '2026-11-21' }),
  ]
  assert.deepEqual(filterLocalSearch(marketRows, markets, 'markets this weekend', TODAY).map((row) => row.id), ['market'])
})

test('a postcode matches suburb or address text', () => {
  const query = '2042'
  const parsed = interpretQuery(query, TODAY)
  assert.equal(localDateBounds(query, parsed, TODAY), null)
  const rows = [
    item({ id: 'address', title: 'Street stall', address: '12 King St, Newtown NSW 2042' }),
    item({ id: 'field', title: 'Hall hire', suburb: 'Enmore', postcode: '2042', address: 'Community hall' }),
    item({ id: 'bondi', title: 'Beach stall', suburb: 'Bondi', address: '1 Beach Rd, Bondi NSW 2026', postcode: '2026' }),
  ]
  assert.deepEqual(filterLocalSearch(rows, parsed, query, TODAY).map((row) => row.id), ['address', 'field'])
})

test('a query naming another city does not invent rows', () => {
  const query = 'jazz in Melbourne'
  const parsed = interpretQuery(query, TODAY)
  assert.equal(parsed.city, 'Melbourne')
  const rows = [
    item({ id: 'jazz', title: 'Jazz at the hall', city: 'Sydney' }),
    item({ id: 'market', title: 'Saturday market', city: 'Sydney', section: 'farmers-markets' }),
  ]
  const found = filterLocalSearch(rows, parsed, query, TODAY)
  assert.deepEqual(found.map((row) => row.id), ['jazz'])
  assert.ok(found.every((row) => rows.includes(row)))
  assert.equal(found.some((row) => row.city === 'Melbourne'), false)
})

test('an empty query does not filter', () => {
  const rows = [
    item({ id: 'later', date: '2026-12-20', title: 'Summer stall' }),
    item({ id: 'paid', isFree: false, price: '$10', title: 'Ticketed gig' }),
  ]
  const parsed = interpretQuery('', TODAY)
  assert.deepEqual(filterLocalSearch(rows, parsed, '', TODAY), rows)
  assert.deepEqual(filterLocalSearch(rows, parsed, '   ', TODAY), rows)
})

test('a named month stays a date and does not demand that year as a postcode', () => {
  const query = 'in January 2027'
  const parsed = interpretQuery(query, TODAY)
  const rows = [
    item({ id: 'january', title: 'New year stall', date: '2027-01-10', address: 'Hall, Sydney' }),
    item({ id: 'now', title: 'New year stall', date: TODAY, postcode: '2027' }),
  ]
  assert.deepEqual(filterLocalSearch(rows, parsed, query, TODAY).map((row) => row.id), ['january'])
})

test('live music matches the category, not only a suburb', () => {
  const query = 'live music'
  const parsed = interpretQuery(query, TODAY)
  assert.equal(parsed.category, 'Music')
  const rows = [
    item({ id: 'gig', title: 'Late set', category: 'Music', time: '20:00' }),
    item({ id: 'sale', title: 'Garage sale', section: 'garage-sales', category: 'Community', suburb: 'Newtown' }),
  ]
  assert.deepEqual(filterLocalSearch(rows, parsed, query, TODAY).map((row) => row.id), ['gig'])
})

test('a tag, a venue and a price cap stay inside the rows already loaded', () => {
  const query = 'comedy under $30'
  const parsed = interpretQuery(query, TODAY)
  assert.equal(parsed.maxPrice, 30)
  const rows = [
    item({ id: 'cheap', title: 'Open mic', subTags: ['Comedy'], venueName: 'The Town Hall', price: '$20', priceMin: 20, isFree: false }),
    item({ id: 'dear', title: 'Comedy gala', subTags: ['Comedy'], price: '$80', priceMin: 80, isFree: false }),
    item({ id: 'other', title: 'Garage sale', section: 'garage-sales' }),
  ]
  assert.deepEqual(filterLocalSearch(rows, parsed, query, TODAY).map((row) => row.id), ['cheap'])
})

test('tonight keeps the evening and leaves the morning', () => {
  const query = 'tonight'
  const parsed = interpretQuery(query, TODAY)
  assert.equal(parsed.timeOfDay, 'evening')
  const rows = [
    item({ id: 'night', title: 'Night market', time: '19:00', section: 'farmers-markets' }),
    item({ id: 'morning', title: 'Morning market', time: '09:00', section: 'farmers-markets' }),
    item({ id: 'untimed', title: 'Stall', section: 'farmers-markets' }),
  ]
  const ids = filterLocalSearch(rows, parsed, query, TODAY).map((row) => row.id)
  assert.deepEqual(ids.sort(), ['night', 'untimed'])
})

test('a named date widens the occurrence window and a far date stops near 60 days', () => {
  const weekend = { from: '2026-11-20', to: '2026-11-22' }
  const tonight = localDateBounds('jazz tonight', interpretQuery('jazz tonight', TODAY), TODAY)
  assert.deepEqual(localOccurrenceWindow(weekend, tonight, TODAY), { from: TODAY, to: '2026-11-22' })

  const january = localDateBounds('in January 2027', interpretQuery('in January 2027', TODAY), TODAY)
  assert.ok(january)
  const widened = localOccurrenceWindow({ from: TODAY, to: TODAY }, january, TODAY)
  assert.equal(widened.from, TODAY)
  assert.equal(widened.to, addDaysStr(TODAY, LOCAL_SEARCH_CAP_DAYS))

  assert.equal(localDateBounds('pottery', interpretQuery('pottery', TODAY), TODAY), null)
  assert.deepEqual(localOccurrenceWindow(weekend, null, TODAY), weekend)
})
