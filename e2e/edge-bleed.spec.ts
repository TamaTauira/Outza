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

test('raised Ask face is fully visible above the bar at 390px', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const face = page.locator('.vp-ask-face')
  await expect(face).toBeVisible()
  const report = await face.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const nav = el.closest('.vp-bottom-nav')
    const inner = el.closest('.vp-bottom-nav-inner')
    const navBox = nav?.getBoundingClientRect()
    const innerTop = inner?.getBoundingClientRect().top ?? null
    const navStyle = nav ? getComputedStyle(nav) : null
    const clips: string[] = []
    let node: HTMLElement | null = el.parentElement
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node)
      const contain = cs.contain || ''
      const clipsY = contain.includes('paint') || contain.includes('strict')
        || cs.overflowY === 'hidden' || cs.overflowY === 'clip'
        || cs.overflowY === 'auto' || cs.overflowY === 'scroll'
      if (clipsY) {
        const box = node.getBoundingClientRect()
        if (rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5 || rect.left < box.left - 0.5 || rect.right > box.right + 0.5) {
          const name = typeof node.className === 'string' && node.className ? node.className : node.tagName
          clips.push(`${name.slice(0, 80)}`)
        }
      }
      node = node.parentElement
    }
    const inside = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)
      return !!hit && (hit === el || el.contains(hit) || !!hit.closest('.vp-ask'))
    }
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const inset = Math.min(rect.width, rect.height) * 0.18
    return {
      top: rect.top,
      height: rect.height,
      width: rect.width,
      navTop: navBox?.top ?? null,
      innerTop,
      raised: innerTop != null ? rect.top < innerTop - 1 : false,
      insideNav: navBox ? rect.top >= navBox.top - 0.5 && rect.bottom <= navBox.bottom + 0.5 : false,
      overflowX: navStyle?.overflowX ?? '',
      overflowY: navStyle?.overflowY ?? '',
      contain: navStyle?.contain ?? '',
      clips,
      points: {
        top: inside(cx, rect.top + inset),
        bottom: inside(cx, rect.bottom - inset),
        left: inside(rect.left + inset, cy),
        right: inside(rect.right - inset, cy),
        center: inside(cx, cy),
      },
    }
  })
  expect(report.clips, JSON.stringify(report)).toEqual([])
  expect(report.raised, JSON.stringify(report)).toBe(true)
  expect(report.insideNav, JSON.stringify(report)).toBe(true)
  expect(report.overflowY, JSON.stringify(report)).toBe('visible')
  expect(report.overflowX, JSON.stringify(report)).toBe('clip')
  expect(report.contain, JSON.stringify(report)).not.toContain('paint')
  expect(report.top, JSON.stringify(report)).toBeGreaterThanOrEqual(0)
  expect(report.height, JSON.stringify(report)).toBeGreaterThan(32)
  expect(Math.abs(report.width - report.height), JSON.stringify(report)).toBeLessThan(1)
  expect(report.points, JSON.stringify(report)).toEqual({ top: true, bottom: true, left: true, right: true, center: true })
})

test('homepage hero does not name ticket brands', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const hero = page.locator('.vp-hero-card')
  await expect(hero).toContainText('Gigs, markets, shows and free things, picked for today. Every listing in one place.')
  await expect(hero).not.toContainText(/Ticketmaster|Moshtix|Oztix|Eventbrite|Answer it/)
})
