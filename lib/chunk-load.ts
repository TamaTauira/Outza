/**
 * Chunk and dynamic-import load failures. Turbopack throws
 * "Failed to load chunk … from module …" (a plain Error). Webpack throws
 * ChunkLoadError / "Loading chunk … failed". Browsers reject dynamic import()
 * with their own messages. One reload of the current URL usually clears a
 * deploy switch or a flaky mobile fetch. The sessionStorage timestamp stops
 * that reload from looping; a failure that comes back inside the window is a
 * real break and should be reported.
 */

export const CHUNK_RELOAD_STORAGE_KEY = 'vibepeep-chunk-reload-at'

/** Long enough that a slow reload cannot start another one; short enough that a later deploy can self-heal in the same tab. */
export const CHUNK_RELOAD_WINDOW_MS = 60_000

const CHUNK_LOAD_PATTERNS: readonly RegExp[] = [
  /Failed to load chunk\b/i,
  /Loading(?: CSS)? chunk .+ failed/i,
  /ChunkLoadError/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
]

export type ChunkLoadRecovery = 'not-chunk' | 'reload' | 'report' | 'handled'

export type ChunkReloadState = { phase: 'idle' | 'reloading' | 'reported' }

export type ChunkLoadStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type ChunkLoadDeps = {
  now?: number
  storage?: ChunkLoadStorage
  reload?: () => void
  state?: ChunkReloadState
  windowMs?: number
}

const sessionState: ChunkReloadState = { phase: 'idle' }

function errorTexts(error: unknown, depth = 0): string[] {
  if (typeof error === 'string') return error ? [error] : []
  if (!error || typeof error !== 'object') return []
  const record = error as { name?: unknown; message?: unknown; cause?: unknown }
  const texts: string[] = []
  if (typeof record.name === 'string' && record.name) texts.push(record.name)
  if (typeof record.message === 'string' && record.message) texts.push(record.message)
  if (depth < 1 && 'cause' in record) texts.push(...errorTexts(record.cause, depth + 1))
  return texts
}

export function isChunkLoadError(error: unknown): boolean {
  return errorTexts(error).some((text) => CHUNK_LOAD_PATTERNS.some((pattern) => pattern.test(text)))
}

function storedAttemptAt(raw: string | null): number | null {
  if (raw == null || raw === '') return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function attemptIsCurrent(storedAt: number, now: number, windowMs: number): boolean {
  return Math.abs(now - storedAt) < windowMs
}

function reloadCurrentUrl() {
  window.location.reload()
}

/**
 * Decides what to do with a client error. The first chunk-load failure in the
 * window reloads the current URL and must not be reported. A second one in the
 * same window is reported once. Anything else is left for the caller to report.
 */
export function recoverChunkLoadFailure(error: unknown, deps: ChunkLoadDeps = {}): ChunkLoadRecovery {
  if (!isChunkLoadError(error)) return 'not-chunk'
  const state = deps.state ?? sessionState
  if (state.phase !== 'idle') return 'handled'

  const now = deps.now ?? Date.now()
  const windowMs = deps.windowMs ?? CHUNK_RELOAD_WINDOW_MS
  let storage: ChunkLoadStorage | undefined
  try {
    storage = deps.storage ?? (typeof sessionStorage === 'undefined' ? undefined : sessionStorage)
  } catch {
    state.phase = 'reported'
    return 'report'
  }
  if (!storage) {
    state.phase = 'reported'
    return 'report'
  }

  let storedAt: number | null
  try {
    storedAt = storedAttemptAt(storage.getItem(CHUNK_RELOAD_STORAGE_KEY))
  } catch {
    state.phase = 'reported'
    return 'report'
  }
  if (storedAt != null && attemptIsCurrent(storedAt, now, windowMs)) {
    state.phase = 'reported'
    return 'report'
  }

  try {
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now))
  } catch {
    state.phase = 'reported'
    return 'report'
  }

  state.phase = 'reloading'
  try {
    ;(deps.reload ?? reloadCurrentUrl)()
  } catch {
    state.phase = 'reported'
    return 'report'
  }
  return 'reload'
}

export function resetChunkLoadRecoveryForTests() {
  sessionState.phase = 'idle'
}
