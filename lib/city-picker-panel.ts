/**
 * Geometry for the city picker's open panel.
 *
 * The panel is rendered in a portal with fixed positioning (see
 * components/city-picker.tsx) because two of its homes sit inside the hero
 * card, which clips absolutely-positioned descendants at the card edge
 * (overflow-hidden) — rows were sliced mid-entry and the rest of the panel
 * was lost behind the sections below. Fixed positioning escapes that clip,
 * but then the panel has to be kept inside the viewport by hand. That is
 * what this helper does: it hangs the panel under its trigger, matches (or
 * widens to) the trigger width, clamps it inside the viewport's side
 * margins, and caps its height at the smaller of 26rem and the space
 * actually left below the trigger, so the panel scrolls internally instead
 * of running off the bottom of the screen.
 */

export interface CityPickerTriggerRect {
  bottom: number
  left: number
  width: number
}

export interface CityPickerViewport {
  width: number
  height: number
}

export interface CityPickerPanelBox {
  top: number
  left: number
  width: number
  maxHeight: number
}

/** Tallest the panel may grow: 26rem, the cap the dropdown has always had. */
export const CITY_PICKER_PANEL_MAX_HEIGHT = 416
/** Narrowest the panel may shrink: 15rem, the old min-w-60. */
export const CITY_PICKER_PANEL_MIN_WIDTH = 240
/** Gap between the trigger's bottom edge and the panel (the old mt-2). */
export const CITY_PICKER_PANEL_GAP = 8
/** Breathing room kept between the panel and every viewport edge. */
export const CITY_PICKER_PANEL_EDGE = 16

export function cityPickerPanelBox(trigger: CityPickerTriggerRect, viewport: CityPickerViewport): CityPickerPanelBox {
  const maxWidth = Math.max(viewport.width - CITY_PICKER_PANEL_EDGE * 2, 0)
  const width = Math.min(Math.max(trigger.width, CITY_PICKER_PANEL_MIN_WIDTH), maxWidth)
  const maxLeft = Math.max(viewport.width - CITY_PICKER_PANEL_EDGE - width, CITY_PICKER_PANEL_EDGE)
  const left = Math.min(Math.max(trigger.left, CITY_PICKER_PANEL_EDGE), maxLeft)
  const top = trigger.bottom + CITY_PICKER_PANEL_GAP
  const available = viewport.height - top - CITY_PICKER_PANEL_EDGE
  const maxHeight = Math.max(0, Math.min(CITY_PICKER_PANEL_MAX_HEIGHT, available))
  return { top, left, width, maxHeight }
}

/**
 * Keyboard navigation for the open picker: where the active option moves
 * for a key, or null when the key is not a navigation key (the caller then
 * handles Enter/Space/Escape/Tab itself). Movement clamps at both ends
 * rather than wrapping, matching the picker's behaviour since it shipped.
 * An out-of-range active index is clamped back into the list, and an
 * empty list has no active option at all.
 */
export function cityPickerActiveAfterKey(active: number, key: string, count: number): number | null {
  if (count <= 0) return null
  const last = count - 1
  const clamp = (n: number) => Math.min(Math.max(n, 0), last)
  switch (key) {
    case 'ArrowDown': return clamp(active + 1)
    case 'ArrowUp': return clamp(active - 1)
    case 'Home': return 0
    case 'End': return last
    default: return null
  }
}
