import { defineConfig, devices } from '@playwright/test'

const ci = !!process.env.CI

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: ci ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://outza-outza.vercel.app',
    trace: 'retain-on-failure',
    ...(ci ? {} : { channel: 'chrome' }),
    ...devices['Desktop Chrome'],
  },
})
