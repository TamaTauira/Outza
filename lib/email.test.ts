import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  DEFAULT_FROM_EMAIL,
  YAHOO_DAILY_CAP,
  activeMailTransport,
  emailSendingEnabled,
  publicEmailError,
  resetEmailTransportForTests,
  sendEmail,
  setEmailTestAdapters,
  smtpFromAddress,
  smtpTransportOptions,
} from './email'

const MAIL_ENV = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']

function restoreEnv(saved: Map<string, string | undefined>) {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

function saveEnv() {
  return new Map(MAIL_ENV.map((name) => [name, process.env[name]]))
}

function clearMailEnv() {
  for (const name of MAIL_ENV) delete process.env[name]
  resetEmailTransportForTests()
}

describe('email', { concurrency: 1 }, () => {
  test('email stays disabled and does not call a mail API without a transport', async () => {
    const saved = saveEnv()
    const originalFetch = globalThis.fetch
    clearMailEnv()
    let called = false
    globalThis.fetch = async () => {
      called = true
      return new Response('{}', { status: 200 })
    }
    try {
      assert.equal(emailSendingEnabled(), false)
      assert.equal(activeMailTransport(), 'off')
      process.env.RESEND_API_KEY = '   '
      assert.equal(emailSendingEnabled(), false)
      delete process.env.RESEND_API_KEY
      process.env.SMTP_HOST = 'smtp.mail.yahoo.com'
      process.env.SMTP_USER = 'outza.promoter@yahoo.com'
      assert.equal(emailSendingEnabled(), false)
      delete process.env.SMTP_HOST
      delete process.env.SMTP_USER
      const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      assert.deepEqual(result, { ok: false, disabled: true, error: 'Email sending is turned off' })
      assert.equal(called, false)
    } finally {
      globalThis.fetch = originalFetch
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })

  test('sendEmail posts to the Resend API when the key is set and SMTP is not', async () => {
    const saved = saveEnv()
    const originalFetch = globalThis.fetch
    clearMailEnv()
    process.env.RESEND_API_KEY = 're_test_key'
    let captured: { url: string; init: RequestInit } | undefined
    globalThis.fetch = async (url, init) => {
      captured = { url: String(url), init: init ?? {} }
      return new Response(JSON.stringify({ id: 'email_123' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    try {
      assert.equal(emailSendingEnabled(), true)
      assert.equal(activeMailTransport(), 'resend')
      const result = await sendEmail({ to: ' person@example.com ', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' })
      assert.deepEqual(result, { ok: true })
      assert.ok(captured)
      assert.equal(captured.url, 'https://api.resend.com/emails')
      assert.equal(captured.url.includes('abacus'), false)
      assert.equal(captured.init.method, 'POST')
      const headers = captured.init.headers as Record<string, string>
      assert.equal(headers.Authorization, 'Bearer re_test_key')
      assert.equal(headers['Content-Type'], 'application/json')
      assert.equal(DEFAULT_FROM_EMAIL, 'VibePeep <onboarding@resend.dev>')
      assert.equal(/outza\.app|abacus/i.test(DEFAULT_FROM_EMAIL), false)
      assert.deepEqual(JSON.parse(String(captured.init.body)), {
        from: DEFAULT_FROM_EMAIL,
        to: ['person@example.com'],
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      })
    } finally {
      globalThis.fetch = originalFetch
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })

  test('RESEND_FROM_EMAIL overrides the default From address', async () => {
    const saved = saveEnv()
    const originalFetch = globalThis.fetch
    clearMailEnv()
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.RESEND_FROM_EMAIL = 'VibePeep <news@example.com>'
    let body: { from?: string } = {}
    globalThis.fetch = async (_url, init) => {
      body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ id: 'email_456' }), { status: 200 })
    }
    try {
      const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      assert.deepEqual(result, { ok: true })
      assert.equal(body.from, 'VibePeep <news@example.com>')
    } finally {
      globalThis.fetch = originalFetch
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })

  test('a Resend 403 from the onboarding sender is logged as a domain restriction', async () => {
    const saved = saveEnv()
    const originalFetch = globalThis.fetch
    const originalError = console.error
    const logs: unknown[][] = []
    clearMailEnv()
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.RESEND_FROM_EMAIL = 'VibePeep <onboarding@resend.dev>'
    console.error = (...args: unknown[]) => { logs.push(args) }
    globalThis.fetch = async () => new Response(JSON.stringify({
      message: 'You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain at resend.com/domains.',
    }), { status: 403 })
    try {
      const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      assert.equal(result.ok, false)
      assert.equal(result.restricted, true)
      assert.equal(result.error?.includes('@'), false)
      assert.match(result.error ?? '', /testing emails/)
      assert.match(publicEmailError(result.error), /RESEND_FROM_EMAIL/)
      assert.equal(publicEmailError(result.error).includes('@'), false)
      assert.equal(logs.some((line) => String(line).includes('verified sending domain')), true)
      assert.equal(logs.some((line) => String(line).includes('owner@example.com')), false)
    } finally {
      globalThis.fetch = originalFetch
      console.error = originalError
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })

  test('a Resend error is returned and does not count as disabled', async () => {
    const saved = saveEnv()
    const originalFetch = globalThis.fetch
    clearMailEnv()
    process.env.RESEND_API_KEY = 're_test_key'
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Invalid `from` field.' }), { status: 422 })
    try {
      const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      assert.deepEqual(result, { ok: false, error: 'Invalid `from` field.' })
    } finally {
      globalThis.fetch = originalFetch
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })

  test('SMTP on port 465 is secure and the From address is the Yahoo account', async () => {
    const saved = saveEnv()
    clearMailEnv()
    process.env.SMTP_HOST = 'smtp.mail.yahoo.com'
    process.env.SMTP_USER = 'outza.promoter@yahoo.com'
    process.env.SMTP_PASS = 'app-password'
    const sent: { from?: string; replyTo?: string; envelope?: { from: string } }[] = []
    setEmailTestAdapters({
      gapMs: 0,
      sentToday: async () => 0,
      sender: {
        sendMail: async (message) => { sent.push(message) },
      },
    })
    try {
      const options = smtpTransportOptions()
      assert.ok(options)
      assert.equal(options.host, 'smtp.mail.yahoo.com')
      assert.equal(options.port, 465)
      assert.equal(options.secure, true)
      assert.equal(options.auth.user, 'outza.promoter@yahoo.com')
      assert.equal(options.auth.pass, 'app-password')
      assert.equal(activeMailTransport(), 'smtp')
      assert.equal(smtpFromAddress(), 'VibePeep <outza.promoter@yahoo.com>')
      const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi' })
      assert.deepEqual(result, { ok: true })
      assert.equal(sent.length, 1)
      assert.equal(sent[0].from, 'VibePeep <outza.promoter@yahoo.com>')
      assert.equal(sent[0].replyTo, sent[0].from)
      assert.equal(sent[0].envelope?.from, 'outza.promoter@yahoo.com')
    } finally {
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })

  test('EMAIL_FROM keeps its display name and the address stays the Yahoo account', async () => {
    const saved = saveEnv()
    const originalError = console.error
    const logs: unknown[][] = []
    clearMailEnv()
    process.env.SMTP_HOST = 'smtp.mail.yahoo.com'
    process.env.SMTP_USER = 'outza.promoter@yahoo.com'
    process.env.SMTP_PASS = 'app-password'
    process.env.EMAIL_FROM = 'VibePeep <outza.promoter@yahoo.com>'
    console.error = (...args: unknown[]) => { logs.push(args) }
    const sent: { from?: string; replyTo?: string }[] = []
    setEmailTestAdapters({
      gapMs: 0,
      sentToday: async () => 0,
      sender: { sendMail: async (message) => { sent.push(message) } },
    })
    try {
      const matched = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      assert.equal(matched.ok, true)
      assert.equal(sent[0].from, 'VibePeep <outza.promoter@yahoo.com>')
      assert.equal(sent[0].replyTo, 'VibePeep <outza.promoter@yahoo.com>')
      process.env.EMAIL_FROM = 'News Desk <someone@example.com>'
      resetEmailTransportForTests()
      setEmailTestAdapters({
        gapMs: 0,
        sentToday: async () => 0,
        sender: { sendMail: async (message) => { sent.push(message) } },
      })
      const forced = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      assert.equal(forced.ok, true)
      assert.equal(sent[1].from, 'News Desk <outza.promoter@yahoo.com>')
      assert.equal(sent[1].replyTo, sent[1].from)
      assert.equal(logs.some((line) => String(line).includes('must equal the Yahoo account')), true)
    } finally {
      console.error = originalError
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })

  test('SMTP is preferred over Resend and an auth failure is explicit', async () => {
    const saved = saveEnv()
    const originalFetch = globalThis.fetch
    const originalError = console.error
    clearMailEnv()
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.SMTP_HOST = 'smtp.mail.yahoo.com'
    process.env.SMTP_PORT = '465'
    process.env.SMTP_USER = 'outza.promoter@yahoo.com'
    process.env.SMTP_PASS = 'wrong-password'
    let fetched = false
    globalThis.fetch = async () => {
      fetched = true
      return new Response('{}', { status: 200 })
    }
    console.error = () => {}
    setEmailTestAdapters({
      gapMs: 0,
      sentToday: async () => 0,
      sender: {
        sendMail: async () => {
          const err = new Error('Invalid login: 535 5.7.8 authentication failed') as Error & { code: string; responseCode: number }
          err.code = 'EAUTH'
          err.responseCode = 535
          throw err
        },
      },
    })
    try {
      assert.equal(smtpTransportOptions()?.secure, true)
      assert.equal(smtpTransportOptions()?.port, 465)
      const result = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      assert.equal(fetched, false)
      assert.equal(result.disabled, undefined)
      assert.deepEqual(result, { ok: false, error: 'SMTP auth failed' })
      assert.equal(publicEmailError(result.error), 'SMTP auth failed')
      assert.equal(publicEmailError(result.error).includes('@'), false)
    } finally {
      globalThis.fetch = originalFetch
      console.error = originalError
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })

  test('Yahoo daily cap stops further SMTP sends and is logged once', async () => {
    const saved = saveEnv()
    const originalError = console.error
    const logs: unknown[][] = []
    clearMailEnv()
    process.env.SMTP_HOST = 'smtp.mail.yahoo.com'
    process.env.SMTP_USER = 'outza.promoter@yahoo.com'
    process.env.SMTP_PASS = 'app-password'
    console.error = (...args: unknown[]) => { logs.push(args) }
    let calls = 0
    setEmailTestAdapters({
      gapMs: 0,
      sentToday: async () => YAHOO_DAILY_CAP,
      sender: { sendMail: async () => { calls += 1 } },
    })
    try {
      const first = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      const second = await sendEmail({ to: 'other@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      assert.equal(calls, 0)
      assert.equal(first.ok, false)
      assert.equal(first.error, 'Yahoo daily send cap reached')
      assert.equal(second.error, 'Yahoo daily send cap reached')
      assert.match(publicEmailError(first.error), /Yahoo daily send cap reached/)
      assert.equal(publicEmailError('HTTP 500').includes('500'), false)
      const capLogs = logs.filter((line) => String(line).includes('Yahoo daily send cap reached (500)'))
      assert.equal(capLogs.length, 1)
    } finally {
      console.error = originalError
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })

  test('a Yahoo quota rejection holds the rest of the day', async () => {
    const saved = saveEnv()
    const originalError = console.error
    clearMailEnv()
    process.env.SMTP_HOST = 'smtp.mail.yahoo.com'
    process.env.SMTP_USER = 'outza.promoter@yahoo.com'
    process.env.SMTP_PASS = 'app-password'
    console.error = () => {}
    let calls = 0
    setEmailTestAdapters({
      gapMs: 0,
      sentToday: async () => 1,
      sender: {
        sendMail: async () => {
          calls += 1
          throw new Error('550 daily sending quota exceeded')
        },
      },
    })
    try {
      const first = await sendEmail({ to: 'person@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      const second = await sendEmail({ to: 'other@example.com', subject: 'Hello', html: '<p>Hi</p>' })
      assert.equal(calls, 1)
      assert.equal(first.error, 'Yahoo daily send cap reached')
      assert.equal(second.error, 'Yahoo daily send cap reached')
    } finally {
      console.error = originalError
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })

  test('SMTP sends are sequential even when callers fire together', async () => {
    const saved = saveEnv()
    clearMailEnv()
    process.env.SMTP_HOST = 'smtp.mail.yahoo.com'
    process.env.SMTP_USER = 'outza.promoter@yahoo.com'
    process.env.SMTP_PASS = 'app-password'
    let active = 0
    let maxActive = 0
    const order: string[] = []
    setEmailTestAdapters({
      gapMs: 0,
      sentToday: async () => 0,
      sender: {
        sendMail: async (message) => {
          active += 1
          maxActive = Math.max(maxActive, active)
          order.push(message.to)
          await new Promise((resolve) => setTimeout(resolve, 20))
          active -= 1
        },
      },
    })
    try {
      const results = await Promise.all([
        sendEmail({ to: 'one@example.com', subject: 'Hello', html: '<p>Hi</p>' }),
        sendEmail({ to: 'two@example.com', subject: 'Hello', html: '<p>Hi</p>' }),
      ])
      assert.equal(results.every((result) => result.ok), true)
      assert.equal(maxActive, 1)
      assert.deepEqual(order, ['one@example.com', 'two@example.com'])
    } finally {
      resetEmailTransportForTests()
      restoreEnv(saved)
    }
  })
})
