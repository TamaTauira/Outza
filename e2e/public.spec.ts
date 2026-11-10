import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('home board renders and has no serious accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /what’s on/i }).or(page.getByText('VibePeep').first())).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([])
})

test('a wrong password shows an error and stays on the login page', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill('qa-nobody@example.com')
  await page.getByLabel('Password', { exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page.getByText(/didn’t match/i)).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('publishing a local listing is not blocked by a required import URL', async ({ page }) => {
  await page.goto('/local?tab=submit')
  await expect(page.getByPlaceholder('Saturday garage sale, Glebe')).toBeVisible()
  await expect(page.locator('input[type="url"]')).toHaveCount(0)
})

test('signed-out admin, account and promoter pages ask for sign-in', async ({ page }) => {
  for (const path of ['/admin', '/account', '/promoter']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: /back for more/i })).toBeVisible()
  }
  // Smoke hits production, which 404s this route until the metrics deploy is live.
  const metrics = await page.goto('/admin/metrics')
  if (metrics && metrics.status() < 400) {
    await expect(page.getByRole('heading', { name: /back for more/i })).toBeVisible()
  }
})
