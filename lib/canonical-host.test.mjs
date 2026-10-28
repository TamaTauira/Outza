import assert from 'node:assert/strict'
import test from 'node:test'
import { CANONICAL_SITE_URL, LEGACY_SITE_HOSTS, resolveSiteUrl } from './canonical-host.js'
import nextConfig from '../next.config.js'

test('defaults to the public production host', () => {
  assert.equal(resolveSiteUrl({}), CANONICAL_SITE_URL)
  assert.equal(CANONICAL_SITE_URL, 'https://outza-outza.vercel.app')
})

test('ignores the legacy alias even when Vercel injects it as the production URL', () => {
  assert.equal(resolveSiteUrl({
    VERCEL_PROJECT_PRODUCTION_URL: 'outza-sepia.vercel.app',
    VERCEL_URL: 'outza-abc123-outza.vercel.app',
    NEXTAUTH_URL: 'https://outza-sepia.vercel.app',
    NEXT_PUBLIC_SITE_URL: 'https://outza-sepia.vercel.app/',
    SITE_URL: 'https://outza-sepia.vercel.app',
  }), CANONICAL_SITE_URL)
})

test('NEXT_PUBLIC_SITE_URL overrides the default for a real public domain', () => {
  assert.equal(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: 'https://outza.example/' }), 'https://outza.example')
})

test('SITE_URL is the fallback when NEXT_PUBLIC_SITE_URL is unset', () => {
  assert.equal(resolveSiteUrl({ SITE_URL: 'https://events.example' }), 'https://events.example')
})

test('localhost is not a public origin', () => {
  assert.equal(resolveSiteUrl({
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    SITE_URL: 'http://127.0.0.1:3000',
  }), CANONICAL_SITE_URL)
})

test('legacy alias 308s to the canonical host from next.config', async () => {
  const redirects = await nextConfig.redirects()
  assert.ok(LEGACY_SITE_HOSTS.includes('outza-sepia.vercel.app'))
  const alias = redirects.filter((rule) => (rule.has || []).some((check) => check.type === 'host' && check.value === 'outza-sepia.vercel.app'))
  assert.equal(alias.length, 2)
  for (const rule of alias) {
    assert.equal(rule.permanent, true)
    assert.equal(rule.destination.startsWith(`${CANONICAL_SITE_URL}/`), true)
  }
  assert.deepEqual(alias.map((rule) => rule.source).sort(), ['/', '/:path*'])
  const otherHosts = redirects.filter((rule) => (rule.has || []).some((check) => check.type === 'host' && check.value !== 'outza-sepia.vercel.app'))
  assert.equal(otherHosts.length, 0)
})
