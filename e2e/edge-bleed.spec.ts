import { expect, test } from '@playwright/test'

/**
 * A fixed backdrop-filter and an unclipped filter:blur paint a white fringe
 * past the right edge. html/body overflow-x does not stop that, so the check
 * only trusts a clipping ancestor (contain: paint, or a scroll/clip box).
 */
test.use({ viewport: { width: 390, height: 844 } })

const PATHS = ['/', '/local', '/discover'] as const

for (const path of PATHS) {
  test(`no horizontal bleed and no unclipped blur on ${path} at 390px`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('header').first()).toBeVisible()
    const report = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const sw = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0)
      const blurPx = (value: string) => {
        const match = value.match(/blur\(([\d.]+)px\)/)
        return match ? Number(match[1]) : 0
      }
      const leaks: string[] = []
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        const cs = getComputedStyle(el)
        const filter = cs.filter && cs.filter !== 'none' ? cs.filter : ''
        const backdrop = (cs.backdropFilter && cs.backdropFilter !== 'none' ? cs.backdropFilter : '')
          || ((cs as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter ?? '')
        if (!filter.includes('blur(') && !backdrop.includes('blur(')) continue
        const rad = Math.max(blurPx(filter), blurPx(backdrop))
        const rect = el.getBoundingClientRect()
        if (rect.width < 1 && rect.height < 1) continue
        let left = rect.left - rad
        let right = rect.right + rad
        let node: HTMLElement | null = el
        while (node && node !== document.body && node !== document.documentElement) {
          const parent = getComputedStyle(node)
          const contain = parent.contain || ''
          const clips = contain.includes('paint') || contain.includes('strict')
            || parent.overflowX === 'hidden' || parent.overflowX === 'clip'
            || parent.overflowX === 'auto' || parent.overflowX === 'scroll'
          if (clips) {
            const box = node.getBoundingClientRect()
            left = Math.max(left, box.left)
            right = Math.min(right, box.right)
          }
          node = node.parentElement
        }
        if (right > vw + 1 || left < -1) {
          const name = typeof el.className === 'string' ? el.className : el.tagName
          leaks.push(`${name.slice(0, 90)} ${Math.round(left)}..${Math.round(right)}`)
        }
      }
      return { vw, sw, leaks: leaks.slice(0, 8) }
    })
    expect(report.sw, JSON.stringify(report)).toBeLessThanOrEqual(report.vw + 1)
    expect(report.leaks, JSON.stringify(report)).toEqual([])
  })
}

test('appearance opens Light, Dark and Auto from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const trigger = page.getByRole('button', { name: 'Appearance' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitemradio', { name: 'Light' })).toBeVisible()
  await expect(menu.getByRole('menuitemradio', { name: 'Dark' })).toBeVisible()
  await expect(menu.getByRole('menuitemradio', { name: 'Auto' })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator('[role="menuitemradio"]:focus')).toHaveCount(1)
})

test('homepage hero does not name ticket brands', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const hero = page.locator('.vp-hero-card')
  await expect(hero).toContainText('Gigs, markets, shows and free things, picked for today. Every listing in one place.')
  await expect(hero).not.toContainText(/Ticketmaster|Moshtix|Oztix|Eventbrite|Answer it/)
})
