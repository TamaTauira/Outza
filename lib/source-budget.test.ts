import assert from 'node:assert/strict'
import test from 'node:test'
import { noteSourceSaved, remainingBudgetMs, runWithSourceBudget, settleBudgetError, sourceFetchSignal, yieldIfBudget } from './source-budget'

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

test('polling the budget stops a synchronous scan before the grace timer', async () => {
  const started = Date.now()
  const result = await runWithSourceBudget('Quality pass', 0, async () => {
    for (let n = 0; n < 100; n++) {
      if (yieldIfBudget('duplicate grouping')) return n
    }
    return 100
  }, 5_000)
  assert.equal(result.error, null)
  assert.equal(result.timedOut, true)
  assert.equal(result.value, 0)
  assert.ok(Date.now() - started < 500)
})

test('a stuck source is abandoned after the grace period', async () => {
  const started = Date.now()
  const result = await runWithSourceBudget('Eventbrite', 20, () => new Promise<number>(() => {}), 40)
  assert.equal(result.timedOut, true)
  assert.equal(result.value, null)
  assert.ok(Date.now() - started < 400)
})

function abortError(message = 'This operation was aborted') {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

test('an abort well before the deadline is still a hard error', async () => {
  const result = await runWithSourceBudget('Moshtix', 10_000, async () => {
    noteSourceSaved(10)
    throw abortError()
  }, 40)
  assert.equal(result.timedOut, false)
  assert.equal(result.error?.message, 'This operation was aborted')
  assert.equal(result.saved, 10)
})

test('an abort as the budget ends keeps the events already saved', async () => {
  const result = await runWithSourceBudget('Moshtix', 40, async () => {
    noteSourceSaved(634)
    const signal = sourceFetchSignal(10_000)
    await new Promise<never>((_resolve, reject) => {
      if (signal.aborted) reject(abortError())
      else signal.addEventListener('abort', () => reject(abortError()), { once: true })
    })
  }, 300)
  assert.equal(result.error, null)
  assert.equal(result.timedOut, true)
  assert.equal(result.saved, 634)
  assert.equal(result.value, null)
})

test('a deadline abort that saved events is not a hard error, and one that saved nothing is', () => {
  const saved = settleBudgetError({
    error: abortError(),
    signalAborted: false,
    pastDeadline: true,
    saved: 634,
  })
  assert.equal(saved.timedOut, true)
  assert.equal(saved.error, null)

  const empty = settleBudgetError({
    error: abortError(),
    signalAborted: false,
    pastDeadline: true,
    saved: 0,
  })
  assert.equal(empty.timedOut, false)
  assert.equal(empty.error?.message, 'This operation was aborted')

  const http = settleBudgetError({
    error: new Error('Moshtix API 500'),
    signalAborted: false,
    pastDeadline: true,
    saved: 634,
  })
  assert.equal(http.timedOut, false)
  assert.equal(http.error?.message, 'Moshtix API 500')
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
