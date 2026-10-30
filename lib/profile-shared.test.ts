import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server'
import { POST } from '../app/api/signup/route'
import {
  ageBandForYear, conservativeAge, includeInAudience, parseBirthYear, under16GeoBlock, UNDER16_BLOCK_MESSAGE,
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
