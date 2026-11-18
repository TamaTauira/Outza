import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { GUIDE_CACHE_BYTES, guideModelForCache } from './seo-server'
import type { GuideDecision } from './local-seo'
import type { SeasonDecision } from './seasons'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

function decision(i: number, index: boolean): GuideDecision {
  const slug = `suburb-${i}`
  return {
    spec: { activity: 'markets', when: 'saturday', suburb: slug, suburbSlug: slug },
    path: `/sydney/${slug}/markets/saturday`,
    kind: 'suburb-activity-when',
    total: 4,
    fresh: 4,
    index,
    reason: index ? 'index' : 'thin',
    canonicalPath: `/sydney/${slug}/markets/saturday`,
  }
}

test('guide inventory is cached as the model, under the 2MB data-cache limit', () => {
  const src = read('./seo-server.ts')
  assert.match(src, /guide-model-v3/)
  assert.equal(src.includes('guide-rows-v2'), false)
  assert.match(src, /loadCityGuideModels/)
  assert.equal(src.includes('Promise.all(CITIES.map'), false)
  const small = guideModelForCache({
    decisions: [decision(1, true)],
    suburbs: [{ name: 'Newtown', slug: 'newtown', count: 3 }],
    seasons: [] as SeasonDecision[],
  })
  assert.equal(small.decisions.length, 1)
  const bulky = guideModelForCache({
    decisions: Array.from({ length: 8000 }, (_, i) => decision(i, i % 40 === 0)),
    suburbs: [],
    seasons: [],
  })
  assert.ok(JSON.stringify(bulky).length <= GUIDE_CACHE_BYTES)
  assert.ok(bulky.decisions.length < 8000)
  assert.ok(bulky.decisions.every((d) => d.index))
})
