import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clickThrough, engagementRate, performanceView, trendLabel } from './organiser-analytics'

test('engagement rate is null until views exist and never invents a benchmark', () => {
  assert.equal(engagementRate({ views: 0, saves: 4, going: 1, reactions: 2, ticketClicks: 1 }), null)
  assert.equal(engagementRate({ views: 40, saves: 4, going: 0, reactions: 0, ticketClicks: 0 }), 10)
  const locked = performanceView({
    views: 40, uniqueViews: 12, ticketClicks: 3, saves: 4, going: 1, reactions: 2,
    recentActions: 8, previousActions: 2, campaigns: null, unlocked: false,
  })
  assert.equal(locked.views, null)
  assert.equal(locked.ticketClicks, null)
  assert.equal(locked.engagementRate, null)
  assert.equal(locked.trend, null)
  assert.equal(locked.benchmark, null)
  assert.match(locked.benchmarkNote, /does not invent/)
  assert.match(locked.campaignNote, /stay with the organiser/)
  const open = performanceView({
    views: 40, uniqueViews: 12, ticketClicks: 4, saves: 4, going: 0, reactions: 0,
    recentActions: 3, previousActions: 3, campaigns: [{ status: 'ACTIVE', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-03T00:00:00.000Z', impressions: 100, clicks: 10 }],
    unlocked: true,
  })
  assert.equal(open.views, 40)
  assert.equal(open.campaigns?.[0]?.impressions, 100)
  assert.equal(clickThrough(100, 10), 10)
  assert.equal(clickThrough(0, 4), null)
  assert.equal('spend' in open, false)
  assert.equal('revenue' in open, false)
  assert.equal(trendLabel(null, 4), null)
  assert.equal(trendLabel(8, 2), 'higher')
})
