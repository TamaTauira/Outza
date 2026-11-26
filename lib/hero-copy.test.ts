import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { COPY } from './copy'

const BRANDS = /Ticketmaster|Moshtix|Oztix|Eventbrite/

test('the homepage hero subtext lives in one place and does not name ticket brands', () => {
  assert.equal(COPY.homeHero, 'Gigs, markets, shows and free things, picked for today. Every listing in one place.')
  assert.doesNotMatch(COPY.homeHero, BRANDS)
  assert.doesNotMatch(COPY.homeHero, /calling/i)
  const home = readFileSync(new URL('../components/home-client.tsx', import.meta.url), 'utf8')
  assert.match(home, /COPY\.homeHero/)
  assert.doesNotMatch(home, BRANDS)
  assert.doesNotMatch(home, /Answer it/)
})

test('marketing blocks do not repeat the ticket-brand list', () => {
  const footer = readFileSync(new URL('./site-links.ts', import.meta.url), 'utf8')
  const promoters = readFileSync(new URL('../app/promoters/marketing.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(footer, BRANDS)
  assert.doesNotMatch(promoters, BRANDS)
})
