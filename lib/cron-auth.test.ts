import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cronAuthorized } from './cron-auth'

function headers(map: Record<string, string>) {
  return { get: (name: string) => map[name] ?? null }
}

test('cron auth accepts the Vercel bearer token, the legacy header, and an admin session', () => {
  const previous = process.env.CRON_SECRET
  process.env.CRON_SECRET = 's3cret'
  try {
    assert.equal(cronAuthorized({ headers: headers({ authorization: 'Bearer s3cret' }) }, null), true)
    assert.equal(cronAuthorized({ headers: headers({ 'x-cron-secret': 's3cret' }) }, null), true)
    assert.equal(cronAuthorized({ headers: headers({}) }, 'ADMIN'), true)
    assert.equal(cronAuthorized({ headers: headers({ authorization: 'Bearer wrong' }) }, 'CONSUMER'), false)
    assert.equal(cronAuthorized({ headers: headers({ authorization: 's3cret' }) }, null), false)
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  }
})

test('cron auth fails closed when CRON_SECRET is missing', () => {
  const previous = process.env.CRON_SECRET
  delete process.env.CRON_SECRET
  try {
    assert.equal(cronAuthorized({ headers: headers({ authorization: 'Bearer anything' }) }, null), false)
    assert.equal(cronAuthorized({ headers: headers({}) }, 'ADMIN'), true)
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  }
})
