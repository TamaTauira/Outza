import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gatewayModel, llmConfigured } from './llm'

test('gateway model is a provider/model id and can be overridden', () => {
  const prev = process.env.AI_GATEWAY_MODEL
  delete process.env.AI_GATEWAY_MODEL
  assert.match(gatewayModel(), /^[^/]+\/.+$/)
  process.env.AI_GATEWAY_MODEL = 'openai/gpt-5.4-mini'
  assert.equal(gatewayModel(), 'openai/gpt-5.4-mini')
  if (prev === undefined) delete process.env.AI_GATEWAY_MODEL
  else process.env.AI_GATEWAY_MODEL = prev
})

test('llm calls need an AI Gateway key or a Vercel OIDC token', () => {
  const key = process.env.AI_GATEWAY_API_KEY
  const oidc = process.env.VERCEL_OIDC_TOKEN
  delete process.env.AI_GATEWAY_API_KEY
  delete process.env.VERCEL_OIDC_TOKEN
  assert.equal(llmConfigured(), false)
  process.env.VERCEL_OIDC_TOKEN = 'oidc'
  assert.equal(llmConfigured(), true)
  delete process.env.VERCEL_OIDC_TOKEN
  process.env.AI_GATEWAY_API_KEY = 'key'
  assert.equal(llmConfigured(), true)
  if (key === undefined) delete process.env.AI_GATEWAY_API_KEY
  else process.env.AI_GATEWAY_API_KEY = key
  if (oidc === undefined) delete process.env.VERCEL_OIDC_TOKEN
  else process.env.VERCEL_OIDC_TOKEN = oidc
})
