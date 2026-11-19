import { expect, test } from '@playwright/test'

/**
 * The walking mascot is gone. The still illustration stays on the 404
 * and on an empty saved list.
 */

const ORIGIN = process.env.MASCOT_COLLISION_URL
  || (process.env.CI ? 'https://outza-outza.vercel.app' : 'http://127.0.0.1:3457')

const PAGES = ['/', '/map', '/local', '/itinerary'] as const

test('the walking mascot is not on the main pages', async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  for (const path of PAGES) {
    await page.goto(ORIGIN + path, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForTimeout(800)
    await expect(page.locator('.vp-roam')).toHaveCount(0)
  }
  await context.close()
})

test('a missing page still shows the mascot illustration', async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await context.newPage()
  const res = await page.goto(ORIGIN + '/this-page-is-not-on', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('button', { name: /VibePeep the robot, looking around and waving/i })).toBeVisible()
  await expect(page.locator('.vp-roam')).toHaveCount(0)
  await context.close()
})
