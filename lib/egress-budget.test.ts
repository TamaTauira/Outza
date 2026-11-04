import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { latestIso } from './board'
import { duplicateGroupKeys } from './quality-pass'
import { boardArgsFromSearch, BOARD_SELECT } from './board-feed'
import { estimateEgress, jsonBytes, routePayloadBytes, sampleListEvent } from './egress-budget'
import { PUBLIC_S_MAXAGE_SECONDS, PUBLIC_SWR_SECONDS, publicCacheHeaders } from './http-cache'
import { updateIsVerificationOnly } from './listing-touch'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('public list cache stays inside 5 to 15 minutes', () => {
  assert.ok(PUBLIC_S_MAXAGE_SECONDS >= 300 && PUBLIC_S_MAXAGE_SECONDS <= 900)
  assert.ok(PUBLIC_SWR_SECONDS > 0)
  assert.ok(PUBLIC_S_MAXAGE_SECONDS + PUBLIC_SWR_SECONDS <= 900)
  const headers = publicCacheHeaders()
  assert.match(headers['Cache-Control'], new RegExp(`s-maxage=${PUBLIC_S_MAXAGE_SECONDS}`))
  assert.match(headers['Cache-Control'], new RegExp(`stale-while-revalidate=${PUBLIC_SWR_SECONDS}`))
  assert.match(headers['Vercel-CDN-Cache-Control'], /s-maxage=600/)
})

test('list and map payloads omit descriptions and raw ingest blobs', () => {
  const keys = Object.keys(BOARD_SELECT)
  assert.equal(keys.includes('description'), false)
  assert.equal(keys.includes('raw'), false)
  const light = sampleListEvent(false)
  assert.equal('description' in light, false)
  assert.equal('raw' in light, false)
  const oneHeavy = jsonBytes(sampleListEvent(true))
  const oneLight = jsonBytes(sampleListEvent(false))
  assert.ok(oneLight < oneHeavy / 2)
  const mapHeavy = routePayloadBytes(300, true)
  const mapLight = routePayloadBytes(300, false)
  assert.ok(mapLight < mapHeavy / 2)
  const landing = read('./seo-server.ts')
  const select = landing.slice(landing.indexOf('const landingSelect = {'), landing.indexOf('} satisfies'))
  assert.equal(select.includes('description'), false)
  const guide = landing.slice(landing.indexOf('async function queryGuideRows'), landing.indexOf('prisma.localListing.findMany'))
  assert.equal(guide.includes('description: true'), false)
})

test('page size for the board and map stays capped', () => {
  const args = boardArgsFromSearch(new URLSearchParams({ limit: '5000' }))
  assert.equal(args.limit, 300)
  const map = read('../components/map-view.tsx')
  assert.match(map, /params\.set\('limit', '300'\)/)
})

test('a shared source URL is compared across cities and dates', () => {
  const day = new Date('2026-11-07T00:00:00.000Z')
  const otherDay = new Date('2026-11-08T00:00:00.000Z')
  const sydney = duplicateGroupKeys({
    city: 'Sydney', date: day,
    sourceUrl: 'https://www.frontiertouring.com/bensonboone/',
    ticketUrl: null, organiserUrl: null,
  })
  const melbourne = duplicateGroupKeys({
    city: 'Melbourne', date: otherDay,
    sourceUrl: 'https://www.frontiertouring.com/bensonboone',
    ticketUrl: null, organiserUrl: null,
  })
  const sydneyUrl = sydney.find((key) => key.startsWith('url:'))
  const melbourneUrl = melbourne.find((key) => key.startsWith('url:'))
  assert.ok(sydneyUrl)
  assert.equal(sydneyUrl, melbourneUrl)
  assert.equal(sydneyUrl!.includes('Sydney'), false)
  assert.equal(sydneyUrl!.includes('2026-11-07'), false)
  assert.notEqual(sydney.find((key) => key.startsWith('city:')), melbourne.find((key) => key.startsWith('city:')))
})

test('jobs no longer scan the old wide sets', () => {
  const audience = read('./audience-insights.ts')
  assert.equal(audience.includes('take: 20000'), false)
  assert.match(audience, /UNION/)
  const discover = read('./images/discover.ts')
  assert.equal(discover.includes('take: 3000'), false)
  assert.match(discover, /updatedAt: \{ gt: since \}/)
  const local = read('./local-import.ts')
  const firstSelect = local.slice(local.indexOf('const narrow = {'), local.indexOf('const loaded'))
  assert.equal(firstSelect.includes('description'), false)
  assert.match(local, /readJobCursor\('localImport'\)/)
  const quality = read('./quality-pass.ts')
  assert.match(quality, /readJobCursor\('quality'\)/)
  assert.match(quality, /duplicateCandidates/)
})

test('signed-in routes stay dynamic', () => {
  for (const path of ['../app/api/me/saved/route.ts', '../app/api/itinerary/locate/route.ts', '../app/api/auth/login/route.ts']) {
    assert.match(read(path), /force-dynamic/)
  }
  assert.doesNotMatch(read('../app/api/events/route.ts'), /force-dynamic/)
  assert.doesNotMatch(read('../app/api/featured/route.ts'), /force-dynamic/)
  assert.doesNotMatch(read('../app/api/events/stats/route.ts'), /force-dynamic/)
})

test('a verification-only refresh does not count as a content change', () => {
  const existing = { title: 'Market', price: 'Free', lastVerifiedAt: new Date('2026-11-01T00:00:00.000Z'), sources: ['eventbrite'] }
  assert.equal(updateIsVerificationOnly(existing, { title: 'Market', price: 'Free', lastVerifiedAt: new Date(), sources: ['eventbrite'] }), true)
  assert.equal(updateIsVerificationOnly(existing, { title: 'Market', price: '$10', lastVerifiedAt: new Date() }), false)
  assert.equal(updateIsVerificationOnly(existing, { secret: 'x' }), false)
})

test('the checked time follows whichever stamp is newer', () => {
  assert.equal(latestIso('2026-11-04T02:00:00.000Z', '2026-11-04T01:00:00.000Z'), '2026-11-04T02:00:00.000Z')
  assert.equal(latestIso(null, '2026-11-04T01:00:00.000Z'), '2026-11-04T01:00:00.000Z')
})

test('modeled daily egress and compute drop', () => {
  const estimate = estimateEgress()
  assert.ok(estimate.bytesBefore > 1.1e9 && estimate.bytesBefore < 1.4e9)
  assert.ok(estimate.bytesAfter < estimate.bytesBefore * 0.25)
  assert.ok(estimate.awakeHoursAfter < estimate.awakeHoursBefore)
  assert.ok(estimate.awakeHoursAfter <= 12)
  for (const route of estimate.routes) assert.ok(route.bytesAfter < route.bytesBefore)
  for (const job of estimate.jobs) assert.ok(job.rowsAfter < job.rowsBefore)
})
