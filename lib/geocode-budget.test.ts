import assert from 'node:assert/strict'
import test from 'node:test'
import { geocode } from './geocode'
import { pauseSourceGeocode, runWithSourceBudget, sourceGeocodeBlocked } from './source-budget'

test('geocode does not call out once the source budget is spent', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    throw new Error('should not fetch')
  }) as typeof fetch
  const started = Date.now()
  try {
    const result = await runWithSourceBudget('Moshtix', 5, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return geocode('1 Example Street, Glebe NSW 2037')
    }, 300)
    assert.equal(result.value, null)
    assert.equal(calls, 0)
    assert.ok(Date.now() - started < 500)
  } finally {
    globalThis.fetch = original
  }
})

test('a geocode timeout stops later lookups in the same run and the next run tries again', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async (_url, init) => {
    calls++
    const signal = init?.signal
    await new Promise<void>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('hung')), 5_000)
      const fail = () => {
        clearTimeout(timer)
        const error = new Error('The operation was aborted due to timeout')
        error.name = 'TimeoutError'
        reject(error)
      }
      if (signal?.aborted) fail()
      else signal?.addEventListener('abort', fail, { once: true })
    })
    return new Response('{}')
  }) as typeof fetch
  try {
    const result = await runWithSourceBudget('Moshtix', 8_000, async () => {
      const first = await geocode('9 Timeout Street, Glebe NSW 2037')
      const started = Date.now()
      const second = await geocode('10 Timeout Street, Glebe NSW 2037')
      return { first, second, waited: Date.now() - started, calls }
    }, 2_000)
    assert.equal(result.error, null)
    assert.equal(result.value?.first, null)
    assert.equal(result.value?.second, null)
    assert.ok((result.value?.waited ?? 9_999) < 200)
    assert.equal(result.value?.calls, 1)
    const next = await runWithSourceBudget('Moshtix', 1_000, async () => (sourceGeocodeBlocked() ? 0 : 1))
    assert.equal(next.value, 1)
  } finally {
    globalThis.fetch = original
  }
})

test('pausing geocode does not leak into the next source run', async () => {
  await runWithSourceBudget('Moshtix', 1_000, async () => {
    pauseSourceGeocode()
    assert.equal(sourceGeocodeBlocked(), true)
    return 1
  })
  const next = await runWithSourceBudget('Humanitix', 1_000, async () => (sourceGeocodeBlocked() ? 0 : 1))
  assert.equal(next.value, 1)
  assert.equal(sourceGeocodeBlocked(), false)
})
