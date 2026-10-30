import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportCrash } from '../components/report-crash'
import {
  CHUNK_RELOAD_STORAGE_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  isChunkLoadError,
  recoverChunkLoadFailure,
  resetChunkLoadRecoveryForTests,
  type ChunkLoadStorage,
  type ChunkReloadState,
} from './chunk-load'

const PRODUCTION_MESSAGE = 'Failed to load chunk /_next/static/immutable/chunks/1xd34x63diks6.js from module 73859'

function memoryStorage(initial?: Record<string, string>): ChunkLoadStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial ?? {}))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
  }
}

function harness(initial?: Record<string, string>) {
  const storage = memoryStorage(initial)
  const reloads: number[] = []
  const state: ChunkReloadState = { phase: 'idle' }
  const recover = (error: unknown, now = 1_000) => recoverChunkLoadFailure(error, {
    now,
    storage,
    state,
    reload: () => { reloads.push(now) },
  })
  return { storage, reloads, state, recover }
}

test('detects turbopack, webpack, and browser dynamic-import failures', () => {
  assert.equal(isChunkLoadError(new Error(PRODUCTION_MESSAGE)), true)
  assert.equal(isChunkLoadError(PRODUCTION_MESSAGE), true)
  const webpack = new Error('Loading chunk 73859 failed.\n(timeout: https://outza-outza.vercel.app/_next/static/chunks/app.js)')
  webpack.name = 'ChunkLoadError'
  assert.equal(isChunkLoadError(webpack), true)
  assert.equal(isChunkLoadError(new Error('Loading CSS chunk 12 failed.')), true)
  assert.equal(isChunkLoadError({ name: 'ChunkLoadError', message: '' }), true)
  assert.equal(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://outza-outza.vercel.app/_next/static/chunks/foo.js')), true)
  assert.equal(isChunkLoadError(new TypeError('Importing a module script failed.')), true)
  assert.equal(isChunkLoadError(new Error('error loading dynamically imported module: https://example.com/chunk.js')), true)
  assert.equal(isChunkLoadError(Object.assign(new Error('import()'), { cause: new TypeError('Importing a module script failed.') })), true)
})

test('ignores ordinary crashes and lookalike messages', () => {
  assert.equal(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")), false)
  assert.equal(isChunkLoadError(new Error('Failed to load chunks of the map')), false)
  assert.equal(isChunkLoadError(new Error('Loading chunk failed')), false)
  assert.equal(isChunkLoadError(new Error('NetworkError when attempting to fetch resource.')), false)
  assert.equal(isChunkLoadError(null), false)
  assert.equal(isChunkLoadError(undefined), false)
  assert.equal(isChunkLoadError(''), false)
  assert.equal(isChunkLoadError(404), false)
})

test('the first chunk failure reloads once and records the timestamp', () => {
  const { storage, reloads, recover } = harness()
  assert.equal(recover(new Error(PRODUCTION_MESSAGE), 1_700_000_000_000), 'reload')
  assert.deepEqual(reloads, [1_700_000_000_000])
  assert.equal(storage.data.get(CHUNK_RELOAD_STORAGE_KEY), '1700000000000')
  assert.equal(recover(new Error(PRODUCTION_MESSAGE), 1_700_000_000_100), 'handled')
  assert.deepEqual(reloads, [1_700_000_000_000])
})

test('a chunk failure inside the reload window is reported and does not reload again', () => {
  const started = 5_000
  const { reloads, recover } = harness({ [CHUNK_RELOAD_STORAGE_KEY]: String(started) })
  assert.equal(recover(new Error('Loading chunk app/page failed.'), started + 2_000), 'report')
  assert.deepEqual(reloads, [])
  assert.equal(recover(new Error('Loading chunk app/page failed.'), started + 3_000), 'handled')
  assert.deepEqual(reloads, [])
})

test('a timestamp from a previous incident can reload again after the window', () => {
  const started = 5_000
  const { storage, reloads, recover } = harness({ [CHUNK_RELOAD_STORAGE_KEY]: String(started) })
  const now = started + CHUNK_RELOAD_WINDOW_MS
  assert.equal(recover(new TypeError('Importing a module script failed.'), now), 'reload')
  assert.deepEqual(reloads, [now])
  assert.equal(storage.data.get(CHUNK_RELOAD_STORAGE_KEY), String(now))
})

test('a future timestamp still counts as an attempt so the reload cannot loop', () => {
  const { reloads, recover } = harness({ [CHUNK_RELOAD_STORAGE_KEY]: '10000' })
  assert.equal(recover(new Error(PRODUCTION_MESSAGE), 9_000), 'report')
  assert.deepEqual(reloads, [])
})

test('an unreadable guard reports the chunk failure instead of reloading', () => {
  const storage: ChunkLoadStorage = {
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => { throw new Error('SecurityError') },
  }
  const reloads: number[] = []
  const action = recoverChunkLoadFailure(new Error(PRODUCTION_MESSAGE), {
    now: 1,
    storage,
    state: { phase: 'idle' },
    reload: () => { reloads.push(1) },
  })
  assert.equal(action, 'report')
  assert.deepEqual(reloads, [])
})

test('a guard that cannot be saved does not reload', () => {
  const storage: ChunkLoadStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError') },
  }
  const reloads: number[] = []
  const action = recoverChunkLoadFailure('Failed to fetch dynamically imported module', {
    now: 1,
    storage,
    state: { phase: 'idle' },
    reload: () => { reloads.push(1) },
  })
  assert.equal(action, 'report')
  assert.deepEqual(reloads, [])
})

test('a non-numeric guard is ignored and a reload is allowed', () => {
  const { storage, reloads, recover } = harness({ [CHUNK_RELOAD_STORAGE_KEY]: 'not-a-time' })
  assert.equal(recover(new Error(PRODUCTION_MESSAGE), 40), 'reload')
  assert.deepEqual(reloads, [40])
  assert.equal(storage.data.get(CHUNK_RELOAD_STORAGE_KEY), '40')
})

test('ordinary errors do not read the guard or reload', () => {
  const storage: ChunkLoadStorage = {
    getItem: () => { throw new Error('should not read') },
    setItem: () => { throw new Error('should not write') },
  }
  const reloads: number[] = []
  const action = recoverChunkLoadFailure(new Error('boom'), {
    storage,
    state: { phase: 'idle' },
    reload: () => { reloads.push(1) },
  })
  assert.equal(action, 'not-chunk')
  assert.deepEqual(reloads, [])
})

test('reportCrash reloads a chunk failure once and posts only if it happens again', async () => {
  const data = new Map<string, string>()
  const reloads: number[] = []
  const posts: string[] = []
  const previous = {
    sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    fetch: Object.getOwnPropertyDescriptor(globalThis, 'fetch'),
    error: console.error,
  }
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value) },
    },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { pathname: '/', reload: () => { reloads.push(1) } } },
  })
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: (_url: string, init?: { body?: string }) => {
      posts.push(String(init?.body ?? ''))
      return Promise.resolve(new Response('{}'))
    },
  })
  console.error = () => {}
  try {
    resetChunkLoadRecoveryForTests()
    reportCrash(new Error(PRODUCTION_MESSAGE))
    reportCrash(new Error(PRODUCTION_MESSAGE))
    assert.equal(reloads.length, 1)
    assert.deepEqual(posts, [])
    assert.ok(data.get(CHUNK_RELOAD_STORAGE_KEY))

    resetChunkLoadRecoveryForTests()
    reportCrash(new Error(PRODUCTION_MESSAGE))
    assert.equal(reloads.length, 1)
    assert.equal(posts.length, 1)
    assert.match(posts[0], /Failed to load chunk/)
    assert.match(posts[0], /"path":"\/"/)

    data.clear()
    resetChunkLoadRecoveryForTests()
    reportCrash(new Error('Cannot read properties of undefined'))
    assert.equal(reloads.length, 1)
    assert.equal(posts.length, 2)
    assert.match(posts[1], /Cannot read properties of undefined/)
  } finally {
    console.error = previous.error
    resetChunkLoadRecoveryForTests()
    if (previous.sessionStorage) Object.defineProperty(globalThis, 'sessionStorage', previous.sessionStorage)
    else delete (globalThis as { sessionStorage?: unknown }).sessionStorage
    if (previous.window) Object.defineProperty(globalThis, 'window', previous.window)
    else delete (globalThis as { window?: unknown }).window
    if (previous.fetch) Object.defineProperty(globalThis, 'fetch', previous.fetch)
    else delete (globalThis as { fetch?: unknown }).fetch
  }
})
