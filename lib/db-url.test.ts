import assert from 'node:assert/strict'
import test from 'node:test'
import { pooledDatabaseUrl } from './db-url'

const DIRECT = 'postgresql://user:secret@ep-purple-boat-a7robjzd.ap-southeast-2.aws.neon.tech/neondb?sslmode=require'

test('rewrites a Neon direct host onto the pooled endpoint', () => {
  const url = pooledDatabaseUrl(DIRECT)!
  assert.match(url, /@ep-purple-boat-a7robjzd-pooler\.ap-southeast-2\.aws\.neon\.tech\//)
  assert.match(url, /pgbouncer=true/)
  assert.match(url, /connection_limit=1/)
  assert.equal((url.match(/sslmode=/g) ?? []).length, 1)
  assert.doesNotMatch(url, /-pooler-pooler/)
})

test('does not double-pool an already pooled Neon URL', () => {
  const pooled = DIRECT.replace('.ap-southeast-2', '-pooler.ap-southeast-2')
  const url = pooledDatabaseUrl(pooled)!
  assert.doesNotMatch(url, /-pooler-pooler/)
  assert.match(url, /-pooler\.ap-southeast-2/)
})

test('drops channel binding when switching to the pooler', () => {
  const url = pooledDatabaseUrl(`${DIRECT}&channel_binding=require`)!
  assert.doesNotMatch(url, /channel_binding/)
  assert.match(url, /sslmode=require/)
  assert.match(url, /pgbouncer=true/)
})

test('leaves a non-Neon URL alone', () => {
  const local = 'postgresql://user:secret@localhost:5432/app'
  assert.equal(pooledDatabaseUrl(local), local)
  assert.equal(pooledDatabaseUrl(undefined), undefined)
})
