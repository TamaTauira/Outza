import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { POST } from '../app/api/ai-search/route'

test('queries under 2 characters return HTTP 400', async () => {
  const res = await POST(new NextRequest('http://localhost/api/ai-search', {
    method: 'POST',
    body: JSON.stringify({ q: 'a', city: 'Sydney' }),
  }))
  assert.equal(res.status, 400)
  const empty = await POST(new NextRequest('http://localhost/api/ai-search', {
    method: 'POST',
    body: JSON.stringify({ q: '  ', city: 'Sydney' }),
  }))
  assert.equal(empty.status, 400)
})
