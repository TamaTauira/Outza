/**
 * Phone tuck. While a narrow viewport is scrolling, he leans out from the
 * nearer screen edge: a vertical half of the upright figure, antenna still
 * on his head, parked in the bottom corner above the nav. Desktop never tucks.
 */

/** Matches a max-width media query. 768px and up stay as they are. */
export const SCROLL_PEEK_MAX_WIDTH = 767

/** He stays tucked until the scroll has been still for about a second. */
export const SCROLL_PEEK_SETTLE_MS = 1000

/**
 * Antenna box on the rig (mascot-rig.json). The ball fills that box, so a
 * cut through the centre line would slice it. The visible share stays just
 * past the ball.
 */
export const PEEK_ANTENNA = { left: 0.4155, right: 0.4155 + 0.1717 } as const

/**
 * Share of the rig that stays on screen. Half the body, plus enough that the
 * centre-line antenna stays whole and attached. One eye is fully in frame.
 */
export const SCROLL_PEEK_VISIBLE = 0.6

/** The dismiss control. Same numbers as `.vp-buddy-min` in the roam CSS. */
export const CLOSE_BUTTON = { size: 44, gap: 10, lift: 0.24 } as const

/** Gap between his feet and the bottom nav (or the safe area). */
export const PEEK_CORNER_GAP = 8

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
  /** The on-screen half. The rest of the rig is past the screen edge. */
  visible: PeekRect
  close: PeekRect
}

/** Local x span that stays on screen, 0–1 across the rig. */
export function peekVisibleSpan(edge: 'left' | 'right', visible = SCROLL_PEEK_VISIBLE) {
  if (edge === 'right') return { left: 0, right: visible }
  return { left: 1 - visible, right: 1 }
}

/**
 * Slide the whole upright rig off the right edge so a vertical half leans
 * out, and drop him into the bottom corner above `bottomReserve`. The right
 * edge only: the left edge is the iOS back swipe. The dismiss control goes
 * off screen. No crop: the viewport edge is the only thing hiding him.
 */
export function scrollPeekLayout(input: {
  x: number
  y: number
  width: number
  height: number
  viewportW: number
  viewportH: number
  close: { left: number; top: number; width: number; height: number }
  /** Pixels to keep clear at the bottom: nav offset (includes safe area) plus a gap. */
  bottomReserve?: number
}): ScrollPeekLayout {
  const reserve = Math.max(0, input.bottomReserve ?? 0)
  const edge: 'left' | 'right' = 'right'
  const span = peekVisibleSpan(edge)
  const slotDx = edge === 'right'
    ? input.viewportW - (input.x + span.right * input.width)
    : 0 - (input.x + span.left * input.width)

  const minTop = 8
  const maxTop = Math.max(minTop, input.viewportH - reserve - input.height)
  const slotDy = maxTop - input.y

  const figureLeft = input.x + slotDx
  const figureTop = input.y + slotDy
  const visible: PeekRect = {
    left: figureLeft + span.left * input.width,
    right: figureLeft + span.right * input.width,
    top: figureTop,
    bottom: figureTop + input.height,
  }

  const naturalLeft = input.x + input.close.left
  const naturalTop = input.y + input.close.top
  const size = input.close.width
  const tuck = 12
  const closeLeft = edge === 'right' ? input.viewportW + tuck : -(size + tuck)
  const closeTop = visible.top - input.close.height
  const close: PeekRect = {
    left: closeLeft,
    top: closeTop,
    right: closeLeft + size,
    bottom: closeTop + input.close.height,
  }

  return {
    edge,
    slotDx,
    slotDy,
    closeDx: closeLeft - naturalLeft,
    closeDy: closeTop - naturalTop,
    visible,
    close,
  }
}
