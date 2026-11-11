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
import {
  SCROLL_PEEK_MAX_WIDTH,
  SCROLL_PEEK_SETTLE_MS,
  closeButtonBox,
  scrollPeekActive,
  scrollPeekLayout,
} from '@/lib/mascot-scroll-peek'

const BLOCK = 'a, button, input, textarea, select, label, summary, header, nav, [role="button"], [role="link"], [role="tab"], [data-sonner-toaster], .leaflet-control, .leaflet-marker-icon, .se-cluster, .vp-map-float, .vp-map-cards, .vp-map-rail, .vp-map-toolbar, .vp-map-chips, .vp-map-ask, .rounded-xl, .rounded-2xl, p, h1, h2, h3, h4, li'

type Phase =
  | { type: 'pause'; until: number }
  | { type: 'goto'; from: Point; to: Point; start: number; dur: number; hops: number; then: RoamAct | null }
  | { type: 'turn'; until: number; then: RoamAct | null; after: 'walk' | 'land'; to: Point | null }
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
  if (/walkdemo|walkstill/.test(location.search)) document.documentElement.dataset.walkstill = '1'
  const mobileMq = window.matchMedia('(max-width: 639px)')
  const narrowPeekMq = window.matchMedia(`(max-width: ${SCROLL_PEEK_MAX_WIDTH}px)`)
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
  /** Desktop Board stays hidden until the walk-in 3/4 pose is at the start point. */
  let boardPhase: 'wait' | 'out' | 'done' = 'wait'
  const pointer = { x: 0, y: 0, t: 0 }
  let drag: { id: number; x: number; y: number; ox: number; oy: number; lastX: number; moved: boolean } | null = null
  let suppressClick = false
  /** Phone tuck while the page is scrolling. Desktop never sets this. */
  let scrollPeeking = false
  let peekRevealed = false
  let peekIntro = false
  let lastScrollAt: number | null = null
  let lastScrollY = window.scrollY
  let peekFrozen = 0
  let scrollSettleTimer = 0
  let peekHomeTimer = 0
  const peekReadyAt = performance.now() + 1200

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

  const edgeGap = () => {
    const bar = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
    return mobileMq.matches ? 12 : bar + 12
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
    const gutter = edgeGap()
    const insetX = Math.max(base.minX, 12)
    const insetMaxX = Math.max(insetX, fullW - box.width - 4 - gutter)
    const insetMinY = Math.max(base.minY, 16)
    let lane: Bounds = { ...base, minX: insetX, maxX: Math.min(base.maxX, insetMaxX), minY: insetMinY }
    if (map) {
      const stage = document.querySelector<HTMLElement>('.vp-map-stage')
      const rect = stage?.getBoundingClientRect()
      if (rect && rect.width >= 48 && rect.height >= 48) {
        const dock = Number.parseFloat(getComputedStyle(stage!).getPropertyValue('--vp-map-dock')) || 0
        const crowded = rect.height < box.height + dock + 160
        const minX = Math.max(insetX, rect.left + (crowded ? 8 : 24))
        const minY = Math.max(insetMinY, rect.top + (crowded ? 36 : mobile ? 48 : 120))
        const maxX = Math.max(minX, Math.min(insetMaxX, rect.right - box.width - (crowded ? 48 : 72)))
        const maxY = Math.max(minY, rect.bottom - box.height - dock - (crowded ? 12 : 96))
        lane = { minX, minY, maxX, maxY }
      }
    }
    if (mobile && location.pathname.startsWith('/local')) {
      const grid = document.querySelector<HTMLElement>('.vp-local-grid')
      const ceiling = grid?.getBoundingClientRect().top ?? 0
      if (ceiling > 80) {
        const floor = introFloor(ceiling)
        const minY = Math.max(lane.minY, floor + 5)
        const maxY = ceiling - box.height - 1
        if (minY <= maxY) lane = { ...lane, minY, maxY }
      }
    }
    if (!mobile && !map && location.pathname.startsWith('/local')) {
      const grid = document.querySelector<HTMLElement>('.vp-local-grid')
      const listBtn = Array.from(document.querySelectorAll('button')).find((el) => /list your thing free/i.test(el.textContent || '') && !el.closest('.vp-local-grid'))
      const edge = Math.max(grid?.getBoundingClientRect().right ?? 0, listBtn?.getBoundingClientRect().right ?? 0)
      const gutterX = edge + 12
      if (edge > 80 && gutterX <= lane.maxX) {
        let maxY = lane.maxY
        for (const el of document.querySelectorAll('button, a, h1, h2, h3')) {
          if (!(el instanceof HTMLElement) || el.closest('.vp-roam')) continue
          const rect = el.getBoundingClientRect()
          if (rect.width < 8 || rect.height < 8 || rect.right < gutterX + 8) continue
          const topLimit = rect.top - box.height - 8
          if (topLimit > lane.minY + 8) maxY = Math.min(maxY, topLimit)
        }
        lane = { ...lane, minX: Math.max(lane.minX, gutterX), maxY: Math.max(lane.minY, maxY) }
      } else if (grid) {
        const next30 = Array.from(document.querySelectorAll('button')).find((el) => /next 30 days/i.test(el.textContent || ''))
        const top = grid.getBoundingClientRect().top
        const minX = Math.max(lane.minX, next30 ? next30.getBoundingClientRect().right + 12 : lane.minX)
        const maxY = Math.min(lane.maxY, top - box.height - 8)
        if (minX <= lane.maxX && maxY >= lane.minY) lane = { ...lane, minX, maxY: Math.max(lane.minY, maxY) }
      }
    }
    return lane
  }

  const setMove = (move: string) => {
    if (root.dataset.move !== move) root.dataset.move = move
  }

  const skipPeek = () =>
    root.dataset.showoff === '1' ||
    root.dataset.closeup === '1' ||
    /(?:^|[?&])(peepclose|peepshow|peepdrive|walkstill|walkdemo)=1/.test(location.search)

  const writePeekShift = () => {
    const width = size()
    const rig = root.querySelector<HTMLElement>('.vp-rig')
    const height = rig && rig.clientHeight > 8 ? rig.clientHeight : width * (1092 / 763)
    const layout = scrollPeekLayout({
      x: pos.x,
      y: pos.y,
      width,
      height,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      close: closeButtonBox(width, height),
    })
    root.style.setProperty('--vp-peek-dx', `${layout.slotDx.toFixed(1)}px`)
    root.style.setProperty('--vp-peek-dy', `${layout.slotDy.toFixed(1)}px`)
    root.style.setProperty('--vp-close-dx', `${layout.closeDx.toFixed(1)}px`)
    root.style.setProperty('--vp-close-dy', `${layout.closeDy.toFixed(1)}px`)
  }

  const clearPeekShift = () => {
    root.style.setProperty('--vp-peek-dx', '0px')
    root.style.setProperty('--vp-peek-dy', '0px')
    root.style.setProperty('--vp-close-dx', '0px')
    root.style.setProperty('--vp-close-dy', '0px')
  }

  const shiftPeekClock = (drift: number) => {
    if (drift <= 0) return
    if (phase.type === 'goto') phase.start += drift
    if (phase.type === 'pause' || phase.type === 'act' || phase.type === 'chase' || phase.type === 'bounce' || phase.type === 'turn') {
      phase.until += drift
    }
    if (phase.type === 'bounce') phase.last += drift
    lastActivity += drift
    nextVignetteAt += drift
  }

  const peekNow = () =>
    !skipPeek() &&
    scrollPeekActive({
      width: narrowPeekMq.matches ? Math.min(window.innerWidth, SCROLL_PEEK_MAX_WIDTH) : window.innerWidth,
      atBottom: nearPageBottom(window.scrollY, window.innerHeight, Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)),
      revealed: peekRevealed,
      msSinceScroll: lastScrollAt == null ? null : performance.now() - lastScrollAt,
    })

  const armPeekSettle = () => {
    window.clearTimeout(scrollSettleTimer)
    const elapsed = lastScrollAt == null ? 0 : performance.now() - lastScrollAt
    const wait = Math.max(40, SCROLL_PEEK_SETTLE_MS - elapsed + 30)
    scrollSettleTimer = window.setTimeout(() => {
      syncScrollPeek()
      if (scrollPeeking) armPeekSettle()
    }, wait)
  }

  const syncScrollPeek = () => {
    const want = peekNow()
    if (want) {
      window.clearTimeout(peekHomeTimer)
      if (!scrollPeeking) {
        peekFrozen = performance.now()
        scrollPeeking = true
        peekIntro = !reduce
        root.dataset.scrollPeek = '1'
        root.style.setProperty('--vp-peek-ms', reduce ? '0ms' : '420ms')
        root.style.setProperty('--vp-peek-ease', 'cubic-bezier(0.22, 0.8, 0.2, 1)')
        clearPeekShift()
        if (reduce) {
          peekIntro = false
          writePeekShift()
        } else {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              peekIntro = false
              if (scrollPeeking) writePeekShift()
            })
          })
        }
      } else if (!peekIntro) {
        writePeekShift()
      }
      return
    }
    if (!scrollPeeking && root.dataset.scrollPeek !== '1') return
    const wasPeeking = scrollPeeking
    scrollPeeking = false
    peekIntro = false
    if (wasPeeking && peekFrozen) {
      shiftPeekClock(performance.now() - peekFrozen)
      peekFrozen = 0
    }
    if (reduce) {
      delete root.dataset.scrollPeek
      clearPeekShift()
      kick()
      return
    }
    root.style.setProperty('--vp-peek-ms', '240ms')
    root.style.setProperty('--vp-peek-ease', 'cubic-bezier(0.34, 1.25, 0.64, 1)')
    clearPeekShift()
    window.clearTimeout(peekHomeTimer)
    peekHomeTimer = window.setTimeout(() => {
      if (scrollPeeking) return
      delete root.dataset.scrollPeek
      kick()
    }, 260)
  }

  const apply = () => {
    root.style.transform = `translate3d(${Math.min(pos.x, window.innerWidth - size() - 8).toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`
    if (root.dataset.face !== face) root.dataset.face = face
    const side = pos.x + size() / 2 > window.innerWidth * 0.5 ? 'start' : 'center'
    if (slot.dataset.bubble !== side) slot.dataset.bubble = side
    if (scrollPeeking && !peekIntro) writePeekShift()
  }

  /** Lowest control above `ceiling` on Local, so the figure can sit in the gap under the filters. */
  const introFloor = (ceiling: number) => {
    let floor = 0
    for (const el of document.querySelectorAll('main header, main h1, main button, main a, main select, main input')) {
      if (!(el instanceof HTMLElement) || el.closest('.vp-roam') || el.closest('.vp-local-grid')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 8 || r.bottom > ceiling - 4) continue
      floor = Math.max(floor, r.bottom)
    }
    return floor
  }

  const coversCopy = (x: number, y: number) => {
    const s = size()
    const h = Math.max(s, figure().height)
    const onMap = location.pathname.startsWith('/map')
    // The dismiss control sits above the rig: 44px target, 10px gap, plus 24% for the highest reach.
    const lift = 44 + 10 + h * 0.24
    const boxes = [
      { left: x, top: y, right: x + s, bottom: y + h },
      { left: x + s - 46, top: y - lift - 2, right: x + s + 4, bottom: y - lift + 48 },
    ]
    const pad = 8
    const gapFor = (el: Element) =>
      el.matches('.leaflet-marker-icon, .leaflet-control, .se-cluster, .vp-map-float, .vp-map-ask, .vp-map-cards, .vp-map-toolbar') ? 32 : pad
    // Phone Map only: the speech bubble has to stay 16px off pins and clusters.
    // It is not part of the figure box, so a line was landing on a cluster.
    let bubbleBox: { left: number; top: number; right: number; bottom: number } | null = null
    if (onMap && mobileMq.matches) {
      const live = root.querySelector<HTMLElement>('.vp-bubble')
      const shown = !!live && !!live.textContent && getComputedStyle(live).opacity !== '0'
      if (shown && live) {
        const r = live.getBoundingClientRect()
        if (r.width > 2 && r.height > 2) {
          const dx = x - pos.x
          const dy = y - pos.y
          bubbleBox = { left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy }
        }
      } else {
        const bw = Math.min(115, window.innerWidth * 0.46)
        const bh = 64
        const top = y + 34
        const onLeft = x + s / 2 > window.innerWidth * 0.5
        bubbleBox = onLeft
          ? { left: x - 8 - bw, top, right: x - 8, bottom: top + bh }
          : { left: x + s + 8, top, right: x + s + 8 + bw, bottom: top + bh }
      }
    }
    const hitsBubble = (r: DOMRect) => {
      if (!bubbleBox) return false
      const gap = 16
      const b = bubbleBox
      return !(b.right < r.left - gap || b.left > r.right + gap || b.bottom < r.top - gap || b.top > r.bottom + gap)
    }
    const hard = document.querySelectorAll('main > section.rounded-2xl, .vp-hero-clock, header.vp-site-header, .vp-local-grid, .vp-map-ask, .vp-map-cards, .vp-map-float')
    for (const el of hard) {
      if (!(el instanceof HTMLElement) || el.closest('.vp-roam')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 12 || r.height < 10) continue
      for (const b of boxes) {
        const gap = gapFor(el)
        if (!(b.right < r.left - gap || b.left > r.right + gap || b.bottom < r.top - gap || b.top > r.bottom + gap)) return true
      }
    }
    const nodes = document.querySelectorAll(BLOCK)
    const textEl = 'p, h1, h2, h3, h4, li'
    for (const el of nodes) {
      if (!(el instanceof HTMLElement) || el.closest('.vp-roam')) continue
      let rects: DOMRect[] = []
      if (el.matches('h1, h2, h3, h4') && !location.pathname.startsWith('/map')) {
        const full = el.getBoundingClientRect()
        if (full.width > window.innerWidth * 0.7 && full.height > 8) rects = [full]
      }
      if (!rects.length && el.matches(textEl)) {
        const range = document.createRange()
        range.selectNodeContents(el)
        rects = Array.from(range.getClientRects()).filter((r) => r.width > 8 && r.height > 8)
      }
      if (!rects.length) {
        const r = el.getBoundingClientRect()
        if (r.width < 12 || r.height < 10) continue
        if (r.width > window.innerWidth * 0.92 && r.height > 180 && !el.matches('.vp-map-ask, .vp-local-grid, .vp-hero-clock')) continue
        rects = [r]
      }
      for (const r of rects) {
        if (el.matches('.leaflet-marker-icon, .se-cluster') && hitsBubble(r)) return true
        for (const b of boxes) {
          const gap = gapFor(el)
          if (!(b.right < r.left - gap || b.left > r.right + gap || b.bottom < r.top - gap || b.top > r.bottom + gap)) return true
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

  const desktopBoard = () => !mobileMq.matches && (location.pathname === '/' || location.pathname === '')

  /** One spot on desktop Board: centred in the Hot right now row, × on screen, clear of the feature link. */
  const boardSpot = (): Point | null => {
    if (!desktopBoard()) return null
    const feature = document.querySelector('[aria-label="Hot right now"] a')
    const row = feature?.parentElement
    if (!(feature instanceof HTMLElement) || !(row instanceof HTMLElement)) return null
    if (!/feature your event/i.test(feature.textContent || '')) return null
    const fr = feature.getBoundingClientRect()
    const rr = row.getBoundingClientRect()
    if (fr.width < 8 || rr.height < 8) return null
    return { x: 1048, y: 284 }
  }

  const pinBoard = () => {
    const fixed = boardSpot()
    if (!fixed) return false
    pos = fixed
    face = 'right'
    root.dataset.ready = '1'
    setMove('still')
    apply()
    return true
  }

  const figureHeight = () => {
    const rig = root.querySelector<HTMLElement>('.vp-rig')
    if (rig && rig.clientHeight > 8) return rig.clientHeight
    return size() * (1092 / 763)
  }
  const stridePx = () => 0.55 * figureHeight()
  const STEP_MS = 420

  const walkTo = (target: Point) => {
    if (desktopBoard() && boardPhase !== 'wait') return
    if (!decoded) {
      requestAnimationFrame(() => {
        if (running) walkTo(target)
      })
      return
    }
    const rig = root.querySelector<HTMLElement>('.vp-rig')
    if (!rig || rig.clientHeight < 40) {
      requestAnimationFrame(() => {
        if (running) walkTo(target)
      })
      return
    }
    const stride = Math.max(24, stridePx())
    let start: Point
    if (desktopBoard()) {
      start = { x: Math.max(8, target.x - stride * 4), y: target.y }
      if (Math.abs(start.x - target.x) < stride) {
        requestAnimationFrame(() => {
          if (running) walkTo(target)
        })
        return
      }
    } else {
      const box = bounds()
      const left = clampPoint({ x: target.x - stride * 4, y: target.y }, box)
      const right = clampPoint({ x: target.x + stride * 4, y: target.y }, box)
      start = Math.abs(left.x - target.x) >= Math.abs(right.x - target.x) ? left : right
    }
    pos = start
    face = target.x >= start.x ? 'right' : 'left'
    root.dataset.face = face
    root.dataset.turn = '1'
    root.dataset.ready = '1'
    setMove('still')
    apply()
    if (desktopBoard()) boardPhase = 'out'
    show()
    phase = { type: 'turn', until: performance.now() + 110, then: null, after: 'walk', to: target }
    kick()
  }

  const park = () => {
    const params = new URLSearchParams(location.search)
    if (params.get('peepclose') === '1' || params.get('peepshow') === '1' || params.get('peepdrive') === '1') {
      root.dataset.ready = '1'
      return
    }
    if (desktopBoard()) {
      let tries = 0
      const retry = () => {
        if (!running || tries++ > 90) return
    if (reduce) {
      boardPhase = 'done'
      if (!pinBoard()) requestAnimationFrame(retry)
      else show()
      return
    }
        const spot = boardSpot()
        if (!spot) {
          requestAnimationFrame(retry)
          return
        }
        walkTo(spot)
      }
      retry()
      return
    }
    const box = bounds()
    const s = size()
    const gutter = edgeGap()
    const maxX = Math.max(box.minX, Math.min(box.maxX, window.innerWidth - s - 4 - gutter))
    let spot: Point | null = null
    const path = location.pathname
    const rigH = () => {
      const rig = root.querySelector<HTMLElement>('.vp-rig')
      if (rig && rig.clientHeight > 8) return rig.clientHeight
      return s * (1092 / 763)
    }
    const place = (x: number, y: number) => {
      const px = Math.max(box.minX, Math.min(maxX, x))
      const py = Math.max(box.minY, Math.min(box.maxY, y))
      if (!coversCopy(px, py)) {
        spot = { x: px, y: py }
        return true
      }
      return false
    }
    if (mobileMq.matches && path === '/') {
      const hero = document.querySelector('main > section.rounded-2xl')
      const hot = Array.from(document.querySelectorAll('h2')).find((el) => /hot right now/i.test(el.textContent || ''))
      const x = window.innerWidth - s - 4 - 12
      const h = rigH()
      let y = hero ? hero.getBoundingClientRect().bottom + 14 : box.minY
      if (hot) {
        const cap = hot.getBoundingClientRect().top - h - 10
        if (y > cap) y = cap
        if (hero && y < hero.getBoundingClientRect().bottom + 14) y = hero.getBoundingClientRect().bottom + 14
      }
      if (!place(x, y)) {
        for (let yy = y; yy <= y + 120; yy += 2) {
          if (place(x, yy)) break
        }
      }
    } else if (mobileMq.matches && path.startsWith('/local')) {
      const grid = document.querySelector('.vp-local-grid')
      const ceiling = grid?.getBoundingClientRect().top ?? 0
      const h = rigH()
      const x = Math.max(box.minX, Math.min(maxX, window.innerWidth - s - 4 - 16))
      if (ceiling > 80) {
        const y = Math.min(ceiling - h - 1, Math.max(box.minY, introFloor(ceiling) + 5))
        if (y >= introFloor(ceiling) + 4 && y + h <= ceiling - 1) spot = { x, y }
      }
      if (!spot) {
        let y = box.minY
        const heading = document.querySelector('main h1')
        if (heading) y = Math.max(y, heading.getBoundingClientRect().bottom + 16)
        for (let yy = y; yy <= box.maxY; yy += 12) {
          if (!coversCopy(x, yy)) {
            spot = { x, y: yy }
            break
          }
        }
      }
    } else if (!mobileMq.matches && path.startsWith('/local')) {
      const listBtn = Array.from(document.querySelectorAll('button')).find((el) => /list your thing free/i.test(el.textContent || '') && !el.closest('.vp-local-grid'))
      const next30 = Array.from(document.querySelectorAll('button')).find((el) => /next 30 days/i.test(el.textContent || ''))
      const h = rigH()
      if (listBtn) {
        const r = listBtn.getBoundingClientRect()
        place(r.right + 12, r.top + (r.height - h) / 2)
      }
      if (!spot && next30) {
        const r = next30.getBoundingClientRect()
        place(r.right + 12, r.bottom - h)
      }
    }
    if (spot && mobileMq.matches && path === '/' && !reduce) {
      walkTo(spot)
      return
    }
    pos = spot ?? firstClear({ ...box, maxX })
    face = 'right'
    root.dataset.ready = '1'
    root.dataset.placed = '1'
    setMove('still')
    apply()
  }

  const say = (line: string) => {
    if (reduce || button.hasAttribute('data-react') || button.getAttribute('data-mood') === 'sulk') return
    bubble.textContent = line
    live.textContent = line
    button.setAttribute('data-line', '1')
    window.requestAnimationFrame(() => {
      const box = bubble.getBoundingClientRect()
      if (box.width < 4) return
      const blocked = [...document.querySelectorAll('button, a, input, select, .rounded-xl, .rounded-2xl')].some((el) => {
        if (!(el instanceof HTMLElement) || el.closest('.vp-roam')) return false
        const rect = el.getBoundingClientRect()
        if (rect.width < 8 || rect.height < 8) return false
        return box.right > rect.left && box.left < rect.right && box.bottom > rect.top && box.top < rect.bottom
      })
      const margin = 8
      let shiftX = 0
      let shiftY = 0
      if (box.left < margin) shiftX = margin - box.left
      if (box.right > window.innerWidth - margin) shiftX = window.innerWidth - margin - box.right
      if (box.top < margin) shiftY = margin - box.top
      if (box.bottom > window.innerHeight - margin) shiftY = window.innerHeight - margin - box.bottom
      if (blocked) root.dataset.bub = root.dataset.bub === 'up' ? 'down' : 'up'
      if (mobileMq.matches) {
        const close = root.querySelector('.vp-buddy-min')?.getBoundingClientRect()
        if (close && box.right > close.left && box.left < close.right && box.bottom > close.top && box.top < close.bottom) {
          shiftY += close.bottom + 6 - box.top
        }
      }
      const shiftAcross = mobileMq.matches ? `${shiftX.toFixed(0)}px` : `calc(-50% + ${shiftX.toFixed(0)}px)`
      bubble.style.translate = `${shiftAcross} ${shiftY.toFixed(0)}px`
      if (mobileMq.matches && location.pathname.startsWith('/map') && !spotClear(pos.x, pos.y)) {
        pos = firstClear(bounds())
        apply()
      }
    })
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
    if (desktopBoard()) {
      if (boardPhase !== 'done') return
      pos = { x: 1048, y: 284 }
      apply()
      setMove('still')
    } else if (!spotClear(pos.x, pos.y)) {
      pos = firstClear(bounds())
      apply()
    }
    if (!desktopBoard()) setMove('idle')
    phase = { type: 'pause', until: performance.now() + wait }
  }

  const goTo = (to: Point, then: RoamAct | null, skipTurn = false) => {
    const from = { ...pos }
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.hypot(dx, dy)
    if (Math.abs(dx) < 8) {
      pos = to
      apply()
      setMove('idle')
      phase = { type: 'pause', until: performance.now() + 500 }
      return
    }
    const stride = Math.max(24, stridePx())
    const speed = stride / (STEP_MS / 1000)
    const strides = Math.max(3, Math.round(dist / stride))
    const dur = Math.max(1500, strides * STEP_MS, (dist / speed) * 1000)
    root.style.setProperty('--vp-step', `${STEP_MS}ms`)
    root.style.setProperty('--vp-cycle', `${STEP_MS * 2}ms`)
    root.style.setProperty('--vp-cross', `${(stride * 4).toFixed(1)}px`)
    root.style.setProperty('--vp-walk', `${4 * STEP_MS}ms`)
    face = dx < 0 ? 'left' : 'right'
    root.dataset.face = face
    const startMove = () => {
      if (!running) return
      delete root.dataset.turn
      setMove('hop')
      phase = { type: 'goto', from, to, start: performance.now(), dur, hops: strides, then }
      kick()
    }
    if (skipTurn) {
      startMove()
      return
    }
    root.dataset.turn = '1'
    setMove('still')
    phase = { type: 'turn', until: performance.now() + 110, then, after: 'walk', to }
  }

  const begin = (act: RoamAct): 'raf' | 'sleep' => {
    if (!running || reduce) return 'sleep'
    if (desktopBoard() && (act === 'hop' || act === 'perch' || act === 'peek' || act === 'bounce' || act === 'chase')) {
      if (boardPhase !== 'done') return 'sleep'
      pos = { x: 1048, y: 284 }
      apply()
      setMove('still')
      phase = { type: 'pause', until: performance.now() + 4000 }
      return 'sleep'
    }
    lastAct = act
    const box = bounds()
    if (act === 'hop' || act === 'perch') {
      const pathClear = (from: Point, to: Point) => {
        const steps = Math.max(4, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 16))
        for (let i = 0; i <= steps; i++) {
          const t = i / steps
          if (!spotClear(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)) return false
        }
        return true
      }
      let to = act === 'perch' ? findPerch(box) ?? randomClear(box, pos) : randomClear(box, pos)
      const minTravel = stridePx() * 3.5
      if (Math.hypot(to.x - pos.x, to.y - pos.y) < minTravel) {
        const dir = to.x >= pos.x ? 1 : -1
        to = clampPoint({ x: pos.x + dir * minTravel, y: pos.y }, box)
      }
      if (!pathClear(pos, to)) to = firstClear(box)
      if (!pathClear(pos, to)) {
        pauseNext(1400)
        return 'sleep'
      }
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
    root.dataset.turn = '1'
    setMove('still')
    phase = { type: 'turn', until: performance.now() + 110, then, after: 'land', to: null }
  }

  const step = (now: number): 'raf' | 'sleep' => {
    // Visual checks pin him in place. Nothing in the product sets this.
    if (root.dataset.shot === '1') return 'sleep'
    if (new URLSearchParams(location.search).get('peepclose') === '1' || new URLSearchParams(location.search).get('peepshow') === '1' || new URLSearchParams(location.search).get('peepdrive') === '1') {
      return 'sleep'
    }
    if (scrollPeeking || root.dataset.scrollPeek === '1') return 'sleep'
    if (phase.type === 'turn') {
      if (now < phase.until) return 'raf'
      delete root.dataset.turn
      if (phase.after === 'walk' && phase.to) {
        goTo(phase.to, phase.then, true)
        return 'raf'
      }
      if (phase.then === 'perch' || phase.then === 'peek') {
        if (phase.then === 'peek') {
          face = pos.x < window.innerWidth * 0.5 ? 'right' : 'left'
          root.dataset.face = face
        }
        setMove(phase.then)
        phase = { type: 'act', act: phase.then, until: performance.now() + ROAM_ACT_MS[phase.then] }
        return 'sleep'
      }
      if (desktopBoard()) {
        boardPhase = 'done'
        pos = { x: 1048, y: 284 }
        apply()
      }
      pauseNext()
      return 'sleep'
    }
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
      if (location.pathname.startsWith('/map') && !spotClear(pos.x, pos.y)) {
        pos = firstClear(bounds())
        apply()
        setMove('still')
        phase = { type: 'pause', until: now + 700 }
        return 'sleep'
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
      const nx = pos.x + dx * 0.09
      const ny = pos.y + dy * 0.09
      if (!coversCopy(nx, ny)) pos = { x: nx, y: ny }
      else if (!coversCopy(nx, pos.y)) pos = { x: nx, y: pos.y }
      else if (!coversCopy(pos.x, ny)) pos = { x: pos.x, y: ny }
      face = faceForDelta(dx, face)
      apply()
      if (now >= phase.until) pauseNext()
      return 'raf'
    }

    if (phase.type !== 'bounce') return 'sleep'
    const dt = Math.max(0.001, Math.min(0.05, (now - phase.last) / 1000))
    phase.last = now
    const next = bounceStep(pos, { x: phase.vx * dt, y: phase.vy * dt }, bounds())
    if (!coversCopy(next.pos.x, next.pos.y)) pos = next.pos
    else if (!coversCopy(next.pos.x, pos.y)) pos = { x: next.pos.x, y: pos.y }
    else if (!coversCopy(pos.x, next.pos.y)) pos = { x: pos.x, y: next.pos.y }
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
    const y = window.scrollY
    const delta = Math.abs(y - lastScrollY)
    lastScrollY = y
    if (delta >= 2 && performance.now() >= peekReadyAt && !skipPeek() && narrowPeekMq.matches) {
      peekRevealed = false
      lastScrollAt = performance.now()
      syncScrollPeek()
      armPeekSettle()
    }
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
    if (!narrowPeekMq.matches && (scrollPeeking || root.dataset.scrollPeek === '1')) {
      scrollPeeking = false
      peekIntro = false
      peekFrozen = 0
      delete root.dataset.scrollPeek
      clearPeekShift()
    }
    if (desktopBoard()) {
      if (boardPhase === 'done') pinBoard()
      return
    }
    if (reduce) {
      park()
      syncScrollPeek()
      return
    }
    pos = phase.type === 'goto' && phase.then === 'peek' ? pos : clampPoint(pos, bounds())
    apply()
    syncScrollPeek()
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
    if (phase.type === 'pause' || phase.type === 'act' || phase.type === 'chase' || phase.type === 'bounce' || phase.type === 'turn') {
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

  const onPeekUp = (event: PointerEvent) => {
    if (event.button !== 0 || !scrollPeeking) return
    peekRevealed = true
    syncScrollPeek()
  }

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (root.dataset.scrollPeek === '1') return
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

  const settle = () => {
    if (!running || dragging || scrollPeeking) return
    if (phase.type === 'goto' || phase.type === 'turn' || phase.type === 'bounce' || phase.type === 'chase') return
    if (desktopBoard()) {
      if (boardPhase !== 'done') return
      pinBoard()
      return
    }
    if (!coversCopy(pos.x, pos.y)) return
    park()
  }

  let decoded = false
  const show = () => {
    if (!decoded || root.dataset.ready !== '1') return
    const demo = /peepclose|peepshow|peepdrive/.test(location.search)
    if (!demo && desktopBoard() && !reduce && boardPhase === 'wait') return
    root.dataset.placed = '1'
  }
  readChrome()
  const imgs = [...root.querySelectorAll('img')]
  void Promise.all(imgs.map((img) => (img.decode ? img.decode().catch(() => undefined) : Promise.resolve()))).then(() => {
    decoded = true
    root.dataset.loaded = '1'
    if (root.dataset.ready !== '1') park()
    show()
  })
  park()
  show()
  const settleA = window.setTimeout(settle, 400)
  const settleB = window.setTimeout(settle, 1400)
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
  button.addEventListener('pointerup', onPeekUp)
  button.addEventListener('pointercancel', onUp)
  button.addEventListener('click', onClickCapture, true)
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('keydown', bump)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVis)
  reduceMq.addEventListener('change', onReduce)
  navMq.addEventListener('change', onResize)
  narrowPeekMq.addEventListener('change', onResize)
  mo.observe(button, { attributes: true, attributeFilter: ['data-react', 'data-mood'] })

  let pinTimer = 0
  const shoveOffPins = () => {
    if (!running || dragging || desktopBoard()) return
    if (!location.pathname.startsWith('/map')) return
    if (!spotClear(pos.x, pos.y)) {
      pos = firstClear(bounds())
      apply()
      // A hop that was already underway would interpolate back through the pin.
      if (phase.type === 'goto' || phase.type === 'bounce' || phase.type === 'chase') {
        delete root.dataset.turn
        setMove('still')
        phase = { type: 'pause', until: performance.now() + 700 }
      }
    }
  }
  const pinWatch = new MutationObserver((records) => {
    if (!location.pathname.startsWith('/map') || dragging || desktopBoard()) return
    const moved = records.some((record) => record.target instanceof Element && !record.target.closest('.vp-roam'))
    if (!moved) return
    window.clearTimeout(pinTimer)
    pinTimer = window.setTimeout(shoveOffPins, 160)
  })
  let pinPoll = 0
  if (location.pathname.startsWith('/map')) {
    pinWatch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'transform'] })
    pinPoll = window.setInterval(shoveOffPins, 400)
  }

  return () => {
    running = false
    window.clearTimeout(settleA)
    window.clearTimeout(settleB)
    if (raf) cancelAnimationFrame(raf)
    window.clearTimeout(wake)
    window.clearTimeout(speechTimer)
    window.clearTimeout(boingTimer)
    window.clearTimeout(scrollSettleTimer)
    window.clearTimeout(peekHomeTimer)
    mo.disconnect()
    pinWatch.disconnect()
    window.clearTimeout(pinTimer)
    window.clearInterval(pinPoll)
    button.removeEventListener('pointerdown', onDown)
    button.removeEventListener('pointermove', onDrag)
    button.removeEventListener('pointerup', onUp)
    button.removeEventListener('pointerup', onPeekUp)
    button.removeEventListener('pointercancel', onUp)
    button.removeEventListener('click', onClickCapture, true)
    window.removeEventListener('pointermove', onPointer)
    window.removeEventListener('keydown', bump)
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVis)
    reduceMq.removeEventListener('change', onReduce)
    navMq.removeEventListener('change', onResize)
    narrowPeekMq.removeEventListener('change', onResize)
    document.body.style.userSelect = ''
    root.style.transform = ''
    delete root.dataset.scrollPeek
    root.style.removeProperty('--vp-peek-dx')
    root.style.removeProperty('--vp-peek-dy')
    root.style.removeProperty('--vp-close-dx')
    root.style.removeProperty('--vp-close-dy')
    root.style.removeProperty('--vp-peek-ms')
    root.style.removeProperty('--vp-peek-ease')
    delete root.dataset.ready
    delete root.dataset.move
    delete root.dataset.face
    delete root.dataset.paused
    delete root.dataset.paused
    delete root.dataset.boing
  }
}
