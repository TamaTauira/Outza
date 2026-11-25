import assert from 'node:assert/strict'
import test from 'node:test'
import { nextSourcePause, sourceShouldRun, SOURCE_PAUSE_FAULT_MS, SOURCE_RETRY_MS } from '@/lib/source-health'
import { isMajorBump } from './deps'
import { lateHeartbeats } from './watchdog'
import { opsReadAuthorized } from './read-auth'
import { pickPublicEvent, runSyntheticChecks } from './synthetic'

const hour = 60 * 60 * 1000

test('a source pauses on the third failure and resumes on success', () => {
  const t0 = Date.parse('2026-11-24T00:00:00.000Z')
  let state = nextSourcePause({ failStreak: 0, pausedAt: null, lastAttempt: null }, 'failure', t0)
  assert.equal(state.pausedAt, null)
  state = nextSourcePause(state, 'failure', t0 + hour)
  assert.equal(state.newlyPaused, false)
  state = nextSourcePause(state, 'failure', t0 + 2 * hour)
  assert.equal(state.newlyPaused, true)
  assert.equal(state.fault, false)
  assert.equal(sourceShouldRun(state, t0 + 2 * hour + hour), false)
  assert.equal(sourceShouldRun(state, t0 + 2 * hour + SOURCE_RETRY_MS), true)
  const dayLater = nextSourcePause(state, 'failure', state.pausedAt! + SOURCE_PAUSE_FAULT_MS)
  assert.equal(dayLater.fault, true)
  const resumed = nextSourcePause(dayLater, 'success', dayLater.lastAttempt! + hour)
  assert.equal(resumed.pausedAt, null)
  assert.equal(resumed.resumed, true)
  assert.equal(resumed.failStreak, 0)
})

test('a heartbeat is late only after twice its schedule', () => {
  const now = Date.parse('2026-11-24T12:00:00.000Z')
  const late = lateHeartbeats([
    { name: 'synthetic', at: now - 3 * hour },
    { name: 'quality', at: now - 20 * hour },
    { name: 'missing-cron', at: null },
  ], now)
  assert.deepEqual(late.map((row) => row.name), ['synthetic'])
})

test('the ops summary token must match and be long enough', () => {
  const previous = process.env.OPS_READ_TOKEN
  process.env.OPS_READ_TOKEN = 'short'
  assert.equal(opsReadAuthorized({ headers: { get: () => 'Bearer short' } }), false)
  process.env.OPS_READ_TOKEN = 'a-long-enough-ops-token'
  assert.equal(opsReadAuthorized({ headers: { get: () => 'Bearer a-long-enough-ops-token' } }), true)
  assert.equal(opsReadAuthorized({ headers: { get: () => 'Bearer wrong-long-token-value' } }), false)
  if (previous == null) delete process.env.OPS_READ_TOKEN
  else process.env.OPS_READ_TOKEN = previous
})

test('major dependency bumps are the ones left for the digest', () => {
  assert.equal(isMajorBump('Bump next from 16.4.1 to 16.5.0'), false)
  assert.equal(isMajorBump('Bump next from 16.4.1 to 17.0.0'), true)
  assert.equal(isMajorBump('chore: readme'), false)
})

test('synthetic checks treat a healthy page as ok and a 500 as a fault', async () => {
  const fetchImpl: typeof fetch = async (url) => {
    const path = String(url)
    if (path.endsWith('/sydney')) return new Response('nope', { status: 500 })
    if (path.endsWith('/sitemap.xml')) return new Response('<sitemapindex></sitemapindex>', { status: 200 })
    if (path.endsWith('/og-image.png')) return new Response('png', { status: 200, headers: { 'content-type': 'image/png' } })
    if (path.endsWith('/api/ai-search')) return new Response(JSON.stringify({ results: [] }), { status: 200 })
    return new Response(`<html>VibePeep ${'event '.repeat(40)}</html>`, { status: 200 })
  }
  const checks = await runSyntheticChecks({ origin: 'https://vibepeep.example', eventPath: '/events/jazz', fetchImpl })
  const byName = Object.fromEntries(checks.map((check) => [check.name, check.ok]))
  assert.equal(byName.home, true)
  assert.equal(byName.sydney, false)
  assert.equal(byName.event, true)
  assert.equal(byName.sitemap, true)
  assert.equal(byName.og, true)
  assert.equal(byName.ask, true)
})

test('synthetic event pick skips a same-day listing that already finished', () => {
  const now = new Date('2026-11-25T10:30:00.000Z') // 9:30pm AEDT on 25 Nov
  const today = new Date('2026-11-25T00:00:00.000Z')
  const ended = { id: 'a', city: 'Sydney', date: today, endDate: null, time: '18:00', endTime: '20:30', title: 'Done' }
  const running = { id: 'b', city: 'Sydney', date: today, endDate: null, time: '18:00', endTime: '23:30', title: 'Still on' }
  const later = { id: 'c', city: 'Sydney', date: new Date('2026-11-26T00:00:00.000Z'), endDate: null, time: '10:00', endTime: null, title: 'Tomorrow' }
  assert.equal(pickPublicEvent([ended, running, later], now)?.id, 'b')
  assert.equal(pickPublicEvent([ended, later], now)?.id, 'c')
  assert.equal(pickPublicEvent([ended], now), null)
})
