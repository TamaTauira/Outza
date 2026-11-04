// Facing direction: on every walk frame, the sign of dx matches the side the eye is on.
// The profile art faces left, so a negative scaleX (DOMMatrix.a < 0) puts the eye on the right.
const base = process.env.PEEP_URL || 'http://127.0.0.1:3457'
const cdp = process.env.PEEP_CDP || 'http://127.0.0.1:9341'

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

const failures = []
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false, scale: 1 })
const faceScript = await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    window.__faceFrames = []
    const start = performance.now()
    let firstSeen = 0
    const tick = () => {
      const root = document.querySelector('.vp-roam')
      const rig = root?.querySelector('.vp-rig')
      const profile = root?.querySelector('.vp-profile')
      const three = root?.querySelector('.vp-threeq')
      const front = root?.querySelector('.vp-front')
      if (root && rig && profile) {
        const r = rig.getBoundingClientRect()
        const vis = getComputedStyle(root).visibility
        if (vis === 'visible' && root.dataset.placed === '1' && r.width > 20) {
          if (!firstSeen) firstSeen = performance.now()
          let eyeRight = false
          const raw = getComputedStyle(profile).transform
          if (raw && raw !== 'none') eyeRight = new DOMMatrix(raw).a < 0
          window.__faceFrames.push({
            x: Math.round(r.x),
            move: root.dataset.move || '',
            turn: root.dataset.turn || '',
            eyeRight,
            front: front ? getComputedStyle(front).visibility : '',
            three: three ? getComputedStyle(three).visibility : '',
          })
        }
      }
      const since = firstSeen ? performance.now() - firstSeen : 0
      if (performance.now() - start < 7000 && since < 4500) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })()`,
})
await send('Page.navigate', { url: base + '/?facewalk=1' })
await sleep(6000)
const faceRaw = await ev('JSON.stringify(window.__faceFrames || [])')
if (faceScript.result?.identifier) {
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: faceScript.result.identifier })
}
let faceFrames = []
try { faceFrames = JSON.parse(faceRaw) } catch { faceFrames = [] }
console.log('face frames', faceFrames.length, faceFrames[0] && JSON.stringify(faceFrames[0]), '->', faceFrames.at(-1) && JSON.stringify(faceFrames.at(-1)))
const firstVisible = faceFrames[0]
if (!firstVisible) failures.push('no visible walk frames')
if (firstVisible && firstVisible.x >= 1000) failures.push('first visible frame is at x ' + firstVisible.x + ', the parking spot')
if (firstVisible && firstVisible.turn !== '1') failures.push('first visible frame is not the three-quarter turn')
if (firstVisible && firstVisible.front === 'visible') failures.push('first visible frame shows the front pose')
let hops = 0
faceFrames.forEach((info, i) => {
  const earlier = faceFrames[i - 4]
  if (!earlier || info.move !== 'hop') return
  const dx = info.x - earlier.x
  if (Math.abs(dx) > 6) hops += 1
  if (dx > 6 && !info.eyeRight) failures.push('walk frame ' + i + ': dx ' + dx + ' but the eye is on the left')
  if (dx < -6 && info.eyeRight) failures.push('walk frame ' + i + ': dx ' + dx + ' but the eye is on the right')
})
if (hops < 4) failures.push('only ' + hops + ' hop frames, the walk was not sampled')
ws.close()
if (failures.length) {
  console.error('FACING')
  for (const line of failures) console.error(' -', line)
  process.exit(1)
}
console.log('facing clear', faceFrames.length, 'frames', hops, 'hops')
