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
