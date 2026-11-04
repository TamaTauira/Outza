/**
 * Where the bottom navigation replaces the top destination links.
 *
 * Phones in either orientation, tablet portrait (including iPad Pro 12.9 at
 * 1024px), coarse-pointer split views, and a horizontal dual-screen span all
 * use the bar. Tablet landscape and desktop keep the header links.
 * The same conditions are repeated in components/bottom-nav.css — keep them
 * together.
 */

export type BottomNavInput = {
  width: number
  height: number
  pointerCoarse: boolean
  /** Two side-by-side viewport segments, or the legacy single-fold-vertical span. */
  horizontalSegments: number
}

export const BOTTOM_NAV_MAX_WIDTH = 1023
/** Coarse portrait tablets wider than the phone breakpoint, up to iPad Pro 12.9. */
export const BOTTOM_NAV_TABLET_PORTRAIT_MAX = 1400

export function wantsBottomNav(input: BottomNavInput): boolean {
  if (input.horizontalSegments >= 2) return true
  if (input.width <= BOTTOM_NAV_MAX_WIDTH) return true
  const portrait = input.height >= input.width
  if (input.pointerCoarse && portrait && input.width <= BOTTOM_NAV_TABLET_PORTRAIT_MAX) return true
  return false
}

/**
 * Pixels the mascot must stay above. `navOffset` is the rendered bottom bar
 * (including the safe area). On a vertical fold the bar lives on the other
 * screen, so the figure only needs a small margin inside its own segment.
 * The speech bubble is painted above the figure, so clearing the figure
 * clears the bubble too.
 */
export function roamBottomChrome(opts: {
  mobile: boolean
  map: boolean
  navOffset: number
  segmentLimited: boolean
}): number {
  if (opts.segmentLimited) return opts.map ? 160 : 36
  const base = opts.map ? (opts.mobile ? 176 : 36) : opts.mobile ? 96 : 20
  const air = opts.navOffset > 0 ? 16 : 0
  return base + opts.navOffset + air
}
