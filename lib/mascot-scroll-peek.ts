/**
 * Phone tuck. While a narrow viewport is scrolling, the rig slides to the
 * nearer screen edge until only the antenna and the eyes are in the gutter.
 * The whole figure moves together, so the antenna stays on his head.
 * Desktop (wider than SCROLL_PEEK_MAX_WIDTH) never tucks.
 */

/** Matches a max-width media query. 768px and up stay as they are. */
export const SCROLL_PEEK_MAX_WIDTH = 767

/** He stays tucked until the scroll has been still for about a second. */
export const SCROLL_PEEK_SETTLE_MS = 1000

/**
 * Page padding is 1rem (`px-4`). The visible slice has to fit in that gutter
 * or he covers the ends of lines. Phone width is 3.27rem, so the slice is
 * 0.28 × 3.27 = 0.92rem.
 *
 * The box is the centre of the rig: the antenna (0.416–0.587) and the inner
 * part of both eyes. Measured from the body art, the left eye reaches 0.470
 * and the right eye starts at 0.614.
 */
export const SCROLL_PEEK_WINDOW = { left: 0.36, right: 0.64, top: 0, bottom: 0.5 } as const

/** The dismiss control. Same numbers as `.vp-buddy-min` in the roam CSS. */
export const CLOSE_BUTTON = { size: 44, gap: 10, lift: 0.24 } as const

/** Clearance so the dismiss control never sits on the peeking face. */
export const CLOSE_CLEARANCE = 8

const SCREEN_MARGIN = 4

export function scrollPeekActive(input: {
  width: number
  atBottom: boolean
  revealed: boolean
  /** Null until the reader has actually scrolled. */
  msSinceScroll: number | null
  settleMs?: number
}): boolean {
  if (input.width > SCROLL_PEEK_MAX_WIDTH) return false
  if (input.atBottom || input.revealed) return false
  if (input.msSinceScroll == null) return false
  return input.msSinceScroll < (input.settleMs ?? SCROLL_PEEK_SETTLE_MS)
}

/** Clip that leaves the antenna-and-eyes window. `none` is the full figure. */
export function scrollPeekClip(window = SCROLL_PEEK_WINDOW): string {
  const pct = (n: number) => `${Number((n * 100).toFixed(2))}%`
  const top = window.top
  const right = 1 - window.right
  const bottom = 1 - window.bottom
  const left = window.left
  return `inset(${pct(top)} ${pct(right)} ${pct(bottom)} ${pct(left)})`
}

export function closeButtonBox(width: number, height: number) {
  const size = CLOSE_BUTTON.size
  return {
    left: width - size,
    top: -(size + CLOSE_BUTTON.gap + height * CLOSE_BUTTON.lift),
    width: size,
    height: size,
  }
}

export type PeekRect = { left: number; top: number; right: number; bottom: number }

export type ScrollPeekLayout = {
  edge: 'left' | 'right'
  slotDx: number
  slotDy: number
  closeDx: number
  closeDy: number
  window: PeekRect
  close: PeekRect
}

function gapBetween(a: PeekRect, b: PeekRect): number {
  const dx = Math.max(a.left - b.right, b.left - a.right)
  const dy = Math.max(a.top - b.bottom, b.top - a.bottom)
  if (dx < 0 && dy < 0) return Math.max(dx, dy)
  if (dx < 0) return dy
  if (dy < 0) return dx
  return Math.hypot(dx, dy)
}

/**
 * Slide the rig toward the nearer side so the antenna-and-eyes window sits
 * flush in the screen gutter. The dismiss control moves on its own so it
 * stays fully on screen and clear of that window.
 */
export function scrollPeekLayout(input: {
  x: number
  y: number
  width: number
  height: number
  viewportW: number
  viewportH: number
  close: { left: number; top: number; width: number; height: number }
  /** Text starts this far in from each side. The window must fit inside it. */
  gutter?: number
}): ScrollPeekLayout {
  const gutter = input.gutter ?? 16
  const win = SCROLL_PEEK_WINDOW
  const winLeftLocal = win.left * input.width
  const winRightLocal = win.right * input.width
  const winTopLocal = win.top * input.height
  const winBottomLocal = win.bottom * input.height
  const edge: 'left' | 'right' = input.x + input.width / 2 < input.viewportW / 2 ? 'left' : 'right'

  let slotDx = edge === 'right'
    ? input.viewportW - (input.x + winRightLocal)
    : 0 - (input.x + winLeftLocal)
  let slotDy = 0

  const winTop = () => input.y + slotDy + winTopLocal
  const winBottom = () => input.y + slotDy + winBottomLocal
  if (winTop() < SCREEN_MARGIN) slotDy += SCREEN_MARGIN - winTop()
  if (winBottom() > input.viewportH - SCREEN_MARGIN) slotDy -= winBottom() - (input.viewportH - SCREEN_MARGIN)

  // If the slice is wider than the gutter, push the extra off the screen.
  const onScreen = () => edge === 'right'
    ? input.viewportW - (input.x + slotDx + winLeftLocal)
    : input.x + slotDx + winRightLocal
  if (onScreen() > gutter) {
    const extra = onScreen() - gutter
    slotDx += edge === 'right' ? extra : -extra
  }

  const windowRect: PeekRect = {
    left: input.x + slotDx + winLeftLocal,
    top: input.y + slotDy + winTopLocal,
    right: input.x + slotDx + winRightLocal,
    bottom: input.y + slotDy + winBottomLocal,
  }

  const naturalLeft = input.x + input.close.left
  const naturalTop = input.y + input.close.top
  const size = input.close.width
  const height = input.close.height

  const placed = (left: number, top: number): PeekRect => ({
    left,
    top,
    right: left + size,
    bottom: top + height,
  })
  const onScreenBox = (box: PeekRect) =>
    box.left >= SCREEN_MARGIN &&
    box.top >= SCREEN_MARGIN &&
    box.right <= input.viewportW - SCREEN_MARGIN &&
    box.bottom <= input.viewportH - SCREEN_MARGIN

  const candidates: Array<{ left: number; top: number }> = []
  const outerLeft = edge === 'right' ? input.viewportW - SCREEN_MARGIN - size : SCREEN_MARGIN
  candidates.push({ left: outerLeft, top: naturalTop })
  candidates.push({ left: outerLeft, top: windowRect.top - CLOSE_CLEARANCE - height })
  candidates.push({ left: outerLeft, top: windowRect.bottom + CLOSE_CLEARANCE })
  candidates.push({
    left: edge === 'right' ? windowRect.left - CLOSE_CLEARANCE - size : windowRect.right + CLOSE_CLEARANCE,
    top: Math.max(SCREEN_MARGIN, windowRect.top),
  })

  let chosen = placed(
    Math.min(input.viewportW - SCREEN_MARGIN - size, Math.max(SCREEN_MARGIN, outerLeft)),
    Math.min(input.viewportH - SCREEN_MARGIN - height, Math.max(SCREEN_MARGIN, naturalTop)),
  )
  for (const candidate of candidates) {
    const left = Math.min(input.viewportW - SCREEN_MARGIN - size, Math.max(SCREEN_MARGIN, candidate.left))
    const top = Math.min(input.viewportH - SCREEN_MARGIN - height, Math.max(SCREEN_MARGIN, candidate.top))
    const box = placed(left, top)
    if (onScreenBox(box) && gapBetween(box, windowRect) >= CLOSE_CLEARANCE) {
      chosen = box
      break
    }
  }

  return {
    edge,
    slotDx,
    slotDy,
    closeDx: chosen.left - naturalLeft,
    closeDy: chosen.top - naturalTop,
    window: windowRect,
    close: chosen,
  }
}

export function peekClearsText(layout: ScrollPeekLayout, viewportW: number, gutter = 16): boolean {
  const { window: box } = layout
  const inLeft = box.right <= gutter + 0.5
  const inRight = box.left >= viewportW - gutter - 0.5
  return (inLeft || inRight) && box.right - box.left <= gutter + 0.5
}
