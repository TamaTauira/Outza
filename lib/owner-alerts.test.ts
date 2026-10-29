import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OWNER_EMAIL } from './email'
import {
  DEFAULT_FAULT_ALERT_EXTRA_RECIPIENTS,
  faultAlertCopyRecipients,
  faultAlertExtraRecipients,
  faultErrorParts,
  faultMachineBlock,
  faultRouteFor,
} from './owner-alerts'

const ENV = 'FAULT_ALERT_EXTRA_RECIPIENTS'

function withEnv(value: string | undefined, run: () => void) {
  const previous = process.env[ENV]
  if (value === undefined) delete process.env[ENV]
  else process.env[ENV] = value
  try {
    run()
  } finally {
    if (previous === undefined) delete process.env[ENV]
    else process.env[ENV] = previous
  }
}

test('fault copies default to the ops inbox when the env var is unset', () => {
  withEnv(undefined, () => {
    assert.deepEqual(faultAlertExtraRecipients(), [DEFAULT_FAULT_ALERT_EXTRA_RECIPIENTS])
    assert.equal(DEFAULT_FAULT_ALERT_EXTRA_RECIPIENTS, 'outza-tester+faults@mail.grokbot.com')
    assert.deepEqual(faultAlertCopyRecipients(), [DEFAULT_FAULT_ALERT_EXTRA_RECIPIENTS])
  })
})

test('fault copies parse a comma-separated list and skip the owner', () => {
  withEnv(`  ops@example.com, ${OWNER_EMAIL}, Ops <ops@example.com>, bad, second@example.com `, () => {
    assert.deepEqual(faultAlertExtraRecipients(), ['ops@example.com', OWNER_EMAIL, 'second@example.com'])
    assert.deepEqual(faultAlertCopyRecipients(), ['ops@example.com', 'second@example.com'])
  })
})

test('an empty fault recipient list emails the owner only', () => {
  withEnv('  ,  ', () => {
    assert.deepEqual(faultAlertExtraRecipients(), [])
    assert.deepEqual(faultAlertCopyRecipients(), [])
  })
})

test('fault route follows the cron or page that owns the failure', () => {
  assert.equal(faultRouteFor({ area: 'Event refresh', key: 'refresh-stale' }), '/api/cron/refresh')
  assert.equal(faultRouteFor({ area: 'Newsletter', key: 'newsletter-failed' }), '/api/cron/digest')
  assert.equal(faultRouteFor({ area: 'Owner emails', key: 'ideas-digest-failed' }), '/api/cron/owner-alerts')
  assert.equal(faultRouteFor({ area: 'VibePeep Intelligence', key: 'intel-abs_hsi' }), '/api/cron/intel')
  assert.equal(faultRouteFor({ area: 'Server error', route: '/api/events/[id]', detail: 'Path: /api/events/abc' }), '/api/events/[id]')
  assert.equal(faultRouteFor({ area: 'Page crash', detail: 'Page: /sydney/live-music\nBrowser: x' }), '/sydney/live-music')
})

test('fault error parts keep the message and stack when a stack is present', () => {
  const detail = 'Path: /api/cron/refresh\nType: route\n\nError: boom\n    at run (app/api/cron/refresh/route.ts:10:5)\n    at <anonymous>'
  const parts = faultErrorParts({ detail })
  assert.equal(parts.error, 'Error: boom')
  assert.match(parts.stack ?? '', /^at run \(app\/api\/cron\/refresh\/route\.ts:10:5\)/)
  assert.equal(faultErrorParts({ detail: 'No successful refresh on record' }).error, 'No successful refresh on record')
  assert.equal(faultErrorParts({ detail: 'No successful refresh on record' }).stack, null)
  assert.deepEqual(faultErrorParts({ detail, error: 'boom', stack: 'Error: boom\n    at run' }), {
    error: 'boom',
    stack: 'Error: boom\n    at run',
  })
})

test('fault machine block is one stable JSON object', () => {
  const firstSeen = new Date('2026-10-29T01:02:03.000Z')
  const latest = new Date('2026-10-29T07:08:09.000Z')
  const block = faultMachineBlock({
    area: 'Event refresh',
    firstSeen,
    latest,
    count: 4,
    route: '/api/cron/refresh',
    error: 'Ticketmaster: HTTP 500',
    stack: null,
  })
  assert.match(block, /^VIBEPEEP_FAULT\n\{/)
  const parsed = JSON.parse(block.slice('VIBEPEEP_FAULT\n'.length))
  assert.deepEqual(Object.keys(parsed), ['area', 'first_seen', 'latest', 'count', 'route', 'error', 'stack'])
  assert.deepEqual(parsed, {
    area: 'Event refresh',
    first_seen: '2026-10-29T01:02:03.000Z',
    latest: '2026-10-29T07:08:09.000Z',
    count: 4,
    route: '/api/cron/refresh',
    error: 'Ticketmaster: HTTP 500',
    stack: null,
  })
})
