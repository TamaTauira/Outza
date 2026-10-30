import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installDeploymentFetchPin, pinSameOriginFetch } from './deployment-fetch'

const origin = 'https://outza-outza.vercel.app'
const deploymentId = 'dpl_2XBS97LQyytPvo5H2vQMAnM2kz45'

function header(init: RequestInit | undefined, name = 'x-deployment-id') {
  return new Headers(init?.headers).get(name)
}

test('same-origin fetches gain the deployment id', () => {
  const relative = pinSameOriginFetch('/api/local?city=Sydney', undefined, { deploymentId, pageOrigin: origin })
  assert.equal(header(relative.init), deploymentId)
  assert.equal(relative.input, '/api/local?city=Sydney')

  const absolute = pinSameOriginFetch(`${origin}/api/local`, { method: 'GET' }, { deploymentId, pageOrigin: origin })
  assert.equal(header(absolute.init), deploymentId)
  assert.equal(absolute.init?.method, 'GET')
})

test('cross-origin fetches and an existing deployment id are left alone', () => {
  const cross = pinSameOriginFetch('https://example.com/api/local', undefined, { deploymentId, pageOrigin: origin })
  assert.equal(cross.init, undefined)

  const kept = pinSameOriginFetch('/api/local', { headers: { 'x-deployment-id': 'dpl_older' } }, { deploymentId, pageOrigin: origin })
  assert.equal(header(kept.init), 'dpl_older')
})

test('a missing deployment id does not add a header', () => {
  const pinned = pinSameOriginFetch('/api/local', { headers: { accept: 'application/json' } }, { deploymentId: null, pageOrigin: origin })
  assert.equal(header(pinned.init), null)
  assert.equal(header(pinned.init, 'accept'), 'application/json')
})

test('a Request keeps its method and gains the header', () => {
  const request = new Request(`${origin}/api/local`, { method: 'POST', headers: { 'content-type': 'application/json' } })
  const pinned = pinSameOriginFetch(request, undefined, { deploymentId, pageOrigin: origin })
  assert.equal(pinned.input, request)
  assert.equal(header(pinned.init), deploymentId)
  assert.equal(header(pinned.init, 'content-type'), 'application/json')
})

test('install is a no-op outside the browser', () => {
  assert.equal(installDeploymentFetchPin(), false)
})
