/**
 * Production check: four quick double-clicks must play four different dances.
 * Usage: node scripts/mascot-party-e2e.mjs http://127.0.0.1:3456
 */
const url = process.argv[2] || 'http://127.0.0.1:3456'
const port = 9334

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const chrome = await import('node:child_process')
chrome.spawn(
  'google-chrome',
  [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/chrome-party-e2e`,
    '--no-first-run',
    '--window-size=1280,800',
    url,
  ],
  { stdio: 'ignore', detached: true },
).unref()

async function page() {
  for (let i = 0; i < 40; i++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json())
      const found = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl)
      if (found) return found
    } catch { /* booting */ }
    await sleep(250)
  }
  throw new Error('chrome did not open')
}

const tab = await page()
const ws = new WebSocket(tab.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})
await new Promise((resolve) => ws.addEventListener('open', resolve))

function send(method, params = {}) {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve) => pending.set(id, resolve))
}

async function evaluate(expression) {
  const msg = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (msg.result?.exceptionDetails) throw new Error(JSON.stringify(msg.result.exceptionDetails))
  return msg.result?.result?.value
}

for (let i = 0; i < 40; i++) {
  if (await evaluate(`!!document.querySelector('.vp-roam[data-ready] .vp-hit')`)) break
  await sleep(250)
}
const ready = await evaluate(`!!document.querySelector('.vp-hit')`)
if (!ready) throw new Error('mascot did not mount')

async function center() {
  return evaluate(`(() => {
    const r = document.querySelector('.vp-hit').getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.55 }
  })()`)
}

async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

const dances = []
for (let n = 0; n < 4; n++) {
  const c = await center()
  await clickAt(c.x, c.y)
  await sleep(120)
  await clickAt(c.x, c.y)
  await sleep(400)
  const dance = await evaluate(`document.querySelector('.vp-hit')?.getAttribute('data-dance')`)
  dances.push(dance)
  console.log('dance', n + 1, dance)
  await sleep(700)
}

const unique = new Set(dances)
if (dances.some((id) => !id) || unique.size !== 4) {
  console.error('expected 4 different dances, got', dances)
  process.exit(1)
}
console.log('ok', dances.join(' '))
ws.close()
process.exit(0)
