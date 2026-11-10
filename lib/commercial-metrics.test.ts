import assert from 'node:assert/strict'
import test from 'node:test'
import { monthlyRecurringRevenue } from './sponsorship'
import {
  accuracyPct,
  acquisitionCostCents,
  addMonths,
  cumulativeByMonth,
  discoveryPct,
  emailRates,
  monthEndsAt,
  mrrSeries,
  parseSpend,
  payerMonths,
  planAt,
  recentWeekStarts,
  revenuePerBusinessCents,
  searchKey,
  sharePct,
  sydneyMonth,
  trackingLabel,
  trendDelta,
  weekStartMonday,
  weeklyReturning,
} from './commercial-metrics'

test('Sydney month boundaries follow daylight saving', () => {
  assert.equal(sydneyMonth(new Date('2026-11-10T02:00:00.000Z')), '2026-11')
  assert.equal(monthEndsAt('2026-09').toISOString(), '2026-09-30T14:00:00.000Z')
  assert.equal(monthEndsAt('2026-10').toISOString(), '2026-10-31T13:00:00.000Z')
  assert.equal(addMonths('2026-11', -1), '2026-10')
  assert.equal(addMonths('2026-12', 1), '2027-01')
})

test('weeks start on Monday and a return is someone from the week before', () => {
  assert.equal(weekStartMonday('2026-11-10'), '2026-11-09')
  assert.equal(weekStartMonday('2026-11-15'), '2026-11-09')
  const weeks = recentWeekStarts('2026-11-10', 3)
  assert.deepEqual(weeks, ['2026-10-26', '2026-11-02', '2026-11-09'])
  const series = weeklyReturning([
    { visitorId: 'a', week: '2026-11-02' },
    { visitorId: 'a', week: '2026-11-09' },
    { visitorId: 'b', week: '2026-11-09' },
    { visitorId: 'a', week: '2026-11-09' },
  ], weeks)
  assert.equal(series[2].active, 2)
  assert.equal(series[2].returning, 1)
  assert.equal(series[2].rate, 1)
  assert.equal(series[0].rate, null)
})

test('catalogue growth keeps everything indexed before the window', () => {
  const rows = cumulativeByMonth([
    { month: '2026-01', n: 10 },
    { month: '2026-10', n: 4 },
    { month: '2026-11', n: 1 },
  ], ['2026-10', '2026-11'])
  assert.deepEqual(rows, [
    { month: '2026-10', total: 14, added: 4 },
    { month: '2026-11', total: 15, added: 1 },
  ])
})

test('accuracy, discovery, email and unit economics stay null until there is a denominator', () => {
  assert.equal(accuracyPct(2, 10), 80)
  assert.equal(accuracyPct(20, 10), 0)
  assert.equal(accuracyPct(0, 0), null)
  assert.equal(sharePct(1, 8), 12.5)
  assert.equal(discoveryPct(4, 1), 25)
  assert.equal(discoveryPct(4, 9), 100)
  assert.equal(discoveryPct(0, 1), null)
  assert.deepEqual(emailRates(10, 4, 1), { open: 40, click: 10 })
  assert.deepEqual(emailRates(0, 0, 0), { open: null, click: null })
  assert.equal(acquisitionCostCents(5000, 2), 2500)
  assert.equal(acquisitionCostCents(null, 2), null)
  assert.equal(acquisitionCostCents(5000, 0), null)
  assert.equal(revenuePerBusinessCents(9000, 3), 3000)
  assert.equal(revenuePerBusinessCents(9000, 0), null)
})

test('a business is new only in the month of its first paid amount', () => {
  const months = payerMonths([
    { payer: 'a', month: '2026-09', cents: 1900 },
    { payer: 'a', month: '2026-11', cents: 3900 },
    { payer: 'b', month: '2026-11', cents: 4900 },
    { payer: 'c', month: '2026-11', cents: 0 },
  ])
  assert.deepEqual(months.get('2026-11'), { revenue: 8800, payers: 2, fresh: 1 })
  assert.equal(months.get('2026-09')?.fresh, 1)
})

test('historical MRR uses the sponsorship rule and the current month matches it live', () => {
  const subs = [
    {
      status: 'ACTIVE', amountCents: 3900, cancelAtPeriodEnd: false,
      createdAt: new Date('2026-09-15T00:00:00.000Z'),
      updatedAt: new Date('2026-09-15T00:00:00.000Z'),
      currentPeriodStart: new Date('2026-09-15T00:00:00.000Z'),
    },
    {
      status: 'ACTIVE', amountCents: 9900, cancelAtPeriodEnd: true,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-11-02T00:00:00.000Z'),
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      status: 'CANCELLED', amountCents: 1900, cancelAtPeriodEnd: false,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-15T00:00:00.000Z'),
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    },
    {
      status: 'TRIALING', amountCents: 19900, cancelAtPeriodEnd: false,
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
      updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      currentPeriodStart: null,
    },
  ]
  const now = new Date('2026-11-10T02:00:00.000Z')
  const series = mrrSeries(subs, ['2026-09', '2026-10', '2026-11'], now)
  assert.equal(series[0].mrrCents, 3900 + 9900 + 1900)
  assert.equal(series[1].mrrCents, 3900 + 9900)
  assert.equal(series[2].mrrCents, monthlyRecurringRevenue(subs).mrrCents)
  assert.equal(series[2].mrrCents, 3900)
  assert.equal(series[2].subscribers, 1)
  const octoberEnd = monthEndsAt('2026-10')
  assert.equal(planAt(subs[1], octoberEnd)?.cancelAtPeriodEnd, false)
  assert.equal(planAt(subs[2], octoberEnd), null)
})

test('marketing spend is the one typed input and refuses a future month', () => {
  assert.deepEqual(parseSpend({ month: '2026-11', amount: '$1,200.50', note: '  posters  ' }, '2026-11'), {
    month: '2026-11', amountCents: 120050, note: 'posters',
  })
  assert.deepEqual(parseSpend({ month: '2026-11', amount: '0' }, '2026-11'), {
    month: '2026-11', amountCents: 0, note: null,
  })
  assert.equal('error' in parseSpend({ month: '2026-12', amount: '10' }, '2026-11'), true)
  assert.equal('error' in parseSpend({ month: '2026-11', amount: '' }, '2026-11'), true)
  assert.equal(searchKey('  Jazz   Night '), searchKey('jazz night'))
  assert.equal(searchKey('a'), null)
  assert.notEqual(searchKey('jazz'), searchKey('blues'))
})

test('tracking copy names the day it started and a delta needs two readings', () => {
  assert.equal(trackingLabel(new Date('2026-11-10T02:00:00.000Z')), 'Tracking started 10 Nov 2026')
  assert.equal(trackingLabel(null), null)
  assert.equal(trendDelta([10, 15]), '+50% on the reading before')
  assert.equal(trendDelta([99.2, 99.2]), 'Level with the reading before')
  assert.equal(trendDelta([null, 4]), null)
})
