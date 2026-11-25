import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, test } from 'node:test'
import type { S3Client } from '@aws-sdk/client-s3'
import { createS3Client, r2Endpoint, storageApplyTarget } from './aws-config'
import { publicUrl, storagePath } from './s3'

const require = createRequire(import.meta.url)

const KEYS = [
  'AWS_REGION',
  'AWS_BUCKET_NAME',
  'AWS_FOLDER_PREFIX',
  'AWS_ENDPOINT_URL_S3',
  'S3_ENDPOINT',
  'S3_PUBLIC_BASE_URL',
] as const

type ClientView = {
  config: {
    region: () => Promise<string>
    forcePathStyle: boolean
    isCustomEndpoint: boolean
    endpoint?: () => Promise<{ hostname?: string }>
  }
  destroy(): void
}

function snapshot() {
  return new Map(KEYS.map((key) => [key, process.env[key]]))
}

function restore(saved: Map<string, string | undefined>) {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function useEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key]
  for (const [key, value] of Object.entries(values)) process.env[key] = value
}

async function clientOptions(client: S3Client) {
  const view = client as unknown as ClientView
  try {
    const endpoint = view.config.endpoint ? await view.config.endpoint() : undefined
    return {
      region: await view.config.region(),
      forcePathStyle: view.config.forcePathStyle,
      isCustomEndpoint: view.config.isCustomEndpoint,
      hostname: endpoint?.hostname,
    }
  } finally {
    view.destroy()
  }
}

describe('object storage', { concurrency: 1 }, () => {
  test('next/image allows public r2.dev hosts', () => {
    const config = require('../next.config.js') as { images: { remotePatterns: { protocol?: string; hostname?: string }[] } }
    assert.ok(config.images.remotePatterns.some((pattern) => pattern.protocol === 'https' && pattern.hostname === '**.r2.dev'))
  })

  test('publicUrl keeps the virtual-hosted amazonaws form when S3_PUBLIC_BASE_URL is unset', () => {
    const saved = snapshot()
    try {
      useEnv({ AWS_BUCKET_NAME: 'media-bucket', AWS_REGION: 'ap-southeast-2', AWS_ENDPOINT_URL_S3: 'https://acct.r2.cloudflarestorage.com' })
      assert.equal(
        publicUrl('public/event display/w480.webp'),
        'https://media-bucket.s3.ap-southeast-2.amazonaws.com/public/event%20display/w480.webp',
      )
      delete process.env.AWS_REGION
      assert.equal(publicUrl('public/a.jpg'), 'https://media-bucket.s3.us-west-2.amazonaws.com/public/a.jpg')
    } finally {
      restore(saved)
    }
  })

  test('publicUrl uses S3_PUBLIC_BASE_URL without a trailing slash', () => {
    const saved = snapshot()
    try {
      useEnv({
        AWS_BUCKET_NAME: 'media-bucket',
        AWS_REGION: 'us-west-2',
        S3_PUBLIC_BASE_URL: 'https://pub-abc.r2.dev/',
      })
      assert.equal(publicUrl('public/event display/w480.webp'), 'https://pub-abc.r2.dev/public/event%20display/w480.webp')
      process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com/media///'
      assert.equal(publicUrl('folder/a+b.jpg'), 'https://cdn.example.com/media/folder/a%2Bb.jpg')
      process.env.S3_PUBLIC_BASE_URL = '   '
      assert.equal(publicUrl('folder/a.jpg'), 'https://media-bucket.s3.us-west-2.amazonaws.com/folder/a.jpg')
    } finally {
      restore(saved)
    }
  })

  test('storagePath ignores the public base and still prepends the folder prefix', () => {
    const saved = snapshot()
    try {
      useEnv({ AWS_FOLDER_PREFIX: 'events/', S3_PUBLIC_BASE_URL: 'https://pub-abc.r2.dev' })
      assert.equal(storagePath('posters/a.webp'), 'events/public/posters/a.webp')
      assert.equal(storagePath('posters/a.webp', false), 'events/posters/a.webp')
    } finally {
      restore(saved)
    }
  })

  test('createS3Client uses the AWS region and no custom endpoint when the endpoint vars are unset', async () => {
    const saved = snapshot()
    try {
      useEnv({ AWS_REGION: 'ap-southeast-2' })
      assert.equal(r2Endpoint(), undefined)
      assert.deepEqual(await clientOptions(createS3Client()), {
        region: 'ap-southeast-2',
        forcePathStyle: false,
        isCustomEndpoint: false,
        hostname: undefined,
      })
      delete process.env.AWS_REGION
      assert.deepEqual(await clientOptions(createS3Client()), {
        region: 'auto',
        forcePathStyle: false,
        isCustomEndpoint: false,
        hostname: undefined,
      })
    } finally {
      restore(saved)
    }
  })

  test('createS3Client points at AWS_ENDPOINT_URL_S3 with path-style addressing', async () => {
    const saved = snapshot()
    try {
      useEnv({ AWS_ENDPOINT_URL_S3: 'https://acct.r2.cloudflarestorage.com' })
      assert.equal(r2Endpoint(), 'https://acct.r2.cloudflarestorage.com')
      assert.deepEqual(await clientOptions(createS3Client()), {
        region: 'auto',
        forcePathStyle: true,
        isCustomEndpoint: true,
        hostname: 'acct.r2.cloudflarestorage.com',
      })
      process.env.AWS_REGION = 'us-east-1'
      process.env.S3_ENDPOINT = 'https://ignored.example'
      const withRegion = await clientOptions(createS3Client())
      assert.equal(withRegion.region, 'us-east-1')
      assert.equal(withRegion.forcePathStyle, true)
      assert.equal(withRegion.hostname, 'acct.r2.cloudflarestorage.com')
    } finally {
      restore(saved)
    }
  })

  test('createS3Client falls back to S3_ENDPOINT when AWS_ENDPOINT_URL_S3 is unset', async () => {
    const saved = snapshot()
    try {
      useEnv({ S3_ENDPOINT: 'http://127.0.0.1:9000', AWS_REGION: 'auto' })
      assert.equal(r2Endpoint(), 'http://127.0.0.1:9000')
      assert.deepEqual(await clientOptions(createS3Client()), {
        region: 'auto',
        forcePathStyle: true,
        isCustomEndpoint: true,
        hostname: '127.0.0.1',
      })
      process.env.AWS_ENDPOINT_URL_S3 = ''
      assert.equal(r2Endpoint(), 'http://127.0.0.1:9000')
    } finally {
      restore(saved)
    }
  })

  test('storageApplyTarget requires a bucket plus a region or an endpoint, and logs the host only', () => {
    const saved = snapshot()
    try {
      useEnv({})
      assert.equal(storageApplyTarget().ok, false)
      useEnv({ AWS_REGION: 'ap-southeast-2' })
      assert.equal(storageApplyTarget().ok, false)
      useEnv({ AWS_BUCKET_NAME: 'media-bucket', AWS_REGION: 'ap-southeast-2' })
      assert.deepEqual(storageApplyTarget(), {
        ok: true,
        bucket: 'media-bucket',
        endpointHost: 'media-bucket.s3.ap-southeast-2.amazonaws.com',
      })
      useEnv({ AWS_BUCKET_NAME: 'media-bucket', AWS_ENDPOINT_URL_S3: 'https://acct.r2.cloudflarestorage.com' })
      assert.deepEqual(storageApplyTarget(), {
        ok: true,
        bucket: 'media-bucket',
        endpointHost: 'acct.r2.cloudflarestorage.com',
      })
      const secret = 'wJalrXUtnFEMI'
      useEnv({
        AWS_BUCKET_NAME: 'media-bucket',
        AWS_ENDPOINT_URL_S3: `https://AKIAEXAMPLE:${secret}@acct.r2.cloudflarestorage.com/private?sig=${secret}`,
      })
      const leaked = storageApplyTarget()
      assert.equal(leaked.ok, true)
      const printed = JSON.stringify(leaked)
      assert.equal(printed.includes('AKIAEXAMPLE'), false)
      assert.equal(printed.includes(secret), false)
      assert.equal(printed.includes('private'), false)
      if (leaked.ok) assert.equal(leaked.endpointHost, 'acct.r2.cloudflarestorage.com')
      useEnv({ AWS_BUCKET_NAME: 'media-bucket', AWS_ENDPOINT_URL_S3: `not-a-url ${secret}` })
      const invalid = storageApplyTarget()
      assert.equal(invalid.ok, false)
      assert.equal(JSON.stringify(invalid).includes(secret), false)
    } finally {
      restore(saved)
    }
  })
})
