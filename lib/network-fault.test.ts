import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reportCrash } from '../components/report-crash'
import { resetChunkLoadRecoveryForTests } from './chunk-load'
import {
  TRANSIENT_SPIKE_SESSIONS,
  TRANSIENT_WINDOW_MS,
  claimNetworkRetry,
  foldTransientSessions,
  hasErrorStack,
  isBareNetworkFault,
  transientSessionId,
} from './network-fault'

const BARE = [
  'Load failed',
  'Failed to fetch',
  'NetworkError when attempting to fetch resource.',
  'The network connection was lost',
]

function withoutStack(message: string, name = 'TypeError'): TypeError {
  const error = new TypeError(message)
  error.name = name
  error.stack = ''
  return error
}

test('bare network messages with no stack are transient', () => {
  for (const message of BARE) {
    assert.equal(isBareNetworkFault(withoutStack(message)), true, message)
    assert.equal(isBareNetworkFault({ message, name: 'TypeError', stack: '' }), true, message)
    assert.equal(isBareNetworkFault({ message, stack: null }), true, message)
  }
  assert.equal(isBareNetworkFault({ name: 'AbortError', message: 'The operation was aborted.', stack: '' }), true)
  assert.equal(isBareNetworkFault('Load failed'), true)
})

test('the same messages with a stack stay real crashes', () => {
  for (const message of BARE) {
    const error = new TypeError(message)
    assert.equal(hasErrorStack(error.stack), true, message)
    assert.equal(isBareNetworkFault(error), false, message)
  }
  const aborted = new Error('The user aborted a request.')
  aborted.name = 'AbortError'
  assert.equal(isBareNetworkFault(aborted), false)
})

test('chunk failures and ordinary crashes are not transient network errors', () => {
  assert.equal(isBareNetworkFault(withoutStack('Failed to fetch dynamically imported module: https://example.com/chunk.js')), false)
  assert.equal(isBareNetworkFault(withoutStack("Cannot read properties of undefined (reading 'map')")), false)
  assert.equal(isBareNetworkFault(withoutStack('Loading chunk 12 failed.')), false)
  assert.equal(isBareNetworkFault(null), false)
  assert.equal(isBareNetworkFault({ message: 'Load failed', stack: 'TypeError: Load failed\n    at load (app/page.tsx:1:1)' }), false)
})

test('a stackless Safari frame is still a stack', () => {
  assert.equal(hasErrorStack('TypeError: Load failed'), false)
  assert.equal(hasErrorStack('global code@https://outza-outza.vercel.app/:1:20'), true)
  assert.equal(hasErrorStack('    at fetchBoard (https://outza-outza.vercel.app/event-list.js:99:15)'), true)
})

test('session ids are the browser token or nothing', () => {
  assert.equal(transientSessionId('abc-DEF_12'), 'abc-DEF_12')
  assert.equal(transientSessionId('  abcdefgh  '), 'abcdefgh')
  assert.equal(transientSessionId('short'), null)
  assert.equal(transientSessionId('has space!!'), null)
  assert.equal(transientSessionId(12), null)
})

test('transient sessions spike only after enough distinct browsers in the window', () => {
  const start = 1_700_000_000_000
  let raw: string | null = null
  for (let n = 1; n < TRANSIENT_SPIKE_SESSIONS; n++) {
    const folded = foldTransientSessions(raw, `session-${n}`, start + n)
    raw = JSON.stringify(folded.ledger)
    assert.equal(folded.spike, false)
    assert.equal(folded.distinct, n)
  }
  const again = foldTransientSessions(raw, 'session-1', start + 10)
  assert.equal(again.distinct, TRANSIENT_SPIKE_SESSIONS - 1)
  assert.equal(again.spike, false)
  const spike = foldTransientSessions(JSON.stringify(again.ledger), 'session-5', start + 11)
  assert.equal(spike.spike, true)
  assert.equal(spike.distinct, TRANSIENT_SPIKE_SESSIONS)

  const later = foldTransientSessions(JSON.stringify(spike.ledger), 'session-9', start + TRANSIENT_WINDOW_MS + 12)
  assert.equal(later.distinct, 1)
  assert.equal(later.spike, false)
})

test('a broken ledger starts a fresh window', () => {
  const folded = foldTransientSessions('not-json', 'session-1', 50)
  assert.deepEqual(folded.ledger.sessions, [{ id: 'session-1', at: 50 }])
  assert.equal(folded.spike, false)
})

test('the quiet retry is allowed once per window', () => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
  assert.equal(claimNetworkRetry(storage, 1_000), true)
  assert.equal(claimNetworkRetry(storage, 1_500), false)
  assert.equal(claimNetworkRetry(storage, 1_000 + 30_000), true)
  assert.equal(claimNetworkRetry({
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => { throw new Error('SecurityError') },
  }, 1), false)
})

test('reportCrash posts a stackless Load failed and does not reload', () => {
  const posts: string[] = []
  const reloads: number[] = []
  const errors: unknown[] = []
  const previous = {
    sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    fetch: Object.getOwnPropertyDescriptor(globalThis, 'fetch'),
    error: console.error,
  }
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
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
  console.error = (...args: unknown[]) => { errors.push(args[0]) }
  try {
    resetChunkLoadRecoveryForTests()
    reportCrash(withoutStack('Load failed'))
    assert.deepEqual(reloads, [])
    assert.equal(posts.length, 1)
    assert.match(posts[0], /"message":"Load failed"/)
    assert.match(posts[0], /"path":"\/"/)
    assert.match(posts[0], /"name":"TypeError"/)
    assert.equal(errors.length, 0)

    resetChunkLoadRecoveryForTests()
    reportCrash(new TypeError("Cannot read properties of undefined (reading 'map')"))
    assert.equal(posts.length, 2)
    assert.match(posts[1], /Cannot read properties of undefined/)
    assert.equal(errors.length, 1)
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
