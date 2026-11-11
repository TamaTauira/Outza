import { expect, test, type Browser, type Page } from '@playwright/test'
import pw from 'playwright'

/**
 * The close button and the speech bubble are laid out together. This drives
 * the real pages and checks their boxes never meet, at every width he is
 * shown on.
 */

const ORIGIN = process.env.MASCOT_COLLISION_URL
  || (process.env.CI ? 'https://outza-outza.vercel.app' : 'http://127.0.0.1:3457')

test.setTimeout(600_000)

const PAGES = [
  ['home', '/'],
  ['map', '/map'],
  ['local', '/local'],
  ['event', '/events/fun-brain-training-cmw02482a004pl608sd9ezpzy'],
] as const

const LINES = [
  'Stop it. You’ll make me blush.',
  'Super party mode. Everyone’s invited.',
  'Caught a crush. Hearts everywhere.',
  'Love-struck. Can’t even hide it.',
  'Full-spectrum kind of night.',
  'Achoo! Didn’t see that coming.',
  'Still looking? Good. So am I.',
  'I can wait. The night won’t.',
  'Oi… you forgetting me?',
  'That’s a yes from me.',
  'Peekaboo. Found your night.',
  'Boing!',
  'Bottom of the page. Bonza.',
  'Didn’t bounce that hard.',
  'Hehe… something’s on tonight 👀',
  'G’day! Over here.',
  'Little dance. Notes and all.',
  'Take a peep!',
]

const REACTIONS: Array<[string, string]> = [
  ['blush', 'Stop it. You’ll make me blush.'],
  ['hearts', 'Caught a crush. Hearts everywhere.'],
  ['confetti', 'That’s a yes from me.'],
  ['party', 'Super party mode. Everyone’s invited.'],
  ['wave', 'G’day! Over here.'],
  ['sneeze', 'Achoo! Didn’t see that coming.'],
]

const DANCES = ['snake', 'robot', 'disco-point', 'ymca', 'floss', 'chicken']

const WIDTHS = [320, 360, 390, 430, 1440]

type Problem = { where: string; problems: string[] }

async function pinAndCheck(page: Page, x: number, y: number, where: string): Promise<Problem[]> {
  return page.evaluate(async ({ x, y, where, lines, reactions, dances }) => {
    const root = document.querySelector<HTMLElement>('.vp-roam')
    if (!root) return [{ where, problems: ['mascot missing'] }]
    root.style.setProperty('transform', `translate3d(${x}px, ${y}px, 0)`, 'important')
    const bubble = root.querySelector<HTMLElement>('.vp-bubble')!
    const hit = root.querySelector<HTMLElement>('.vp-hit')!
    const problems: Problem[] = []

    const sep = (a: DOMRect, b: DOMRect, pad: number) =>
      a.right + pad <= b.left || b.right + pad <= a.left || a.bottom + pad <= b.top || b.bottom + pad <= a.top

    const check = async (label: string) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))))
      const rig = root.querySelector('.vp-rig')!.getBoundingClientRect()
      const bub = bubble.getBoundingClientRect()
      const close = root.querySelector<HTMLElement>('.vp-buddy-min')!
      const xVis = getComputedStyle(close).visibility
      const xBox = close.getBoundingClientRect()
      const found: string[] = []
      const controls = [
        ...document.querySelectorAll<HTMLElement>('.vp-site-header button, .vp-site-header a'),
      ].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 8 && r.height > 8)
      const navEl = document.querySelector<HTMLElement>('.vp-bottom-nav')
      const nav = navEl && navEl.getBoundingClientRect().top < innerHeight - 4 ? navEl.getBoundingClientRect() : null
      const onScreen = (r: DOMRect) => r.left >= 4 && r.top >= 4 && r.right <= innerWidth - 4 && r.bottom <= innerHeight - 4
      if (bubble.textContent && hit.getAttribute('data-line') === '1' && parseFloat(getComputedStyle(bubble).opacity) > 0.9) {
        if (!onScreen(bub)) found.push('bubble off screen')
        if (!sep(bub, rig, 2)) found.push('bubble overlaps mascot')
        for (const control of controls) {
          if (!sep(bub, control, 8)) found.push('bubble overlaps a header control')
        }
        if (nav && !sep(bub, nav, 8)) found.push('bubble overlaps the bottom nav')
        const range = document.createRange()
        range.selectNodeContents(bubble)
        const text = range.getBoundingClientRect()
        const cs = getComputedStyle(bubble)
        const padT = parseFloat(cs.paddingTop)
        const padB = parseFloat(cs.paddingBottom)
        if (text.width > 0 && (text.top < bub.top + padT - 2 || text.bottom > bub.bottom - padB + 2 || text.left < bub.left + 2 || text.right > bub.right - 2)) {
          found.push('bubble text clipped')
        }
        if (bub.right <= rig.left + 1) {
          const after = getComputedStyle(bubble, '::after')
          if (!String(after.right).startsWith('-')) found.push('tail does not point right at him')
        } else if (bub.bottom <= rig.top + 1 && bub.left < rig.right && bub.right > rig.left) {
          const after = getComputedStyle(bubble, '::after')
          if (parseFloat(after.bottom) > -1) found.push('tail does not point down at him')
        }
        if (xVis !== 'hidden') {
          if (!sep(xBox, bub, 8)) found.push('X overlaps the bubble')
          if (!sep(xBox, rig, 2)) found.push('X overlaps the mascot')
          if (!onScreen(xBox)) found.push('X off screen')
          for (const control of controls) {
            if (!sep(xBox, control, 8)) found.push('X overlaps a header control')
          }
          if (nav && !sep(xBox, nav, 8)) found.push('X overlaps the bottom nav')
        }
      }
      if (found.length) problems.push({ where: `${where} ${label} @${Math.round(rig.left)},${Math.round(rig.top)}`, problems: found })
    }

    for (const line of lines) {
      bubble.textContent = line
      hit.setAttribute('data-line', '1')
      hit.removeAttribute('data-react')
      hit.removeAttribute('data-dance')
      await check(line.slice(0, 24))
    }
    for (const [id, line] of reactions) {
      bubble.textContent = line
      hit.setAttribute('data-line', '1')
      hit.setAttribute('data-react', id)
      hit.removeAttribute('data-dance')
      await check(`react ${id}`)
    }
    for (const dance of dances) {
      bubble.textContent = 'Super party mode. Everyone’s invited.'
      hit.setAttribute('data-line', '1')
      hit.setAttribute('data-react', 'party')
      hit.setAttribute('data-dance', dance)
      await check(`dance ${dance}`)
    }
    bubble.textContent = ''
    hit.removeAttribute('data-line')
    hit.removeAttribute('data-react')
    hit.removeAttribute('data-dance')
    root.style.removeProperty('transform')
    return problems
  }, { x, y, where, lines: LINES, reactions: REACTIONS, dances: DANCES })
}

async function sweep(browser: Browser, width: number, theme: 'light' | 'dark') {
  const height = width >= 1000 ? 900 : 844
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const failures: Problem[] = []
  const points = [
    { x: 12, y: 130 },
    { x: Math.max(12, width - 70), y: 130 },
    { x: Math.round(width / 2 - 26), y: 300 },
    { x: 12, y: height - 200 },
    { x: Math.max(12, width - 70), y: height - 200 },
  ]
  for (const [name, path] of PAGES) {
    await page.goto(ORIGIN + path, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('.vp-roam[data-placed="1"]', { timeout: 25000 })
    await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), theme === 'dark')
    await page.waitForTimeout(1600)
    const mascotW = await page.evaluate(() => Math.ceil(document.querySelector('.vp-rig')?.getBoundingClientRect().width || 52))
    const fitted = points.map((point) => ({
      x: Math.max(8, Math.min(point.x, width - mascotW - 8)),
      y: Math.max(96, Math.min(point.y, height - 160)),
    }))
    for (const point of fitted) {
      failures.push(...await pinAndCheck(page, point.x, point.y, `${theme} ${width} ${name}`))
    }
    await page.evaluate(() => window.scrollTo(0, 360))
    await page.waitForTimeout(200)
    failures.push(...await pinAndCheck(page, Math.round(width / 2 - 26), 240, `${theme} ${width} ${name} scrolled`))
  }
  await context.close()
  return failures
}

test.beforeAll(async () => {
  if (!ORIGIN.includes('vercel.app')) return
  const browser = await pw.chromium.launch()
  const page = await browser.newPage()
  const deadline = Date.now() + 240_000
  let ready = false
  while (Date.now() < deadline) {
    await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => null)
    ready = (await page.locator('.vp-roam[data-chrome="joint"]').count().catch(() => 0)) > 0
    if (ready) break
    await page.waitForTimeout(10_000)
  }
  await browser.close()
  expect(ready, `preview ${ORIGIN} is serving the joint chrome layout`).toBe(true)
})

for (const engine of ['chromium', 'webkit'] as const) {
  test(`mascot chrome stays clear (${engine})`, async ({ playwright }) => {
    test.setTimeout(600_000)
    const browser = await (engine === 'webkit' ? pw.webkit : pw.chromium).launch()
    const failures: Problem[] = []
    for (const width of WIDTHS) {
      for (const theme of ['dark', 'light'] as const) {
        failures.push(...await sweep(browser, width, theme))
      }
    }
    await browser.close()
    expect(failures, failures.slice(0, 8).map((f) => `${f.where}: ${f.problems.join(', ')}`).join('\n')).toEqual([])
  })
}

test('mascot chrome peek hides the bubble clash and comes back clear', async ({ playwright }) => {
  test.setTimeout(120_000)
  for (const engine of ['chromium', 'webkit'] as const) {
    const browser = await (engine === 'webkit' ? pw.webkit : pw.chromium).launch()
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.goto(`${ORIGIN}/events/fun-brain-training-cmw02482a004pl608sd9ezpzy`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('.vp-roam[data-placed="1"]', { timeout: 25000 })
    await page.waitForTimeout(1500)
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 80)
    await page.waitForTimeout(200)
    const peeking = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.vp-roam')!
      const close = root.querySelector<HTMLElement>('.vp-buddy-min')!
      return { peek: root.dataset.scrollPeek || '', x: getComputedStyle(close).visibility }
    })
    expect(peeking.peek, `${engine} should peek`).toBe('1')
    expect(peeking.x, `${engine} hides the X while peeking`).toBe('hidden')
    await page.waitForTimeout(1800)
    const back = await page.evaluate(async () => {
      const root = document.querySelector<HTMLElement>('.vp-roam')!
      const bubble = root.querySelector<HTMLElement>('.vp-bubble')!
      const hit = root.querySelector<HTMLElement>('.vp-hit')!
      bubble.textContent = 'Stop it. You’ll make me blush.'
      hit.setAttribute('data-line', '1')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))))
      const rig = root.querySelector('.vp-rig')!.getBoundingClientRect()
      const bub = bubble.getBoundingClientRect()
      const close = root.querySelector<HTMLElement>('.vp-buddy-min')!
      const xVis = getComputedStyle(close).visibility
      const x = close.getBoundingClientRect()
      const sep = (a: DOMRect, b: DOMRect, pad: number) =>
        a.right + pad <= b.left || b.right + pad <= a.left || a.bottom + pad <= b.top || b.bottom + pad <= a.top
      return {
        peek: root.dataset.scrollPeek || '',
        x: xVis,
        clear: xVis === 'hidden' || sep(x, bub, 8),
        offHim: sep(bub, rig, 2),
      }
    })
    expect(back.peek, `${engine} returns`).not.toBe('1')
    expect(back.clear, `${engine} X clears the bubble after returning`).toBe(true)
    expect(back.offHim, `${engine} bubble clears him after returning`).toBe(true)
    await page.close()
    await browser.close()
  }
})
