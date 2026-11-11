import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const file = process.env.QA_ACCOUNTS_FILE
const accounts = file ? JSON.parse(readFileSync(file, 'utf8')).accounts as { key: string; email: string; password: string }[] : []
const byKey = Object.fromEntries(accounts.map((a) => [a.key, a]))

async function signIn(page: import('@playwright/test').Page, key: string) {
  const account = byKey[key]
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 })
}

test.beforeEach(() => {
  test.skip(!file, 'QA account file is only on the machine that created the accounts')
})

test('promoter dashboard opens for the North organiser', async ({ page }) => {
  await signIn(page, 'promoter-1')
  await page.goto('/promoter')
  await expect(page.getByText('Promoter dashboard').first()).toBeVisible()
  await expect(page.getByText('QA fixture Organiser North').first()).toBeVisible()
})

test('admin dashboard opens for the synthetic admin', async ({ page }) => {
  await signIn(page, 'admin-1')
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()
})

test('venue dashboard opens for Hall North and not as a signed-out page', async ({ page }) => {
  await signIn(page, 'venue-1')
  await page.goto('/venue/qa-venue-north')
  await expect(page.getByText('QA fixture Hall North').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /back for more/i })).toHaveCount(0)
})

test('consumer account page opens', async ({ page }) => {
  await signIn(page, 'consumer-1')
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Your account & inbox' })).toBeVisible()
})
