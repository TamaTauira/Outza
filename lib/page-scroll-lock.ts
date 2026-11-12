/**
 * Freeze the page behind a sheet or dialog, including iOS Safari.
 * `overflow: hidden` on the body does not stop a rubber-band scroll there.
 * Pinning the body and remembering the offset does, and closing puts the
 * reader back on the same line.
 */

export type ScrollLockStyles = {
  position: 'fixed'
  top: string
  left: '0'
  right: '0'
  width: '100%'
  overflow: 'hidden'
}

export function scrollLockStyles(scrollY: number): ScrollLockStyles {
  const y = Number.isFinite(scrollY) ? Math.max(0, Math.round(scrollY)) : 0
  return {
    position: 'fixed',
    top: `-${y}px`,
    left: '0',
    right: '0',
    width: '100%',
    overflow: 'hidden',
  }
}

export type ScrollLockState = { depth: number; scrollY: number }

export function engageScrollLock(state: ScrollLockState, scrollY: number): { state: ScrollLockState; styles: ScrollLockStyles | null } {
  if (state.depth > 0) return { state: { ...state, depth: state.depth + 1 }, styles: null }
  const y = Number.isFinite(scrollY) ? Math.max(0, Math.round(scrollY)) : 0
  return { state: { depth: 1, scrollY: y }, styles: scrollLockStyles(y) }
}

export function releaseScrollLock(state: ScrollLockState): { state: ScrollLockState; restoreY: number | null } {
  if (state.depth <= 1) return { state: { depth: 0, scrollY: 0 }, restoreY: state.depth === 1 ? state.scrollY : null }
  return { state: { ...state, depth: state.depth - 1 }, restoreY: null }
}

let live: ScrollLockState = { depth: 0, scrollY: 0 }

function readY() {
  return Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body?.scrollTop || 0)
}

function writeY(y: number) {
  try { window.scrollTo(0, y) } catch { /* iOS can throw if the body is mid-style */ }
  document.documentElement.scrollTop = y
  if (document.body) document.body.scrollTop = y
}

/** Call the returned function to unlock. Nested locks stay shut until the last one releases. */
export function lockPageScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  const next = engageScrollLock(live, readY())
  live = next.state
  if (next.styles) {
    const body = document.body
    const html = document.documentElement
    body.style.position = next.styles.position
    body.style.top = next.styles.top
    body.style.left = next.styles.left
    body.style.right = next.styles.right
    body.style.width = next.styles.width
    body.style.overflow = next.styles.overflow
    html.style.overflow = 'hidden'
    html.dataset.vpScrollLock = '1'
  }
  let released = false
  return () => {
    if (released) return
    released = true
    const done = releaseScrollLock(live)
    live = done.state
    if (done.restoreY == null) return
    const body = document.body
    const html = document.documentElement
    body.style.position = ''
    body.style.top = ''
    body.style.left = ''
    body.style.right = ''
    body.style.width = ''
    body.style.overflow = ''
    html.style.overflow = ''
    delete html.dataset.vpScrollLock
    writeY(done.restoreY)
  }
}
