import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LEGAL_ARCHIVE,
  LEGAL_DOCS,
  PROMOTER_TERMS_VERSION,
  checkoutTermsError,
  consumerAcceptance,
  missingAcceptance,
  promoterAcceptance,
  requiredAcceptance,
  signupTermsError,
} from './legal-docs'
import { PREVIOUS_LEGAL } from './legal-previous'

test('current consumer documents are terms, privacy and the disclaimer', () => {
  assert.deepEqual(consumerAcceptance().map((d) => d.doc), ['terms', 'privacy', 'disclaimer'])
  assert.equal(promoterAcceptance().version, PROMOTER_TERMS_VERSION)
})

test('a person still needs a document when the stored version is older', () => {
  const need = requiredAcceptance('PROMOTER')
  const have = consumerAcceptance().map((d) => ({ ...d }))
  const missing = missingAcceptance(have, need)
  assert.deepEqual(missing.map((d) => d.doc), ['promoter'])
  assert.deepEqual(missingAcceptance(need, need), [])
})

test('checkout and promoter signup reject a missing tick', () => {
  assert.equal(checkoutTermsError(undefined), 'Tick that you agree to the Promoter Terms before paying.')
  assert.equal(checkoutTermsError(false), 'Tick that you agree to the Promoter Terms before paying.')
  assert.equal(checkoutTermsError(true), null)
  assert.equal(signupTermsError('CONSUMER', false), null)
  assert.match(signupTermsError('PROMOTER', false) ?? '', /Promoter Terms/)
  assert.equal(signupTermsError('PROMOTER', true), null)
  assert.equal(checkoutTermsError('true'), 'Tick that you agree to the Promoter Terms before paying.')
})

test('the archive is the full text from before this version', () => {
  const terms = PREVIOUS_LEGAL['terms/2026-11-01']
  assert.equal(terms.sections.length, 6)
  assert.match(terms.sections[0].body.join(' '), /continuing to use VibePeep/)
  const disclaimer = PREVIOUS_LEGAL['disclaimer/2026-11-01']
  assert.equal(disclaimer.sections.length, 10)
  assert.match(disclaimer.intro, /By accessing or using/)
  assert.match(disclaimer.sections.find((s) => s.title.startsWith('7.'))?.body.join(' ') ?? '', /you agree to indemnify/)
  assert.ok(PREVIOUS_LEGAL['privacy/2026-11-01'].sections.length >= 8)
  for (const item of LEGAL_ARCHIVE) assert.ok(PREVIOUS_LEGAL[`${item.id}/${item.version}`])
  const previousRefunds = PREVIOUS_LEGAL['refunds/2026-11-01']
  assert.match(previousRefunds.sections.map((s) => s.body.join(' ')).join(' '), /We do not refund a campaign/)
  assert.match(previousRefunds.sections.map((s) => s.body.join(' ')).join(' '), /The fee is not refunded/)
  assert.equal(LEGAL_DOCS.refunds.path, '/refunds')
  for (const doc of Object.values(LEGAL_DOCS)) {
    assert.equal(doc.version, '2026-11-18')
    assert.match(doc.updated, /18 November 2026/)
  }
})
