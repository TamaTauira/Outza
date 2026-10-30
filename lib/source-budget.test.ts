import assert from 'node:assert/strict'
import test from 'node:test'
import { remainingBudgetMs, runWithSourceBudget, sourceFetchSignal, yieldIfBudget } from './source-budget'

test('fetch signal aborts when the source budget ends', async () => {
  const result = await runWithSourceBudget('City of Sydney', 40, async () => {
    const signal = sourceFetchSignal(10_000)
    await new Promise<void>((resolve) => {
      if (signal.aborted) return resolve()
      signal.addEventListener('abort', () => resolve(), { once: true })
    })
    return 4
  }, 300)
  assert.equal(result.error, null)
  assert.equal(result.timedOut, true)
  assert.equal(result.value, 4)
})

test('a source that notices the budget returns what it saved', async () => {
  const result = await runWithSourceBudget('City of Sydney', 30, async () => {
    let n = 0
    for (; n < 40; n++) {
      if (yieldIfBudget('date windows')) return n
      await new Promise((r) => setTimeout(r, 8))
    }
    return n
  }, 300)
  assert.equal(result.error, null)
  assert.equal(result.timedOut, true)
  assert.ok((result.value ?? -1) >= 0)
  assert.ok((result.value ?? 99) < 40)
})

test('a stuck source is abandoned after the grace period', async () => {
  const started = Date.now()
  const result = await runWithSourceBudget('Eventbrite', 20, () => new Promise<number>(() => {}), 40)
  assert.equal(result.timedOut, true)
  assert.equal(result.value, null)
  assert.ok(Date.now() - started < 400)
})

test('outside a budget, the fetch signal is a normal timeout and the cap is the request', async () => {
  assert.equal(remainingBudgetMs(25), 25)
  const signal = sourceFetchSignal(20)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('signal did not abort')), 200)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
  assert.equal(signal.aborted, true)
})
