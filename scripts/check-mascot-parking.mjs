// Fail if the roaming mascot, including the close button, overlaps a card, button, clock, or heading.
const base = process.env.PEEP_URL || 'http://127.0.0.1:3457'
const cdp = process.env.PEEP_CDP || 'http://127.0.0.1:9341'
const pages = [
  ['board-desktop', 1280, 800, false, '/'],
  ['board-phone', 390, 844, true, '/'],
  ['map-desktop', 1280, 800, false, '/map'],
  ['map-phone', 390, 844, true, '/map'],
  ['local-desktop', 1280, 800, false, '/local'],
  ['local-phone', 390, 844, true, '/local'],
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await fetch(`${cdp}/json`).then((r) => r.json())
const tab = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl)
if (!tab) {
  console.error('No Chrome page on', cdp)
  process.exit(1)
}
const ws = new WebSocket(tab.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
await new Promise((r) => ws.addEventListener('open', r))
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq
  const t = setTimeout(() => rej(new Error(method)), 20000)
  pending.set(id, (m) => { clearTimeout(t); res(m) })
  ws.send(JSON.stringify({ id, method, params }))
})
const ev = async (expression) => {
  const m = await send('Runtime.evaluate', { expression, returnByValue: true })
  return m.result?.result?.value
}
await send('Network.setCacheDisabled', { cacheDisabled: true })

const probe = `(() => {
  const root = document.querySelector('.vp-roam')
  const rigEl = root?.querySelector('.vp-rig')
  const btnEl = root?.querySelector('.vp-buddy-min')
  const rig = rigEl?.getBoundingClientRect()
  const btn = btnEl?.getBoundingClientRect()
  if (!rig || !btn) return JSON.stringify({ error: 'missing mascot' })
  const box = {
    left: Math.min(rig.left, btn.left),
    top: Math.min(rig.top, btn.top),
    right: Math.max(rig.right, btn.right),
    bottom: Math.max(rig.bottom, btn.bottom),
  }
  const hit = (a, b) => a.right > b.left + 0.5 && a.left < b.right - 0.5 && a.bottom > b.top + 0.5 && a.top < b.bottom - 0.5
  const names = []
  const nodes = document.querySelectorAll('button, a, h1, h2, h3, .vp-hero-clock, .vp-map-ask, .vp-local-grid, .leaflet-control, .rounded-xl, .rounded-2xl')
  for (const el of nodes) {
    if (el.closest('.vp-roam')) continue
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    if (r.width > innerWidth * 0.96 && r.height > innerHeight * 0.7) continue
    if (!hit(box, r)) continue
    const label = (el.innerText || el.getAttribute('aria-label') || el.className || el.tagName).toString().trim().replace(/\\s+/g, ' ').slice(0, 60)
    names.push(label)
  }
  const feature = [...document.querySelectorAll('a')].find((el) => /feature your event/i.test(el.textContent || ''))
  const row = feature?.parentElement?.getBoundingClientRect()
  const hero = document.querySelector('main > section.rounded-2xl')?.getBoundingClientRect()
  const hot = [...document.querySelectorAll('h2')].find((el) => /hot right now/i.test(el.textContent || ''))?.getBoundingClientRect()
  const grid = document.querySelector('.vp-local-grid')?.getBoundingClientRect()
  return JSON.stringify({
    vw: innerWidth,
    ch: rigEl.clientHeight,
    x: Math.round(rig.x),
    y: Math.round(rig.y),
    feet: Math.round(rig.bottom),
    right: Math.round(innerWidth - box.right),
    move: root.dataset.move || '',
    overlaps: [...new Set(names)].slice(0, 8),
    rowTop: row ? Math.round(row.top) : null,
    rowBottom: row ? Math.round(row.bottom) : null,
    featureLeft: feature ? Math.round(feature.getBoundingClientRect().left) : null,
    btnLeft: Math.round(btn.left),
    btnRight: Math.round(btn.right),
    btnTop: Math.round(btn.top),
    btnBottom: Math.round(btn.bottom),
    heroBottom: hero ? Math.round(hero.bottom) : null,
    hotTop: hot ? Math.round(hot.top) : null,
    gridTop: grid ? Math.round(grid.top) : null,
    gridRight: grid ? Math.round(grid.right) : null,
    boxLeft: Math.round(box.left),
    boxTop: Math.round(box.top),
  })
})()`

const failures = []
const note = (name, info) => {
  console.log(name, JSON.stringify(info))
  if (!info || info.error || (info.overlaps && info.overlaps.length)) {
    failures.push(name + ': ' + (info?.error || info.overlaps.join(' | ')))
  }
}

for (const [name, w, h, mobile, path] of pages) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile, scale: 1 })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await send('Page.navigate', { url: base + path + '?parkcheck=1' })
  await sleep(1700)
  await ev(`document.querySelectorAll('nextjs-portal').forEach((el) => el.remove())`)
  const raw = await ev(probe)
  let info
  try { info = JSON.parse(raw) } catch { info = { error: String(raw) } }
  note(name, info)
  if (info && !info.error) {
    if (name === 'board-desktop') {
      const mid = info.y + info.ch / 2
      const rowMid = info.rowTop != null && info.rowBottom != null ? (info.rowTop + info.rowBottom) / 2 : null
      if (rowMid != null && Math.abs(mid - rowMid) > 2) failures.push(name + ': centre ' + mid + ' vs row ' + rowMid)
      if (info.x !== 1048) failures.push(name + ': x ' + info.x + ' != 1048')
      if (info.right < 8) failures.push(name + ': box closer than 8px, inset ' + info.right)
      if (info.btnLeft < 0 || info.btnTop < 0 || info.btnRight > info.vw) failures.push(name + ': close button off screen')
    }
    if (name === 'board-phone') {
      if (info.right < 10 || info.right > 16) failures.push(name + ': right inset ' + info.right)
      if (info.heroBottom != null && info.boxTop < info.heroBottom) failures.push(name + ': overlaps the hero')
      if (info.hotTop != null && info.feet > info.hotTop + 6) failures.push(name + ': feet below HOT RIGHT NOW')
    }
    if (name === 'local-desktop' && info.gridRight != null && info.boxLeft < info.gridRight - 1 && info.gridTop != null && info.feet > info.gridTop) {
      failures.push(name + ': inside the listings grid')
    }
  }
}

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false, scale: 1 })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] })
await send('Page.navigate', { url: base + '/?parkcheck=live' })
const ready = async () => {
  for (let i = 0; i < 40; i++) {
    const ok = await ev(`location.search.includes('parkcheck=live') && !!document.querySelector('.vp-roam[data-ready] .vp-rig')`)
    if (ok) return true
    await sleep(100)
  }
  return false
}
if (!(await ready())) failures.push('board-desktop t0: mascot never parked')
const live = []
for (const label of ['t0', 't1', 't2']) {
  if (label !== 't0') await sleep(1000)
  await ev(`document.querySelectorAll('nextjs-portal').forEach((el) => el.remove())`)
  const raw = await ev(probe)
  let info
  try { info = JSON.parse(raw) } catch { info = { error: String(raw) } }
  console.log('board-desktop', label, JSON.stringify(info))
  note('board-desktop ' + label, info)
  live.push(info)
  if (info && !info.error) {
    if (info.right < 8) failures.push(label + ': box closer than 8px, inset ' + info.right)
    if (info.btnLeft < 0 || info.btnTop < 0 || info.btnRight > info.vw) failures.push(label + ': close button off screen')
  }
}
if (live.length === 3 && live.every((info) => info && !info.error)) {
  const end = live[2]
  const travelled = Math.abs(end.x - live[0].x) >= 24
  if (!travelled) failures.push('board-desktop did not walk: ' + live.map((info) => info.x).join(' -> '))
  const mid = end.y + end.ch / 2
  const rowMid = end.rowTop != null && end.rowBottom != null ? (end.rowTop + end.rowBottom) / 2 : null
  if (rowMid != null && Math.abs(mid - rowMid) > 8) failures.push('t2 not centred on the row')
  if (end.x !== 1048) failures.push('t2 x ' + end.x + ' != 1048')
}

await send('Page.navigate', { url: base + '/?facewalk=1' })
await sleep(400)
let prevFace = null
let firstVisible = null
for (let i = 0; i < 24; i++) {
  const raw = await ev(`(() => {
    const root = document.querySelector('.vp-roam')
    if (!root) return JSON.stringify({ missing: true })
    const rig = root.querySelector('.vp-rig')
    const profile = root.querySelector('.vp-profile')
    if (!rig || !profile) return JSON.stringify({ missing: true })
    const r = rig.getBoundingClientRect()
    const m = new DOMMatrix(getComputedStyle(profile).transform)
    return JSON.stringify({
      x: Math.round(r.x),
      move: root.dataset.move || '',
      turn: root.dataset.turn || '',
      placed: root.dataset.placed || '',
      vis: getComputedStyle(root).visibility,
      eyeRight: m.a < 0,
    })
  })()`)
  let info
  try { info = JSON.parse(raw) } catch { info = { missing: true } }
  if (!info.missing && info.vis === 'visible' && info.placed === '1') {
    if (!firstVisible) firstVisible = info
    if (prevFace && info.move === 'hop') {
      const dx = info.x - prevFace.x
      if (dx > 8 && !info.eyeRight) failures.push('walk frame ' + i + ': dx ' + dx + ' but the eye is on the left')
      if (dx < -8 && info.eyeRight) failures.push('walk frame ' + i + ': dx ' + dx + ' but the eye is on the right')
    }
    prevFace = info
  }
  console.log('face', i, raw)
  await sleep(120)
}
if (firstVisible && firstVisible.x >= 1000) failures.push('first visible frame is at x ' + firstVisible.x + ', the parking spot')
if (firstVisible && firstVisible.turn !== '1' && firstVisible.move !== 'hop') failures.push('first visible frame is not the turn or the walk')

await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] })
for (const [name, w, h, mobile, path] of pages) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile, scale: 1 })
  await send('Page.navigate', { url: base + path + '?parkcheck=1&peepfast=1' })
  await sleep(1200)
  const seen = new Set()
  for (let i = 0; i < 28; i++) {
    await sleep(250)
    const raw = await ev(probe)
    let info
    try { info = JSON.parse(raw) } catch { info = { error: String(raw) } }
    const traveling = !info?.move || info.move === 'hop' || info.move === 'chase' || info.move === 'bounce' || info.move === 'still' || info.move === 'idle'
    if (traveling && (!info || info.error || (info.overlaps && info.overlaps.length))) {
      const key = name + ' walk: ' + (info?.error || (info?.overlaps || []).join(' | ') || 'bad')
      if (!seen.has(key)) {
        seen.add(key)
        console.log(name, 't' + i, JSON.stringify(info))
        failures.push(key)
      }
    }
  }
}

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false, scale: 1 })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: '' }] })
for (let n = 0; n < 5; n++) {
  await send('Page.navigate', { url: base + '/?boardpin=' + n })
  await sleep(5200)
  for (let k = 0; k < 3; k++) {
    const x = await ev(`(() => { const r = document.querySelector('.vp-rig'); return r ? Math.round(r.getBoundingClientRect().x) : -1 })()`)
    console.log('board reload', n, k, x)
    if (x !== 1048) failures.push('board x ' + x + ' != 1048 reload ' + n)
    await sleep(250)
  }
}
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, scale: 1 })
await send('Page.navigate', { url: base + '/map?pinspace=1' })
await sleep(2000)
const gapExpr = `(() => {
  const root = document.querySelector('.vp-roam')
  const rig = root?.querySelector('.vp-rig')?.getBoundingClientRect()
  const btn = root?.querySelector('.vp-buddy-min')?.getBoundingClientRect()
  if (!rig || !btn) return JSON.stringify({ error: 'missing' })
  const boxes = [rig, btn]
  const hits = []
  for (const el of document.querySelectorAll('.leaflet-marker-icon, .se-cluster')) {
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    for (const box of boxes) {
      const sep = box.right <= r.left ? r.left - box.right : r.right <= box.left ? box.left - r.right : box.bottom <= r.top ? r.top - box.bottom : r.bottom <= box.top ? box.top - r.bottom : 0
      if (sep < 16) hits.push(Math.round(sep) + ' ' + (el.className || '').toString().slice(0, 24))
    }
  }
  return JSON.stringify(hits)
})()`
const pinRaw = await ev(gapExpr)
console.log('map pins', pinRaw)
try {
  const hits = JSON.parse(pinRaw)
  if (hits.length) failures.push('map phone within 16px: ' + hits.join(' | '))
} catch { failures.push('map phone pin check failed') }
await ev(`(() => {
  const rig = document.querySelector('.vp-rig').getBoundingClientRect()
  const pin = document.createElement('div')
  pin.className = 'leaflet-marker-icon'
  pin.style.cssText = 'position:fixed;width:28px;height:28px;left:' + (rig.left + 4) + 'px;top:' + (rig.top + 10) + 'px;z-index:5'
  const cluster = document.createElement('div')
  cluster.className = 'se-cluster'
  cluster.textContent = '2'
  cluster.style.cssText = 'position:fixed;width:32px;height:32px;left:' + (rig.right - 8) + 'px;top:' + (rig.top - 6) + 'px'
  document.body.append(pin, cluster)
  return '1'
})()`)
await sleep(500)
const shoved = await ev(gapExpr)
console.log('map shoved', shoved)
try {
  const hits = JSON.parse(shoved)
  if (!Array.isArray(hits)) failures.push('map pin shove failed')
  else if (hits.length) failures.push('map phone still within 16px after a pin appeared: ' + hits.join(' | '))
} catch { failures.push('map pin shove failed') }

ws.close()
if (failures.length) {
  console.error('PARKING OVERLAP')
  for (const line of failures) console.error(' -', line)
  process.exit(1)
}
console.log('parking clear')
