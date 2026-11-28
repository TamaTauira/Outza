import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CITIES } from './cities'
import { warmTotalsCities } from './refresh'
import { FINALIZE_POST_BUDGET_MS, TOTALS_WARM_BUDGET_MS, TOTALS_WARM_CITY_BUDGET_MS } from './refresh-plan'

test('the totals warm budgets fit the finalize invocation alongside the other post-steps', () => {
  assert.ok(TOTALS_WARM_CITY_BUDGET_MS <= TOTALS_WARM_BUDGET_MS, 'a city can never be offered more than the whole warm')
  // The steps before the warm can already draw ~205s of the 300s
  // function limit in the worst case: the 150s post-step wall,
  // retirement's 30s and the image pass's 25s. The warm takes what is
  // left with at least 30s of margin for the cycle assessment, the
  // log writes and the response.
  assert.ok(FINALIZE_POST_BUDGET_MS + 30_000 + 25_000 + TOTALS_WARM_BUDGET_MS <= 270_000, 'worst-case finalize stays inside the function limit with margin')
})

test('the warm walks every catalogue city, two at a time', async () => {
  assert.equal(CITIES.length, 9, 'the catalogue is nine cities')
  const seen: string[] = []
  const budgets = new Map<string, number>()
  let active = 0
  let maxActive = 0
  const outcome = await warmTotalsCities(CITIES, async (city, budgetMs) => {
    budgets.set(city.name, budgetMs)
    active++
    maxActive = Math.max(maxActive, active)
    await new Promise((r) => setTimeout(r, 5))
    active--
    seen.push(city.name)
    return true
  }, { budgetMs: TOTALS_WARM_BUDGET_MS, cityBudgetMs: TOTALS_WARM_CITY_BUDGET_MS })
  assert.deepEqual([...seen].sort(), CITIES.map((c) => c.name).sort(), 'every catalogue city was warmed')
  assert.deepEqual(outcome.warmed, CITIES.map((c) => c.name), 'all nine warmed, reported in catalogue order')
  assert.deepEqual(outcome.failed, [])
  assert.deepEqual(outcome.skipped, [])
  assert.equal(maxActive, 2, 'the walk runs two cities at a time, never more')
  for (const city of CITIES) {
    assert.equal(budgets.get(city.name), TOTALS_WARM_CITY_BUDGET_MS, `${city.name} was offered the full per-city budget while the warm's clock was fresh`)
  }
})

test('one city failing does not stop the walk or the cities behind it', async () => {
  const attempted: string[] = []
  const outcome = await warmTotalsCities(CITIES, async (city) => {
    attempted.push(city.name)
    if (city.name === 'Perth') throw new Error('scan timed out')
    if (city.name === 'Darwin') return false
    return true
  }, { budgetMs: TOTALS_WARM_BUDGET_MS, cityBudgetMs: TOTALS_WARM_CITY_BUDGET_MS })
  assert.deepEqual([...attempted].sort(), CITIES.map((c) => c.name).sort(), 'every city was attempted despite the failures')
  assert.deepEqual(outcome.failed, ['Perth', 'Darwin'], 'a throw and a false both count as that city failing, nothing more')
  assert.deepEqual(outcome.warmed, CITIES.map((c) => c.name).filter((n) => n !== 'Perth' && n !== 'Darwin'))
  assert.deepEqual(outcome.skipped, [])
})

test('cities the warm budget runs out on are skipped, not failed, and offers shrink to what is left', async () => {
  let t = 0
  const budgets = new Map<string, number>()
  const outcome = await warmTotalsCities(CITIES, async (city, budgetMs) => {
    budgets.set(city.name, budgetMs)
    t += 30_000 // each city consumes 30s of the warm's wall clock
    return true
  }, { budgetMs: 50_000, cityBudgetMs: 45_000, now: () => t })
  // The first wave starts against a fresh clock: Sydney is offered
  // the per-city cap. Its 30s of work leaves 20s, so Melbourne's
  // offer is capped by what remains, not by the per-city budget.
  // Together they overrun the 50s warm, so every later city is
  // skipped rather than started with no time to finish.
  assert.equal(budgets.get('Sydney'), 45_000)
  assert.equal(budgets.get('Melbourne'), 20_000, 'an offer is the smaller of the per-city budget and the time left in the warm')
  assert.deepEqual(outcome.warmed, ['Sydney', 'Melbourne'])
  assert.deepEqual(outcome.failed, [])
  assert.deepEqual(outcome.skipped, CITIES.map((c) => c.name).slice(2))
})

test('finalize warms the totals after its invalidation, and only finalize does', () => {
  // The warm belongs to the finalize cycle: it fills the cache
  // entries that cycle's invalidation dropped, at the end of a
  // completed ingest. The non-finalize refresh path also invalidates
  // at its end, but it is a mid-cycle run of individual sources —
  // warming there would recompute totals over a half-saved cycle.
  // Pin the placement at source level: no CI step type-checks, and
  // the ordering is the design.
  const src = readFileSync(new URL('./refresh.ts', import.meta.url), 'utf8')
  const fin = src.slice(src.indexOf('async function finalizeCycle'))
  assert.ok(fin.includes('await invalidatePublicListings()'), 'finalize invalidates the public listings')
  assert.ok(fin.includes('await warmSuburbTotals()'), 'finalize warms the suburb totals')
  assert.ok(fin.indexOf('await invalidatePublicListings()') < fin.indexOf('await warmSuburbTotals()'), 'the warm runs after the invalidation, so it fills the entries the invalidation dropped')
  const execute = src.slice(src.indexOf('async function execute'), src.indexOf('async function boundedImagePass'))
  assert.equal(execute.includes('warmSuburbTotals'), false, 'the non-finalize refresh path never warms')
  const invalidate = src.slice(src.indexOf('async function invalidatePublicListings'), src.indexOf('export type TotalsWarmOutcome'))
  assert.equal(invalidate.includes('warmSuburbTotals'), false, 'the invalidation itself does not warm: both refresh paths call it, only finalize warms')
})

test('the warm can never reject: its whole body, dynamic import included, sits inside a try/catch', () => {
  // finalizeCycle awaits warmSuburbTotals unwrapped, after the cycle
  // log is recorded and the heartbeat written path depends on it
  // returning — a rejection (e.g. the seo-server module failing to
  // load) would cost finalizeCycle its result. Every other finalize
  // post-step guards its own failures; the warm must too, at its top
  // level, not just per city. Pin it at source level like the
  // placement above.
  const src = readFileSync(new URL('./refresh.ts', import.meta.url), 'utf8')
  const warm = src.slice(src.indexOf('async function warmSuburbTotals'), src.indexOf('async function noteVolume'))
  const importAt = warm.indexOf("await import('@/lib/seo-server')")
  assert.ok(importAt > -1, 'the warm still loads the totals read from seo-server')
  assert.ok(warm.indexOf('try {') > -1 && warm.indexOf('try {') < importAt, 'the try opens before the dynamic import, so a module-load failure is caught too')
  assert.ok(warm.indexOf('} catch (err) {') > importAt, 'the catch closes around the import and the walk')
  assert.ok(warm.includes("console.error('[refresh] suburb totals warm failed'"), 'a caught failure is logged, not swallowed silently')
  assert.equal(warm.includes('throw'), false, 'the warm never rethrows: it returns normally on every path')
})
