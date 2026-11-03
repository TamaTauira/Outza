import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { POST } from '../app/api/signup/route'
import { ProfileFields } from '../components/profile-fields'
import {
  aboutYouStatus, ageBandForYear, conservativeAge, includeInAudience, parseBirthYear, POSTCODE_ERROR, profileDigits,
  under16GeoBlock, UNDER16_BLOCK_MESSAGE, visibleAboutErrors,
} from './profile-shared'

const OCT = new Date('2026-10-30T02:00:00Z')
const DEC31 = new Date('2026-12-30T14:00:00Z')

test('conservative age is the youngest birthday in that year, Sydney time', () => {
  assert.equal(conservativeAge(2010, OCT), 15)
  assert.equal(conservativeAge(2008, OCT), 17)
  assert.equal(conservativeAge(2007, OCT), 18)
  assert.equal(conservativeAge(2010, DEC31), 16)
  assert.equal(ageBandForYear(2001, OCT), '18–24')
  assert.equal(ageBandForYear(2000, OCT), '25–34')
})

test('year of birth keeps 13+ and drops a full date', () => {
  assert.match(parseBirthYear('2013', OCT).error ?? '', /13 or older/)
  assert.equal(parseBirthYear('2012', OCT).year, 2012)
  assert.match(parseBirthYear('1990-01-01', OCT).error ?? '', /year/)
  assert.equal(includeInAudience(2010, OCT), false)
  assert.equal(includeInAudience(2007, OCT), true)
  assert.equal(includeInAudience(null, OCT), true)
})

test('EU, EEA and UK under-16s are blocked from the country header only', () => {
  assert.equal(under16GeoBlock('DE', 2011, OCT), UNDER16_BLOCK_MESSAGE)
  assert.equal(under16GeoBlock('gb', 2011, OCT), UNDER16_BLOCK_MESSAGE)
  assert.equal(under16GeoBlock('NO', 2011, OCT), UNDER16_BLOCK_MESSAGE)
  assert.equal(under16GeoBlock('DE', 2009, OCT), null)
  assert.equal(under16GeoBlock('AU', 2011, OCT), null)
  assert.equal(under16GeoBlock(null, 2011, OCT), null)
  assert.equal(under16GeoBlock('FR', null, OCT), null)
})

test('Save Details follows the age rule, not a dirty check or a string/number mismatch', () => {
  assert.equal(profileDigits('1987'), '1987')
  assert.equal(profileDigits('year 1987'), '1987')
  assert.equal(profileDigits('20 33'), '2033')
  assert.equal(profileDigits('12345'), '1234')

  const ready = aboutYouStatus('1987', '2033', { now: OCT })
  assert.equal(ready.canSave, true)
  assert.equal(ready.year, 1987)
  assert.equal(ready.yearError, undefined)
  assert.equal(ready.postcodeError, undefined)
  // A number must enable the same way a string does.
  assert.equal(aboutYouStatus(1987, '2033', { now: OCT }).canSave, true)
  assert.equal(aboutYouStatus('1987', '', { now: OCT }).canSave, true)
  assert.equal(aboutYouStatus('1987', '   ', { now: OCT }).canSave, true)
  assert.equal(visibleAboutErrors('1987', '2033', { now: OCT, yearTouched: true }).yearError, undefined)
  assert.equal(visibleAboutErrors('1987', '2033', { now: OCT }).postcodeError, undefined)

  const young = aboutYouStatus('2013', '', { now: OCT })
  assert.equal(young.canSave, false)
  assert.match(young.yearError ?? '', /13 or older/)
  assert.match(visibleAboutErrors('2013', '2033', { now: OCT }).yearError ?? '', /13 or older/)
  assert.equal(aboutYouStatus('2012', '', { now: OCT }).canSave, true)

  assert.match(aboutYouStatus('1900', '', { now: OCT }).yearError ?? '', /check the year/)
  assert.equal(visibleAboutErrors('198', '', { now: OCT }).yearError, undefined)
  assert.match(visibleAboutErrors('', '', { now: OCT, yearTouched: true }).yearError ?? '', /year you were born/)

  const partialPc = aboutYouStatus('1987', '203', { now: OCT })
  assert.equal(partialPc.canSave, false)
  assert.equal(partialPc.postcodeError, POSTCODE_ERROR)
  assert.equal(visibleAboutErrors('1987', '203', { now: OCT }).postcodeError, POSTCODE_ERROR)
  assert.equal(visibleAboutErrors('1987', '', { now: OCT }).postcodeError, undefined)

  const saving = aboutYouStatus('1987', '2033', { saving: true, now: OCT })
  assert.equal(saving.canSave, false)
  assert.equal(saving.yearError, undefined)

  assert.equal(aboutYouStatus('', '2033', { yearRequired: false, now: OCT }).canSave, true)
  assert.equal(aboutYouStatus('2013', '', { yearRequired: false, now: OCT }).canSave, false)
})

test('a valid year clears the red field state and an invalid one says why', () => {
  const valid = renderToStaticMarkup(createElement(ProfileFields, {
    birthYear: '1987', homePostcode: '2033', onBirthYear: () => {}, onPostcode: () => {}, idPrefix: 'acct', showNote: false,
  }))
  assert.match(valid, /value="1987"/)
  assert.match(valid, /value="2033"/)
  assert.match(valid, /aria-invalid="false"/)
  assert.doesNotMatch(valid, /border-destructive/)
  assert.doesNotMatch(valid, /role="alert"/)
  assert.match(valid, /inputMode="numeric"/)
  assert.match(valid, /autoComplete="bday-year"/)
  assert.match(valid, /autoComplete="postal-code"/)

  const invalid = renderToStaticMarkup(createElement(ProfileFields, {
    birthYear: '2013', homePostcode: '203', onBirthYear: () => {}, onPostcode: () => {}, idPrefix: 'acct', showNote: false,
    yearError: 'You need to be 13 or older to use VibePeep', postcodeError: 'Postcodes are 4 digits',
  }))
  assert.match(invalid, /aria-invalid="true"/)
  assert.match(invalid, /border-destructive/)
  assert.match(invalid, /You need to be 13 or older to use VibePeep/)
  assert.match(invalid, /Postcodes are 4 digits/)
  assert.doesNotMatch(invalid, /focus-visible:ring-foreground/)
})

test('account About you enables Save Details from validity and still writes the profile', () => {
  const account = readFileSync(new URL('../app/account/account-client.tsx', import.meta.url), 'utf8')
  const fields = readFileSync(new URL('../components/profile-fields.tsx', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/me/route.ts', import.meta.url), 'utf8')
  assert.match(account, /disabled=\{!about\.canSave\}/)
  assert.doesNotMatch(account, /year === \(me\.birthYear/)
  assert.match(account, /body\.birthYear = check\.year/)
  assert.match(account, /method: 'PATCH'/)
  assert.match(account, /fetch\('\/api\/me'\)/)
  assert.match(account, /Details saved/)
  assert.match(fields, /onInput=\{sync\}/)
  assert.match(fields, /inputMode="numeric"/)
  assert.match(fields, /autoComplete="bday-year"/)
  assert.match(fields, /autoComplete="postal-code"/)
  assert.match(fields, /aria-invalid=\{error \? true : false\}/)
  assert.match(fields, /variant=\{error \? 'error' : 'default'\}/)
  assert.match(route, /data\.birthYear = p\.year/)
  assert.match(route, /data\.homePostcode = pc \|\| null/)
  assert.match(route, /prisma\.user\.update/)
})

test('signup API blocks an EU under-16 before creating an account', async () => {
  const year = String(new Date().getFullYear() - 14)
  const res = await POST(new NextRequest('http://localhost/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-ip-country': 'DE' },
    body: JSON.stringify({ email: 'young@example.com', password: 'secret1', birthYear: year }),
  }))
  assert.equal(res.status, 403)
  const body = await res.json()
  assert.equal(body.error, UNDER16_BLOCK_MESSAGE)
})
