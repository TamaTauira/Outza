import {
  NAP_IDLE_MS,
  ROAM_ACT_MS,
  bounceStep,
  clampPoint,
  destination,
  faceForDelta,
  hopCount,
  moveDuration,
  nearPageBottom,
  peekTarget,
  pickRoamLine,
  pickVignette,
  vignetteGap,
  roamBounds,
  lerp,
  smoothstep,
  type Bounds,
  type VignetteAct,
  type Point,
  type RoamAct,
} from '@/lib/mascot-roam'
import { roamBottomChrome } from '@/lib/bottom-nav'

const BLOCK = 'a, button, input, textarea, select, label, summary, header, nav, [role="button"], [role="link"], [role="tab"], [data-sonner-toaster], .leaflet-control, .leaflet-marker-icon, .se-cluster, .vp-map-float, .vp-map-cards, .vp-map-rail, .vp-map-toolbar, .vp-map-chips, .vp-map-ask, .rounded-xl, .rounded-2xl, p, h1, h2, h3, h4, li'

type Phase =
  | { type: 'pause'; until: number }
  | { type: 'goto'; from: Point; to: Point; start: number; dur: number; hops: number; then: RoamAct | null }
  | { type: 'act'; act: RoamAct; until: number }
  | { type: 'chase'; until: number }
  | { type: 'bounce'; until: number; vx: number; vy: number; last: number }
  | { type: 'hold' }

/**
 * Walks the fixed buddy around the viewport. Transforms only.
 * Pauses while a click reaction plays, while sulking, and while the tab is hidden.
 */
export function attachRoam(root: HTMLElement): () => void {
  const slot = root.querySelector<HTMLElement>('.vp-slot')
  const button = root.querySelector<HTMLButtonElement>('.vp-hit')
  const bubble = root.querySelector<HTMLElement>('.vp-bubble')
  const live = root.querySelector<HTMLElement>('.vp-live')
  if (!slot || !button || !bubble || !live) return () => {}

  const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const mobileMq = window.matchMedia('(max-width: 639px)')
  const navMq = window.matchMedia('(max-width: 1023px), (pointer: coarse) and (orientation: portrait) and (max-width: 1400px), (horizontal-viewport-segments: 2), (spanning: single-fold-vertical)')
  let navOffset = 0
  let segment = { w: 0, h: 0 }

  const probe = (style: string) => {
    const el = document.createElement('div')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = `position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;${style}`
    document.body.appendChild(el)
    const rect = el.getBoundingClientRect()
    el.remove()
    return rect
  }

  const readChrome = () => {
    const offset = probe('width:0;height:var(--vp-bottom-nav-offset, 0px)').height
    navOffset = Number.isFinite(offset) ? offset : 0
    const fold = document.documentElement.dataset.vpFold
    if (fold === 'side') {
      segment = { w: Math.max(0, (window.innerWidth - 24) / 2), h: 0 }
      return
    }
    if (fold === 'stack') {
      segment = { w: 0, h: Math.max(0, (window.innerHeight - 24) / 2) }
      return
    }
    const width = Math.max(
      probe('width:env(viewport-segment-width 0 0);height:0').width,
      probe('width:env(fold-left);height:0').width,
    )
    const height = Math.max(
      probe('width:0;height:env(viewport-segment-height 0 0)').height,
      probe('width:0;height:env(fold-top)').height,
    )
    segment = {
      w: Number.isFinite(width) ? width : 0,
      h: Number.isFinite(height) ? height : 0,
    }
  }
  let reduce = reduceMq.matches
  let face: 'left' | 'right' = 'right'
  let pos: Point = { x: 0, y: 0 }
  let cachedSize = 0
  let raf = 0
  let wake = 0
  let speechTimer = 0
  let boingTimer = 0
  let running = true
  let dragging = false
  let hiddenAt = 0
  let lastAct: RoamAct | null = null
  const params = new URLSearchParams(window.location.search)
  const fast = params.get('peepfast') === '1'
  const demo = params.get('peepdemo') === '1'
  const script: Array<'idle' | 'hop' | VignetteAct> = demo
    ? ['idle', 'hop', 'eat', 'hop', 'music', 'sport', 'paint']
    : []
  const gapMs = () => (fast ? 3200 + Math.random() * 1800 : vignetteGap(Math.random))
  let lastVignette: VignetteAct | null = null
  let nextVignetteAt = performance.now() + gapMs()
  let lastActivity = performance.now()
  let cheered = false
  let phase: Phase = { type: 'pause', until: performance.now() + 600 }
  const pointer = { x: 0, y: 0, t: 0 }
  let drag: { id: number; x: number; y: number; ox: number; oy: number; lastX: number; moved: boolean } | null = null
  let suppressClick = false

  const size = () => {
    if (cachedSize > 8) return cachedSize
    const width = root.getBoundingClientRect().width
    if (width > 8) cachedSize = width
    return width > 8 ? width : mobileMq.matches ? 56 : 72
  }

  const figure = () => {
    const rect = root.getBoundingClientRect()
    const width = rect.width > 8 ? rect.width : size()
    let top = rect.top
    let bottom = rect.bottom
    const bubble = root.querySelector<HTMLElement>('.vp-bubble')
    if (bubble && getComputedStyle(bubble).opacity !== '0') {
      const box = bubble.getBoundingClientRect()
      if (box.height > 2 && box.width > 2) {
        top = Math.min(top, box.top)
        bottom = Math.max(bottom, box.bottom)
      }
    }
    const height = bottom > top ? bottom - top : width
    return { width, height }
  }

  const bounds = (): Bounds => {
    const fullW = window.innerWidth
    const fullH = window.innerHeight
    const limitedW = segment.w > 8 && segment.w < fullW - 8
    const limitedH = segment.h > 8 && segment.h < fullH - 8
    const mobile = mobileMq.matches
    const map = root.dataset.map === '1'
    const box = figure()
    const base = roamBounds(limitedW ? segment.w : fullW, limitedH ? segment.h : fullH, box.width, {
      mobile,
      map,
      height: box.height,
      bottomInset: roamBottomChrome({
        mobile,
        map,
        navOffset: limitedH ? 0 : navOffset,
        segmentLimited: limitedH,
      }),
    })
    if (!map) return base
    const stage = document.querySelector<HTMLElement>('.vp-map-stage')
    if (!stage) return base
    const rect = stage.getBoundingClientRect()
    if (rect.width < 48 || rect.height < 48) return base
    const dock = Number.parseFloat(getComputedStyle(stage).getPropertyValue('--vp-map-dock')) || 0
    const crowded = rect.height < box.height + dock + 160
    const minX = Math.max(8, rect.left + (crowded ? 8 : 24))
    const minY = Math.max(8, rect.top + (crowded ? 52 : 120))
    const maxX = Math.max(minX, rect.right - box.width - (crowded ? 48 : 72))
    const maxY = Math.max(minY, rect.bottom - box.height - dock - (crowded ? 12 : 96))
    return { minX, minY, maxX, maxY }
  }

  const setMove = (move: string) => {
    if (root.dataset.move !== move) root.dataset.move = move
  }

  const apply = () => {
    root.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`
    if (root.dataset.face !== face) root.dataset.face = face
    const side = pos.x + size() / 2 > window.innerWidth * 0.5 ? 'start' : 'center'
    if (slot.dataset.bubble !== side) slot.dataset.bubble = side
  }

  const coversCopy = (x: number, y: number) => {
    const s = size()
    const h = Math.max(s, figure().height)
    const closeTop = mobileMq.matches ? 42 : 36
    const boxes = [
      { left: x, top: y, right: x + s, bottom: y + h },
      { left: x + s * 0.64 + 12, top: y - closeTop, right: x + s * 0.64 + 32, bottom: y - closeTop + 20 },
    ]
    const pad = 8
    const nodes = document.querySelectorAll(BLOCK)
    const textEl = 'p, h1, h2, h3, h4, li'
    for (const el of nodes) {
      if (!(el instanceof HTMLElement) || el.closest('.vp-roam')) continue
      let rects: DOMRect[] = []
      if (el.matches(textEl)) {
        const range = document.createRange()
        range.selectNodeContents(el)
        rects = Array.from(range.getClientRects()).filter((r) => r.width > 8 && r.height > 8)
      }
      if (!rects.length) {
        const r = el.getBoundingClientRect()
        if (r.width < 12 || r.height < 10) continue
        if (r.width > window.innerWidth * 0.92 && r.height > 180) continue
        rects = [r]
      }
      for (const r of rects) {
        for (const b of boxes) {
          if (!(b.right < r.left - pad || b.left > r.right + pad || b.bottom < r.top - pad || b.top > r.bottom + pad)) return true
        }
      }
    }
    return false
  }

  const firstClear = (box: Bounds): Point => {
    const stride = 24
    let best = { x: box.maxX, y: box.minY }
    let bestScore = Number.POSITIVE_INFINITY
    for (let y = box.minY; y <= box.maxY; y += stride) {
      for (let x = box.maxX; x >= box.minX; x -= stride) {
        if (!coversCopy(x, y)) return { x, y }
        const score = y + (box.maxX - x) * 0.01
        if (score < bestScore) {
          best = { x, y }
          bestScore = score
        }
      }
    }
    return best
  }

  const park = () => {
    const box = bounds()
    let spot = null
    if (!mobileMq.matches && location.pathname.startsWith('/local')) {
      const tab = Array.from(document.querySelectorAll('main button')).find((el) => /nearby|list something/i.test(el.textContent || ''))
      const bar = tab?.parentElement?.getBoundingClientRect()
      if (bar && bar.bottom > 40) {
        const s = size()
        const x = Math.max(8, window.innerWidth - (s * 0.64 + 32) - 8)
        for (let y = Math.max(box.minY, bar.bottom + 16); y <= Math.min(box.maxY, bar.bottom + 320); y += 12) {
          if (!coversCopy(x, y)) {
            spot = { x, y }
            break
          }
        }
      }
    }
    pos = spot ?? firstClear(box)
    face = 'right'
    root.dataset.ready = '1'
    setMove('still')
    apply()
  }

  const say = (line: string) => {
    if (reduce || button.hasAttribute('data-react') || button.getAttribute('data-mood') === 'sulk') return
    bubble.textContent = line
    live.textContent = line
    button.setAttribute('data-line', '1')
    window.clearTimeout(speechTimer)
    speechTimer = window.setTimeout(() => {
      if (!button.isConnected || bubble.textContent !== line || button.hasAttribute('data-react')) return
      bubble.textContent = ''
      live.textContent = ''
      button.removeAttribute('data-line')
    }, 2300)
  }

  const speak = (act: RoamAct, chance: number) => {
    if (Math.random() > chance) return
    say(pickRoamLine(act))
  }

  const spotClear = (x: number, y: number) => !coversCopy(x, y)

  const randomClear = (box: Bounds, from: Point) => {
    const s = size()
    for (let i = 0; i < 10; i++) {
      const point = destination(box, from, Math.random, Math.min(120, s * 1.6))
      if (spotClear(point.x, point.y)) return point
    }
    return firstClear(box)
  }

  const findPerch = (box: Bounds): Point | null => {
    const s = size()
    const nodes = document.querySelectorAll('h1, h2, article, figure')
    const list = Array.from(nodes).slice(0, 32)
    for (const node of list) {
      if (!(node instanceof HTMLElement) || node.closest('.vp-roam')) continue
      const rect = node.getBoundingClientRect()
      if (rect.width < 96 || rect.height < 28) continue
      if (rect.top < box.minY || rect.top > box.maxY - 8) continue
      const point = clampPoint(
        { x: rect.left + Math.min(56, rect.width * 0.22), y: rect.top - s * 0.62 },
        box,
      )
      if (spotClear(point.x, point.y)) return point
    }
    return null
  }

  const held = () =>
    dragging || button.hasAttribute('data-react') || button.getAttribute('data-mood') === 'sulk'

  const pauseNext = (ms?: number) => {
    const wait = ms ?? (demo && script.length ? 700 : 2200 + Math.random() * 3400)
    if (!spotClear(pos.x, pos.y)) {
      pos = firstClear(bounds())
      apply()
    }
    setMove('idle')
    phase = { type: 'pause', until: performance.now() + wait }
  }

  const goTo = (to: Point, then: RoamAct | null) => {
    const from = { ...pos }
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const dur = moveDuration(dist)
    const steps = Math.max(2, Math.round(dist / Math.max(36, size() * 0.42)))
    root.style.setProperty('--vp-step', `${Math.round(Math.max(320, Math.min(520, dur / steps)))}ms`)
    face = faceForDelta(to.x - from.x, face)
    setMove('hop')
    phase = { type: 'goto', from, to, start: performance.now(), dur, hops: hopCount(dur), then }
  }

  const begin = (act: RoamAct): 'raf' | 'sleep' => {
    if (!running || reduce) return 'sleep'
    lastAct = act
    const box = bounds()
    if (act === 'hop' || act === 'perch') {
      const to = act === 'perch' ? findPerch(box) ?? randomClear(box, pos) : randomClear(box, pos)
      speak(act, act === 'perch' ? 0.75 : 0.4)
      goTo(to, act === 'perch' ? 'perch' : null)
      return 'raf'
    }
    if (act === 'peek') {
      const edge = pos.x > window.innerWidth * 0.5 ? 'right' : 'left'
      root.style.setProperty('--vp-peek', edge === 'left' ? '34%' : '-34%')
      speak('peek', 0.7)
      goTo(peekTarget(box, edge, size(), Math.random()), 'peek')
      return 'raf'
    }
    if (act === 'chase') {
      if (performance.now() - pointer.t > 2200) return begin('hop')
      setMove('chase')
      phase = { type: 'chase', until: performance.now() + ROAM_ACT_MS.chase }
      speak('chase', 0.55)
      return 'raf'
    }
    if (act === 'bounce') {
      const dir = Math.random() < 0.5 ? -1 : 1
      setMove('bounce')
      phase = {
        type: 'bounce',
        until: performance.now() + ROAM_ACT_MS.bounce,
        vx: dir * (240 + Math.random() * 120),
        vy: (Math.random() - 0.4) * 220,
        last: performance.now(),
      }
      speak('bounce', 0.45)
      return 'raf'
    }
    setMove(act)
    phase = { type: 'act', act, until: performance.now() + ROAM_ACT_MS[act] }
    speak(act, act === 'nap' || act === 'cheer' ? 0.9 : 0.5)
    return 'sleep'
  }

  const finishGoto = (then: RoamAct | null) => {
    if (then === 'perch' || then === 'peek') {
      if (then === 'peek') {
        face = pos.x < window.innerWidth * 0.5 ? 'right' : 'left'
        root.dataset.face = face
      }
      setMove(then)
      phase = { type: 'act', act: then, until: performance.now() + ROAM_ACT_MS[then] }
      return
    }
    pauseNext()
  }

  const step = (now: number): 'raf' | 'sleep' => {
    // Visual checks pin him in place. Nothing in the product sets this.
    if (root.dataset.shot === '1') return 'sleep'
    if (held()) {
      if (!dragging) setMove('hold')
      phase = { type: 'hold' }
      return 'sleep'
    }
    if (phase.type === 'hold') pauseNext(500)

    if (phase.type === 'pause') {
      if (now - lastActivity > NAP_IDLE_MS && lastAct !== 'nap') return begin('nap')
      if (now < phase.until) return 'sleep'
      const cue = script.shift()
      if (cue === 'idle') {
        pauseNext(1700)
        return 'sleep'
      }
      if (cue === 'hop') return begin('hop')
      if (cue) return begin(cue)
      if (now >= nextVignetteAt) {
        const act = pickVignette(lastVignette)
        lastVignette = act
        nextVignetteAt = now + gapMs()
        return begin(act)
      }
      return begin('hop')
    }

    if (phase.type === 'goto') {
      const t = Math.min(1, (now - phase.start) / phase.dur)
      const eased = smoothstep(t)
      pos = {
        x: lerp(phase.from.x, phase.to.x, eased),
        y: lerp(phase.from.y, phase.to.y, eased),
      }
      apply()
      if (t < 1) return 'raf'
      pos = { ...phase.to }
      apply()
      finishGoto(phase.then)
      return 'raf'
    }

    if (phase.type === 'act') {
      if (now < phase.until) return 'sleep'
      pauseNext()
      return 'sleep'
    }

    if (phase.type === 'chase') {
      const box = bounds()
      const goal = clampPoint({ x: pointer.x - size() * 0.15, y: pointer.y - size() * 1.15 }, box)
      const dx = goal.x - pos.x
      const dy = goal.y - pos.y
      pos = { x: pos.x + dx * 0.09, y: pos.y + dy * 0.09 }
      face = faceForDelta(dx, face)
      apply()
      if (now >= phase.until) pauseNext()
      return 'raf'
    }

    if (phase.type !== 'bounce') return 'sleep'
    const dt = Math.max(0.001, Math.min(0.05, (now - phase.last) / 1000))
    phase.last = now
    const next = bounceStep(pos, { x: phase.vx * dt, y: phase.vy * dt }, bounds())
    pos = next.pos
    phase.vx = next.vel.x / dt
    phase.vy = next.vel.y / dt
    if (next.hit) {
      root.dataset.boing = '1'
      window.clearTimeout(boingTimer)
      boingTimer = window.setTimeout(() => {
        if (root.dataset.boing === '1') delete root.dataset.boing
      }, 150)
    }
    face = faceForDelta(phase.vx, face)
    apply()
    if (now >= phase.until) pauseNext()
    return 'raf'
  }

  const kick = () => {
    if (!running || reduce || document.hidden || raf) return
    raf = requestAnimationFrame(function frame(now: number) {
      raf = 0
      if (!running || reduce || document.hidden) return
      const mode = step(now)
      if (mode === 'raf') {
        raf = requestAnimationFrame(frame)
        return
      }
      const until = phase.type === 'pause' || phase.type === 'act' ? phase.until : performance.now() + 700
      window.clearTimeout(wake)
      wake = window.setTimeout(() => kick(), Math.max(16, until - performance.now()))
    })
  }

  const onPointer = (event: PointerEvent) => {
    pointer.x = event.clientX
    pointer.y = event.clientY
    pointer.t = performance.now()
    lastActivity = pointer.t
  }

  const bump = () => {
    lastActivity = performance.now()
  }

  const onScroll = () => {
    bump()
    const atBottom = nearPageBottom(window.scrollY, window.innerHeight, document.documentElement.scrollHeight)
    if (!atBottom) {
      cheered = false
      return
    }
    if (cheered || reduce || held()) return
    cheered = true
    begin('cheer')
    kick()
  }

  const onResize = () => {
    cachedSize = 0
    readChrome()
    if (reduce) {
      park()
      return
    }
    pos = phase.type === 'goto' && phase.then === 'peek' ? pos : clampPoint(pos, bounds())
    apply()
  }

  const onVis = () => {
    if (document.hidden) {
      hiddenAt = performance.now()
      root.dataset.paused = '1'
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      window.clearTimeout(wake)
      return
    }
    const drift = hiddenAt ? performance.now() - hiddenAt : 0
    hiddenAt = 0
    delete root.dataset.paused
    if (phase.type === 'goto') phase.start += drift
    if (phase.type === 'pause' || phase.type === 'act' || phase.type === 'chase' || phase.type === 'bounce') {
      phase.until += drift
    }
    if (phase.type === 'bounce') phase.last = performance.now()
    lastActivity += drift
    kick()
  }

  const onReduce = () => {
    reduce = reduceMq.matches
    if (reduce) {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      window.clearTimeout(wake)
      park()
      return
    }
    pauseNext(400)
    kick()
  }

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: pos.x, oy: pos.y, lastX: event.clientX, moved: false }
    button.setPointerCapture?.(event.pointerId)
  }

  const onDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 8) return
    if (!drag.moved) {
      dragging = true
      document.body.style.userSelect = 'none'
    }
    drag.moved = true
    event.preventDefault()
    setMove('drag')
    pos = clampPoint({ x: drag.ox + dx, y: drag.oy + dy }, bounds())
    face = faceForDelta(event.clientX - drag.lastX, face)
    drag.lastX = event.clientX
    apply()
  }

  const onUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return
    const moved = drag.moved
    if (moved) {
      suppressClick = true
      window.setTimeout(() => {
        suppressClick = false
      }, 0)
      dragging = false
      document.body.style.userSelect = ''
      lastActivity = performance.now()
      pauseNext(3200)
      kick()
    }
    drag = null
    dragging = false
  }

  const onClickCapture = (event: MouseEvent) => {
    if (!suppressClick) return
    suppressClick = false
    event.preventDefault()
    event.stopPropagation()
  }

  const mo = new MutationObserver(() => {
    if (held()) {
      if (!dragging) setMove('hold')
      phase = { type: 'hold' }
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      return
    }
    if (phase.type === 'hold') pauseNext(420)
    kick()
  })

  readChrome()
  park()
  root.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', onResize, { once: true })
  })
  if (!reduce) {
    phase = { type: 'pause', until: performance.now() + 1600 }
    kick()
  }

  button.addEventListener('pointerdown', onDown)
  button.addEventListener('pointermove', onDrag)
  button.addEventListener('pointerup', onUp)
  button.addEventListener('pointercancel', onUp)
  button.addEventListener('click', onClickCapture, true)
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('keydown', bump)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVis)
  reduceMq.addEventListener('change', onReduce)
  navMq.addEventListener('change', onResize)
  mo.observe(button, { attributes: true, attributeFilter: ['data-react', 'data-mood'] })

  return () => {
    running = false
    if (raf) cancelAnimationFrame(raf)
    window.clearTimeout(wake)
    window.clearTimeout(speechTimer)
    window.clearTimeout(boingTimer)
    mo.disconnect()
    button.removeEventListener('pointerdown', onDown)
    button.removeEventListener('pointermove', onDrag)
    button.removeEventListener('pointerup', onUp)
    button.removeEventListener('pointercancel', onUp)
    button.removeEventListener('click', onClickCapture, true)
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('keydown', bump)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVis)
    reduceMq.removeEventListener('change', onReduce)
    navMq.removeEventListener('change', onResize)
    document.body.style.userSelect = ''
    root.style.transform = ''
    delete root.dataset.ready
    delete root.dataset.move
    delete root.dataset.face
    delete root.dataset.paused
    delete root.dataset.paused
    delete root.dataset.boing
  }
}
