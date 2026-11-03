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

/** Gateway rewrite of a listing summary. The fact summary does not use this flag. */
export function eventInsightAiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (!on(env.EVENT_INSIGHT_AI, false)) return false
  return Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN)
}
