import { expect, test } from '@playwright/test'

test('the map asks for events once and then sits still', async ({ page }) => {
  const hits: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/api/events?')) hits.push(req.url())
  })
  await page.goto('/map')
  await page.waitForTimeout(3500)
  // A city resolve may fetch twice. A render loop fetches on every clock tick.
  expect(hits.length, hits.join('\n')).toBeLessThanOrEqual(2)
  const loading = await page.getByText('Loading map…').count()
  expect(loading).toBe(0)
})
