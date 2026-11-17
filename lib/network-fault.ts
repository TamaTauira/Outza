/**
 * Bare network failures from fetch().
 *
 * Safari says "Load failed", Chrome "Failed to fetch", Firefox
 * "NetworkError when attempting to fetch resource." WebKit also says
 * "The network connection was lost." A cancelled fetch is an AbortError.
 * On iOS these TypeErrors often have no stack. They are a dropped
 * connection, not a broken page. A real JavaScript crash still has a stack
 * frame and must keep alerting.
 */

export const TRANSIENT_WINDOW_MS = 10 * 60 * 1000
export const TRANSIENT_SPIKE_SESSIONS = 5
export const NETWORK_RETRY_STORAGE_KEY = 'vp-network-retry-at'
export const NETWORK_RETRY_WINDOW_MS = 30_000

const BARE_MESSAGES = new Set([
  'load failed',
  'failed to fetch',
  'networkerror when attempting to fetch resource',
  'the network connection was lost',
])

const FRAME = /(?:^|\n)\s*at \S|(?:^|\n)[^\n@]*@\S+:\d+/

export type FaultText = { message: string; name: string; stack: string }

export type TransientSession = { id: string; at: number }

export type TransientLedger = { sessions: TransientSession[] }

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function readFaultText(error: unknown): FaultText {
  if (typeof error === 'string') return { message: error, name: '', stack: '' }
  if (!error || typeof error !== 'object') return { message: '', name: '', stack: '' }
  const record = error as { message?: unknown; name?: unknown; stack?: unknown }
  return { message: textOf(record.message), name: textOf(record.name), stack: textOf(record.stack) }
}

/** A stack we can act on: a V8/SpiderMonkey frame, or a Safari `fn@url:line` frame. */
export function hasErrorStack(stack: unknown): boolean {
  return typeof stack === 'string' && stack.trim() !== '' && FRAME.test(stack)
}

function bareMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/\.$/, '')
  return BARE_MESSAGES.has(normalized)
}

/**
 * True only for a network TypeError or AbortError that arrived with no stack.
 * The same words with a stack are left as a real crash.
 */
export function isBareNetworkFault(error: unknown): boolean {
  const fault = readFaultText(error)
  if (!fault.message && fault.name !== 'AbortError') return false
  if (hasErrorStack(fault.stack)) return false
  if (fault.name === 'AbortError') return true
  return bareMessage(fault.message)
}

export function transientSessionId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(text)) return null
  return text
}

/**
 * Folds one session into the recent window. The same session does not count twice.
 * `spike` is the point at which a fault email is worth sending.
 */
export function foldTransientSessions(raw: string | null, sessionId: string, now: number, windowMs = TRANSIENT_WINDOW_MS): {
  ledger: TransientLedger
  distinct: number
  spike: boolean
} {
  let prior: TransientSession[] = []
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { sessions?: unknown }
      if (Array.isArray(parsed?.sessions)) {
        prior = parsed.sessions.flatMap((row) => {
          if (!row || typeof row !== 'object') return []
          const id = (row as { id?: unknown }).id
          const at = (row as { at?: unknown }).at
          if (typeof id !== 'string' || typeof at !== 'number' || !Number.isFinite(at)) return []
          return [{ id, at }]
        })
      }
    } catch {
      prior = []
    }
  }
  const fresh = prior.filter((row) => now - row.at < windowMs && now - row.at >= 0 && row.id !== sessionId)
  fresh.push({ id: sessionId, at: now })
  const sessions = fresh.slice(-40)
  return {
    ledger: { sessions },
    distinct: sessions.length,
    spike: sessions.length >= TRANSIENT_SPIKE_SESSIONS,
  }
}

/**
 * One automatic retry per window. A second failure shows the quiet message
 * instead of resetting again.
 */
export function claimNetworkRetry(storage: StorageLike | null, now = Date.now()): boolean {
  if (!storage) return false
  try {
    const raw = storage.getItem(NETWORK_RETRY_STORAGE_KEY)
    const stored = raw == null || raw === '' ? NaN : Number(raw)
    if (Number.isFinite(stored) && Math.abs(now - stored) < NETWORK_RETRY_WINDOW_MS) return false
    storage.setItem(NETWORK_RETRY_STORAGE_KEY, String(now))
    return true
  } catch {
    return false
  }
}
