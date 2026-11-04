// Antenna must stay visible, attached above the head, for every dance plus idle and both walks.
const base = process.env.PEEP_URL || 'http://127.0.0.1:3457'
const cdp = process.env.PEEP_CDP || 'http://127.0.0.1:9341'
const dances = ['moonwalk','robot','ymca','macarena','snake','island','griddy','goth-snap','hand-jive','shuffle','floss','sprinkler','running-man','twist','worm','chicken','disco-point','shopping-cart','horse','cha-cha']
const poses = [
  ['idle', null, 'right'],
  ['hop', null, 'right'],
  ['hop', null, 'left'],
  ...dances.map((id) => ['dance', id, 'right']),
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
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value

await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false, scale: 1 })
await send('Page.navigate', { url: base + '/?peepdrive=1&antcheck=1' })
await sleep(1600)

const failures = []
for (const [move, dance, face] of poses) {
  const label = dance || move + '-' + face
  const raw = await ev(`(() => {
    const root = document.querySelector('.vp-roam')
    const btn = root.querySelector('.vp-hit')
    root.dataset.loaded = '1'
    root.dataset.ready = '1'
    root.dataset.face = ${JSON.stringify(face)}
    if (${JSON.stringify(dance)}) {
      root.dataset.move = 'dance'
      btn.setAttribute('data-react', 'party')
      btn.setAttribute('data-dance', ${JSON.stringify(dance || '')})
    } else {
      btn.removeAttribute('data-react')
      btn.removeAttribute('data-dance')
      root.dataset.move = ${JSON.stringify(move)}
    }
    const stalk = root.querySelector('.vp-ant-stalk')
    const body = root.querySelector('.vp-torso')
    if (!stalk || !body) return JSON.stringify({ error: 'missing' })
    const s = stalk.getBoundingClientRect()
    const b = body.getBoundingClientRect()
    const style = getComputedStyle(stalk)
    return JSON.stringify({
      opacity: Number(style.opacity),
      visibility: style.visibility,
      top: Math.round(s.top),
      bottom: Math.round(s.bottom),
      left: Math.round(s.left),
      right: Math.round(s.right),
      bodyTop: Math.round(b.top),
      bodyH: Math.round(b.height),
    })
  })()`)
  await sleep(180)
  const again = await ev(`(() => {
    const stalk = [...document.querySelectorAll('.vp-ant-stalk')].find((el) => getComputedStyle(el).visibility !== 'hidden') || document.querySelector('.vp-ant-stalk')
    const body = document.querySelector('.vp-torso')
    const s = stalk.getBoundingClientRect()
    const b = body.getBoundingClientRect()
    const style = getComputedStyle(stalk)
    return JSON.stringify({
      opacity: Number(style.opacity),
      visibility: style.visibility,
      top: Math.round(s.top),
      bottom: Math.round(s.bottom),
      left: Math.round(s.left),
      right: Math.round(s.right),
      bodyTop: Math.round(b.top),
      bodyH: Math.round(b.height),
      vw: innerWidth,
      vh: innerHeight,
    })
  })()`)
  let info
  try { info = JSON.parse(again) } catch { info = { error: String(raw) } }
  const bad = []
  if (!info || info.error) bad.push(info?.error || 'no measurement')
  else {
    if (info.visibility === 'hidden' || info.opacity <= 0.5) bad.push('hidden ' + info.opacity)
    if (info.top < -2 || info.left < -2 || info.right > info.vw + 2 || info.bottom > info.vh + 2) bad.push('outside viewport')
    if (info.bottom > info.bodyTop + info.bodyH * 0.25) bad.push('not above the head')
    if (Math.abs(info.bottom - info.bodyTop) > info.bodyH * 0.45) bad.push('detached')
    if (dance === 'disco-point') {
      const extra = JSON.parse(await ev(`(() => {
        const ball = document.querySelector('.vp-disco-ball')
        const stalk = document.querySelector('.vp-front .vp-ant-stalk')
        const body = document.querySelector('.vp-torso')
        if (!ball || !stalk || !body) return JSON.stringify({ error: 'missing disco parts' })
        const bs = getComputedStyle(ball)
        const ss = getComputedStyle(stalk)
        const br = ball.getBoundingClientRect()
        const sr = stalk.getBoundingClientRect()
        const bodyR = body.getBoundingClientRect()
        return JSON.stringify({
          ballDisplay: bs.display,
          ballOpacity: Number(bs.opacity),
          stalkVis: ss.visibility,
          stalkClip: ss.clipPath || ss.webkitClipPath || '',
          ballW: Math.round(br.width),
          headW: Math.round(bodyR.width),
          ballBottom: Math.round(br.bottom),
          stalkTop: Math.round(sr.top),
          stalkBottom: Math.round(sr.bottom),
          stalkH: Math.round(sr.height),
        })
      })()`))
      if (extra.error) bad.push(extra.error)
      else {
        if (extra.stalkVis === 'hidden') bad.push('stalk hidden')
        if (extra.ballDisplay === 'none' || extra.ballOpacity < 0.5) bad.push('ball hidden')
        if (extra.ballW < extra.headW * 0.35) bad.push('ball smaller than half a head')
        if (extra.stalkH < 8) bad.push('no stalk')
        if (extra.ballBottom < extra.stalkTop - 6) bad.push('ball detached from stalk')
        console.log('disco stalk', JSON.stringify(extra))
      }
    }
  }
  console.log(label, bad.join('; ') || 'ok', JSON.stringify(info))
  if (bad.length) failures.push(label + ': ' + bad.join('; '))
}
ws.close()
if (failures.length) {
  console.error('ANTENNA FAIL')
  for (const line of failures) console.error(' -', line)
  process.exit(1)
}
console.log('antenna visible')
