import assert from 'node:assert/strict'
import test from 'node:test'
import { INTERACTIVE_CONNECTION_LIMIT, JOB_CONNECTION_LIMIT, POOL_TIMEOUT_SECONDS, pooledDatabaseUrl } from './db-url'

const DIRECT = 'postgresql://user:secret@ep-purple-boat-a7robjzd.ap-southeast-2.aws.neon.tech/neondb?sslmode=require'

test('rewrites a Neon direct host onto the pooled endpoint', () => {
  const url = pooledDatabaseUrl(DIRECT)!
  assert.match(url, /@ep-purple-boat-a7robjzd-pooler\.ap-southeast-2\.aws\.neon\.tech\//)
  assert.match(url, /pgbouncer=true/)
  assert.ok(INTERACTIVE_CONNECTION_LIMIT >= 8, 'Fluid serves concurrent page queries on one instance')
  assert.match(url, new RegExp(`connection_limit=${INTERACTIVE_CONNECTION_LIMIT}(?:&|$)`))
  assert.match(url, new RegExp(`pool_timeout=${POOL_TIMEOUT_SECONDS}(?:&|$)`))
  assert.equal((url.match(/connection_limit=/g) ?? []).length, 1)
  assert.equal((url.match(/sslmode=/g) ?? []).length, 1)
  assert.doesNotMatch(url, /-pooler-pooler/)
  assert.doesNotMatch(url, /connection_limit=1(?:&|$)/)
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
  assert.equal(pooledDatabaseUrl(local, { connectionLimit: 2 }), local)
  assert.equal(pooledDatabaseUrl(undefined), undefined)
})

test('gives the refresh job its own limit and replaces a baked-in connection_limit of 1', () => {
  const baked = `${DIRECT}&connection_limit=1&pool_timeout=2&channel_binding=require`
  const job = pooledDatabaseUrl(baked, { connectionLimit: JOB_CONNECTION_LIMIT, poolTimeoutSeconds: POOL_TIMEOUT_SECONDS })!
  const interactive = pooledDatabaseUrl(DIRECT)!
  assert.match(job, /@ep-purple-boat-a7robjzd-pooler\./)
  assert.match(job, new RegExp(`connection_limit=${JOB_CONNECTION_LIMIT}(?:&|$)`))
  assert.match(job, new RegExp(`pool_timeout=${POOL_TIMEOUT_SECONDS}(?:&|$)`))
  assert.equal((job.match(/connection_limit=/g) ?? []).length, 1)
  assert.equal((job.match(/pool_timeout=/g) ?? []).length, 1)
  assert.doesNotMatch(job, /channel_binding/)
  assert.notEqual(job, interactive)
  assert.ok(JOB_CONNECTION_LIMIT >= 4)
})
