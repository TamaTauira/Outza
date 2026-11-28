import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMAIL_BUTTON, emailButton, emailDocument, emailMetaLine } from './email-brand'

function channel(hex: string, index: number) {
  const n = parseInt(hex.slice(1), 16)
  const value = (n >> (16 - index * 8)) & 255
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function contrast(a: string, b: string) {
  const lum = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2)
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('the shared email pill is orange ink on orange, 44px tall', () => {
  assert.equal(EMAIL_BUTTON, '#FF7A35')
  const html = emailButton('https://vibepeep.example/verify', 'Confirm email')
  assert.match(html, /strokecolor="#FF7A35"/)
  assert.match(html, /fillcolor="#FF7A35"/)
  assert.match(html, /height:44px;v-text-anchor:middle/)
  assert.match(html, /height="44"/)
  assert.match(html, /color:#1A1408/)
  assert.doesNotMatch(html, /#141414/)
  assert.doesNotMatch(html, /height:40px/)
  const pad = /padding:(\d+)px 22px/.exec(html)
  const line = /line-height:(\d+)px/.exec(html)
  assert.ok(pad && line)
  assert.equal(Number(pad[1]) + Number(line[1]) + Number(pad[1]), 44)
  assert.ok(contrast('#1A1408', EMAIL_BUTTON) >= 7)
})

test('the email meta line names the board, not the stored city', () => {
  assert.equal(emailMetaLine('Sydney', 'THIS WEEK'), 'SYDNEY & THE NSW COAST · THIS WEEK')
  assert.equal(emailMetaLine('Melbourne', 'THIS WEEK'), 'MELBOURNE · THIS WEEK')
})

test('dark-mode shell rules keep the pill orange', () => {
  const html = emailDocument({
    title: 'Confirm your email',
    rows: `<tr><td>${emailButton('https://vibepeep.example/reset', 'Choose a new password')}</td></tr>`,
  })
  const darkStart = html.indexOf('@media (prefers-color-scheme: dark)')
  const darkEnd = html.indexOf('[data-ogsc]')
  const dark = html.slice(darkStart, darkEnd)
  assert.match(dark, /\.email-btn,\.email-btn a\{background-color:#FF7A35!important;color:#1A1408!important\}/)
  assert.doesNotMatch(dark, /\.email-btn[^}]*#(?:141414|101010|0c0f0e|171c19)/i)
  assert.match(html, /\[data-ogsc\] \.email-btn,\[data-ogsc\] \.email-btn a\{background-color:#FF7A35!important;color:#1A1408!important\}/)
  assert.match(html, /\[data-ogsb\] \.email-btn,\[data-ogsb\] \.email-btn a\{background-color:#FF7A35!important;color:#1A1408!important\}/)
})
