/** Pure helpers for Outza Together. Safe to import from tests and the client. */

export function newPlanToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function validToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token)
}

export function cleanPlanName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, 80)
  return trimmed.length ? trimmed : null
}

export function cleanDisplayName(name: unknown, fallback = 'Guest'): string {
  if (typeof name !== 'string') return fallback
  const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, 40)
  return trimmed || fallback
}

/** One vote per person. The same option clears the vote. Another option moves it. */
export function nextVote(currentItemId: string | null, itemId: string): string | null {
  return currentItemId === itemId ? null : itemId
}

export function venueKey(name: string, city?: string | null): string {
  const venue = name.trim().toLowerCase().replace(/\s+/g, ' ')
  const where = (city ?? '').trim().toLowerCase()
  return `${where}|${venue}`.slice(0, 180)
}

export function planDateKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const key = value.trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null
}
