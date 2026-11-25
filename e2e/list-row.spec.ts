import { expect, test, type Page } from '@playwright/test'

const LONG = 'Saturday night orchestra with a title long enough to wrap if the row is allowed to grow past one line'

function listRow(title: string, venue: string) {
  return `<div class="vp-mrow" data-probe="row">
    <span class="vp-mrow-rail" aria-hidden><span class="vp-mrow-dot"></span><span class="vp-mrow-line"></span><span class="vp-mrow-ring"></span></span>
    <span class="vp-mrow-start"><span class="vp-clock vp-clock-start" data-part="start"><span class="vp-clock-hm">10:00</span><span class="vp-clock-ap">am</span></span></span>
    <span class="vp-mrow-end"><span class="vp-clock vp-clock-end" data-part="end"><span class="vp-clock-hm">10:40</span><span class="vp-clock-ap">am</span></span></span>
    <span class="vp-mrow-line1"><span class="vp-mrow-title">${title}</span><span class="vp-mrow-venue-inline">${venue}</span></span>
    <span class="vp-mrow-venue">${venue}</span>
    <span class="vp-mrow-meta"><span class="vp-chip"><span>Music</span></span><span class="vp-price">$51–$62</span></span>
    <span class="vp-mrow-actions"></span>
  </div>`
}

function boardCard(title: string) {
  return `<article class="vp-board-card" data-probe="card">
    <span class="vp-board-media"></span>
    <div class="vp-board-body">
      <div class="vp-board-line"><span class="vp-board-title">${title}</span><span class="vp-board-slot"><span class="vp-clock vp-clock-start"><span class="vp-clock-hm">7:30</span><span class="vp-clock-ap">pm</span></span></span></div>
      <div class="vp-board-line"><p class="vp-board-venue">The Hall · Newtown</p><span class="vp-board-slot"><span class="vp-clock vp-clock-end"><span class="vp-clock-hm">9:00</span><span class="vp-clock-ap">pm</span></span></span></div>
      <div class="vp-board-foot"><span class="vp-board-foot-main"><span class="vp-chip"><span>Music</span></span><span class="vp-price">Free</span></span></div>
    </div>
  </article>`
}

async function mount(page: Page) {
  await page.evaluate(({ rows, cards }) => {
    document.getElementById('vp-row-probe')?.remove()
    const root = document.createElement('div')
    root.id = 'vp-row-probe'
    root.innerHTML = `<div id="vp-row-probe-list">${rows}</div><div class="vp-board-grid">${cards}</div>`
    document.body.appendChild(root)
  }, {
    rows: listRow('Short set', 'The Hall · Newtown') + listRow(LONG, 'A neighbourhood venue with a very long name · Inner West'),
    cards: boardCard('Short set') + boardCard(LONG),
  })
}

test('list rows stay 92px and clamp the title to one line', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await mount(page)
  const rows = page.locator('#vp-row-probe [data-probe="row"]')
  await expect(rows).toHaveCount(2)
  const heights = await rows.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
  expect(heights).toEqual([92, 92])
  const clamp = await rows.nth(1).locator('.vp-mrow-title').evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      whiteSpace: style.whiteSpace,
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      clipped: el.scrollWidth > el.clientWidth + 1,
      oneLine: el.scrollHeight <= el.clientHeight + 1,
    }
  })
  expect(clamp.whiteSpace).toBe('nowrap')
  expect(clamp.overflow).toBe('hidden')
  expect(clamp.textOverflow).toBe('ellipsis')
  expect(clamp.clipped).toBe(true)
  expect(clamp.oneLine).toBe(true)
  const venue = await rows.nth(1).locator('.vp-mrow-venue').evaluate((el) => getComputedStyle(el).whiteSpace)
  expect(venue).toBe('nowrap')

  const live = page.locator('#line-up [data-vp-row="list"]')
  if (await live.count() >= 2) {
    const liveHeights = await live.evaluateAll((els) => els.slice(0, 6).map((el) => Math.round(el.getBoundingClientRect().height)))
    expect(new Set(liveHeights)).toEqual(new Set([92]))
  }
})

test('start and end times share one right edge and the title and chip baselines', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await mount(page)
  const row = page.locator('#vp-row-probe [data-probe="row"]').first()
  const edges = await row.evaluate((root) => {
    const box = (sel: string) => root.querySelector(sel)!.getBoundingClientRect()
    const start = box('[data-part="start"]')
    const end = box('[data-part="end"]')
    const title = box('.vp-mrow-title')
    const price = box('.vp-price')
    return {
      rightDelta: Math.abs(start.right - end.right),
      startTitle: Math.abs(start.bottom - title.bottom),
      endPrice: Math.abs(end.bottom - price.bottom),
    }
  })
  expect(edges.rightDelta).toBeLessThan(1)
  expect(edges.startTitle).toBeLessThan(4)
  expect(edges.endPrice).toBeLessThan(6)
})

test('landscape phone keeps the row height and puts the venue on the title line', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  await mount(page)
  const rows = page.locator('#vp-row-probe [data-probe="row"]')
  const heights = await rows.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
  expect(heights).toEqual([92, 92])
  const shown = await rows.nth(1).evaluate((row) => {
    const inlineVenue = getComputedStyle(row.querySelector('.vp-mrow-venue-inline')!)
    const stacked = getComputedStyle(row.querySelector('.vp-mrow-venue')!)
    const title = row.querySelector('.vp-mrow-title')!
    return {
      inline: inlineVenue.display,
      stacked: stacked.display,
      clipped: title.scrollWidth > title.clientWidth + 1 || title.textContent!.length < 40,
    }
  })
  expect(shown.inline).not.toBe('none')
  expect(shown.stacked).toBe('none')
  const landscapeClamp = await rows.nth(1).locator('.vp-mrow-title').evaluate((el) => ({
    whiteSpace: getComputedStyle(el).whiteSpace,
    clipped: el.scrollWidth > el.clientWidth + 1,
  }))
  expect(landscapeClamp.whiteSpace).toBe('nowrap')
  expect(landscapeClamp.clipped).toBe(true)
  const cards = page.locator('#vp-row-probe [data-probe="card"]')
  const cardBox = await cards.evaluateAll((els) => els.map((el) => {
    const style = getComputedStyle(el)
    return {
      height: Math.round(el.getBoundingClientRect().height),
      direction: style.flexDirection,
    }
  }))
  expect(cardBox.map((box) => box.height)).toEqual([132, 132])
  expect(cardBox.every((box) => box.direction === 'row')).toBe(true)
  const columns = await page.locator('#vp-row-probe .vp-board-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(2)
})
