import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keepLastGood, readJson } from './client-fetch'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('readJson returns the body and never rejects', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  const calls: string[] = []
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: (url: string) => {
      calls.push(url)
      if (url.endsWith('/ok')) return Promise.resolve(jsonResponse({ events: [1] }))
      if (url.endsWith('/down')) return Promise.resolve(jsonResponse({ error: 'nope' }, 500))
      if (url.endsWith('/html')) return Promise.resolve(new Response('<html>', { status: 200 }))
      if (url.endsWith('/abort')) {
        const error = new Error('The operation was aborted.')
        error.name = 'AbortError'
        return Promise.reject(error)
      }
      const error = new TypeError('Load failed')
      error.stack = ''
      return Promise.reject(error)
    },
  })
  try {
    assert.deepEqual(await readJson<{ events: number[] }>('/ok'), { ok: true, data: { events: [1] } })
    assert.deepEqual(await readJson('/down'), { ok: false, reason: 'http', status: 500 })
    assert.deepEqual(await readJson('/html'), { ok: false, reason: 'bad-json', status: 200 })
    assert.deepEqual(await readJson('/abort'), { ok: false, reason: 'abort' })
    assert.deepEqual(await readJson('/blip'), { ok: false, reason: 'network' })
    assert.deepEqual(calls, ['/ok', '/down', '/html', '/abort', '/blip'])
  } finally {
    if (previous) Object.defineProperty(globalThis, 'fetch', previous)
    else delete (globalThis as { fetch?: unknown }).fetch
  }
})

test('a network blip keeps the last good list and marks the view offline', () => {
  const previous = [{ id: 'gig' }]
  assert.deepEqual(keepLastGood(previous, { ok: false, reason: 'network' }), { data: previous, offline: true, replace: false })
  assert.deepEqual(keepLastGood(previous, { ok: false, reason: 'abort' }), { data: previous, offline: false, replace: false })
  assert.deepEqual(keepLastGood(previous, { ok: false, reason: 'http', status: 500 }), { data: previous, offline: false, replace: false })
  assert.deepEqual(keepLastGood(previous, { ok: true, data: [] }), { data: [], offline: false, replace: true })
})
