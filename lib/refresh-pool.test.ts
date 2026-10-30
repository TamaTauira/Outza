import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('refresh work is pinned to the job pool and cannot outrun it', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
  const refresh = read('./refresh.ts')
  const quality = read('./quality-pass.ts')
  const images = read('./images/runner.ts')
  assert.match(refresh, /runWithJobPrisma\(/)
  assert.match(refresh, /for \(const \[name, fn\] of selected\)/)
  assert.match(quality, /runWithJobPrisma\(/)
  assert.match(quality, /JOB_CONNECTION_LIMIT/)
  assert.doesNotMatch(quality, /inBatches\([^)]*20/)
  assert.match(images, /runWithJobPrisma\(/)
  assert.match(images, /JOB_CONNECTION_LIMIT/)
})
