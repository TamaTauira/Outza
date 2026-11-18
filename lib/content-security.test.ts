import assert from 'node:assert/strict'
import test from 'node:test'
import { contentSecurityPolicy } from './content-security'
import { DIGITAL_SERVICE_LINE } from './digital-service'

test('production scripts drop unsafe-eval and keep inline scripts and styles', () => {
  const csp = contentSecurityPolicy('production')
  const script = csp.split('; ').find((part) => part.startsWith('script-src '))
  assert.equal(script, "script-src 'self' 'unsafe-inline'")
  assert.equal(csp.includes("'unsafe-eval'"), false)
  assert.match(csp, /style-src 'self' 'unsafe-inline'/)
  assert.match(csp, /worker-src 'self' blob:/)
  assert.match(csp, /frame-src 'self' https:\/\/js\.stripe\.com https:\/\/hooks\.stripe\.com https:\/\/checkout\.stripe\.com/)
  assert.match(csp, /connect-src 'self' https: wss:/)
  assert.match(csp, /upgrade-insecure-requests/)
})

test('preview allows the Vercel toolbar script and still drops unsafe-eval', () => {
  const csp = contentSecurityPolicy('production', 'preview')
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/vercel\.live/)
  assert.equal(csp.includes("'unsafe-eval'"), false)
  assert.equal(contentSecurityPolicy('production', 'production').includes('vercel.live'), false)
})

test('development keeps unsafe-eval for the Next dev runtime', () => {
  const csp = contentSecurityPolicy('development')
  assert.match(csp, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/)
  assert.equal(csp.includes('upgrade-insecure-requests'), false)
})

test('pricing copy says the service is digital and when it starts', () => {
  assert.match(DIGITAL_SERVICE_LINE, /digital services, delivered online/)
  assert.match(DIGITAL_SERVICE_LINE, /Nothing is shipped/)
  assert.match(DIGITAL_SERVICE_LINE, /payment is confirmed/)
  assert.match(DIGITAL_SERVICE_LINE, /30-day trial starts when you confirm it/)
})
