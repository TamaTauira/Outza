import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
    NEXTAUTH_URL: 'http://localhost:3000',
  }), CANONICAL_SITE_URL)
})

test('a missing or Abacus NEXTAUTH_URL falls back to the Vercel app URL', () => {
  assert.equal(resolveSiteUrl({}), CANONICAL_SITE_URL)
  for (const host of [
    'https://sydneyupcoming.abacusai.app',
    'https://outza.abacusai.app/events',
    'https://preview.abacusai.app',
    'outza.abacusai.app',
    'https://apps.abacus.ai',
  ]) {
    const origin = resolveSiteUrl({
      NEXT_PUBLIC_SITE_URL: host,
      SITE_URL: host,
      NEXTAUTH_URL: host,
      AUTH_URL: host,
      VERCEL_URL: host.replace(/^https?:\/\//, '').split('/')[0],
      VERCEL_ENV: 'production',
    })
    assert.equal(origin, CANONICAL_SITE_URL)
    assert.equal(/abacus/i.test(origin), false)
  }
})

test('NEXTAUTH_URL is used when it names a real public host', () => {
  assert.equal(resolveSiteUrl({ NEXTAUTH_URL: 'https://outza-outza.vercel.app' }), CANONICAL_SITE_URL)
  assert.equal(resolveSiteUrl({ NEXTAUTH_URL: 'https://events.example/login' }), 'https://events.example')
  assert.equal(resolveSiteUrl({
    NEXT_PUBLIC_SITE_URL: 'https://outza.abacusai.app',
    NEXTAUTH_URL: 'https://events.example',
  }), 'https://events.example')
})

test('preview deployments use VERCEL_URL and production does not', () => {
  assert.equal(resolveSiteUrl({
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'outza-git-branch-outza.vercel.app',
  }), 'https://outza-git-branch-outza.vercel.app')
  assert.equal(resolveSiteUrl({
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'outza.abacusai.app',
  }), CANONICAL_SITE_URL)
  assert.equal(resolveSiteUrl({
    VERCEL_ENV: 'production',
    VERCEL_URL: 'outza-abc123-outza.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'outza-sepia.vercel.app',
  }), CANONICAL_SITE_URL)
})

test('bot contact strings and dev origins do not name an Abacus host', () => {
  const files = ['./local-extract.ts', './sources/ticketing.ts', './intel/connectors.ts', '../next.config.js']
  for (const file of files) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.equal(/abacusai\.app/i.test(text), false, file)
  }
  const origins = nextConfig.allowedDevOrigins || []
  assert.deepEqual(origins, ['127.0.0.1'])
  assert.equal(origins.some((origin) => /abacus/i.test(origin)), false)
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
