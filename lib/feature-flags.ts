/**
 * Rollout switches for the engagement programme.
 * A missing variable means the completed behaviour.
 */

function on(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === '') return fallback
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}

export function reactionsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.EVENT_REACTIONS, true)
}
