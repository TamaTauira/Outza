import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { POST } from '../app/api/refresh-events/route'

test('refresh-events rejects callers who are not cron or an admin', async () => {
  const res = await POST(new NextRequest('http://localhost/api/refresh-events?source=qa-probe-not-a-source', { method: 'POST' }))
  assert.equal(res.status, 403)
  const body = await res.json()
  assert.equal(body.error, 'Not allowed')
})

test('refresh-events still refuses a full refresh even when the secret is set', async () => {
  const previous = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'qa-refresh-secret'
  try {
    const res = await POST(new NextRequest('http://localhost/api/refresh-events', {
      method: 'POST',
      headers: { authorization: 'Bearer qa-refresh-secret' },
    }))
    assert.equal(res.status, 400)
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  }
})
