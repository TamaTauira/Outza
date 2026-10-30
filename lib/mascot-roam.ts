/** Viewport roaming for the VibePeep buddy. Pure maths only — the DOM loop lives beside the component. */

export const ROAM_ACTS = [
  'hop',
  'jump',
  'dance',
  'spin',
  'wave',
  'wiggle',
  'peek',
  'nap',
  'cheer',
  'chase',
  'bounce',
  'perch',
] as const

export type RoamAct = (typeof ROAM_ACTS)[number]

/** Random stroll. Nap waits for a long idle, cheer waits for the bottom of the page. */
export const ROAM_POOL: readonly RoamAct[] = [
  'hop',
  'jump',
  'dance',
  'spin',
  'wave',
  'wiggle',
  'peek',
  'bounce',
  'perch',
  'chase',
]

export const ROAM_ACT_MS: Record<RoamAct, number> = {
  hop: 0,
  jump: 1150,
  dance: 2300,
  spin: 1300,
  wave: 1700,
  wiggle: 1600,
  peek: 1900,
  nap: 5400,
  cheer: 1500,
  chase: 1700,
  bounce: 2600,
  perch: 2400,
}

export const ROAM_LINES: Record<RoamAct, readonly string[]> = {
  hop: ['Off I wander.', 'This way looks good.', 'Just a stickybeak.'],
  jump: ['Boing!', 'Up we go.', 'Too easy.'],
  dance: ['Little boogie.', 'Having a dance.', 'This one’s a bop.'],
  spin: ['Full twirl.', 'Watch this.', 'Still dizzy. Worth it.'],
  wave: ["G'day!", 'Over here!', 'Oi, hi!'],
  wiggle: ['Wiggle wiggle.', 'Can’t sit still.', 'Silly mode.'],
  peek: ['Peekaboo.', 'Just looking.', 'Didn’t see me, eh?'],
  nap: ['Just a little nap.', 'Zzz… poke me.', 'Eyes closed. Not really.'],
  cheer: ['Made it. Legend.', 'Bottom of the page. Bonza.', 'You scrolled the lot.'],
  chase: ['Wait for me!', 'Coming through.', 'Oi, slow down.'],
  bounce: ['Boing, walls.', 'Pinball time.', 'Didn’t bounce that hard.'],
  perch: ['Nice spot up here.', 'Good view from here.', 'I’ll sit for a bit.'],
}

/** No clicks and no wandering input for this long, and he has a nap. */
export const NAP_IDLE_MS = 36000

export type Point = { x: number; y: number }
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export function pickRoamAct(last: RoamAct | null, rand: () => number = Math.random): RoamAct {
  const pool = last ? ROAM_POOL.filter((id) => id !== last) : ROAM_POOL
  const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length))
  return pool[index]!
}

export function pickRoamLine(act: RoamAct, rand: () => number = Math.random): string {
  const lines = ROAM_LINES[act]
  const index = Math.min(lines.length - 1, Math.floor(rand() * lines.length))
  return lines[index]!
}

/**
 * Safe box inside the viewport. Stays under the header (and a speech bubble),
 * and above the mobile ticket bar. The map keeps a taller top and bottom gutter.
 */
export function roamBounds(
  vw: number,
  vh: number,
  size: number,
  opts: { mobile: boolean; map: boolean },
): Bounds {
  const top = opts.map ? 168 : 112
  const bottomInset = opts.map ? (opts.mobile ? 176 : 36) : opts.mobile ? 96 : 20
  const side = 8
  const minX = side
  const minY = Math.min(top, Math.max(0, vh - size))
  const maxX = Math.max(minX, vw - size - side)
  const maxY = Math.max(minY, vh - size - bottomInset)
  return { minX, minY, maxX, maxY }
}

export function clampPoint(point: Point, bounds: Bounds): Point {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, point.y)),
  }
}

export function randomPoint(bounds: Bounds, rand: () => number): Point {
  return {
    x: bounds.minX + rand() * (bounds.maxX - bounds.minX),
    y: bounds.minY + rand() * (bounds.maxY - bounds.minY),
  }
}

/** Prefer a point far enough from `from` that the walk actually reads. */
export function destination(bounds: Bounds, from: Point, rand: () => number, minDist: number): Point {
  let best = randomPoint(bounds, rand)
  let bestD = -1
  for (let i = 0; i < 8; i++) {
    const point = randomPoint(bounds, rand)
    const dist = Math.hypot(point.x - from.x, point.y - from.y)
    if (dist > bestD) {
      best = point
      bestD = dist
    }
    if (dist >= minDist) return point
  }
  return best
}

export function peekTarget(bounds: Bounds, edge: 'left' | 'right', size: number, yRand: number): Point {
  const span = Math.max(0, bounds.maxY - bounds.minY)
  const y = bounds.minY + span * Math.min(1, Math.max(0, yRand))
  if (edge === 'left') return { x: -size * 0.58, y }
  return { x: bounds.maxX + size * 0.42, y }
}

export function faceForDelta(dx: number, current: 'left' | 'right'): 'left' | 'right' {
  if (dx < -8) return 'left'
  if (dx > 8) return 'right'
  return current
}

export function moveDuration(distance: number): number {
  return Math.min(2600, Math.max(680, distance / 0.22))
}

export function hopCount(durationMs: number): number {
  return Math.max(2, Math.round(durationMs / 380))
}

/** 0 at the start and end of the walk, negative (up) through each hop. */
export function hopArc(t: number, hops: number): number {
  const n = Math.max(1, Math.round(hops))
  const x = Math.min(1, Math.max(0, t))
  const arc = -Math.abs(Math.sin(x * Math.PI * n))
  return Math.abs(arc) < 1e-10 ? 0 : arc
}

export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function nearPageBottom(scrollY: number, innerH: number, scrollH: number): boolean {
  if (scrollH <= innerH + 48) return false
  return scrollY + innerH >= scrollH - 40
}

/** One integration step. `vel` is already scaled by delta time. */
export function bounceStep(
  pos: Point,
  vel: Point,
  bounds: Bounds,
): { pos: Point; vel: Point; hit: boolean } {
  let x = pos.x + vel.x
  let y = pos.y + vel.y
  let vx = vel.x
  let vy = vel.y
  let hit = false
  if (x < bounds.minX || x > bounds.maxX) {
    vx *= -1
    x = Math.min(bounds.maxX, Math.max(bounds.minX, x))
    hit = true
  }
  if (y < bounds.minY || y > bounds.maxY) {
    vy *= -1
    y = Math.min(bounds.maxY, Math.max(bounds.minY, y))
    hit = true
  }
  return { pos: { x, y }, vel: { x: vx, y: vy }, hit }
}
