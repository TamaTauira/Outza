/**
 * Rollout switches for the engagement programme.
 * A missing variable means the completed behaviour. Playback stays off until a
 * text-to-speech model, a gateway credential, and the existing file bucket are all set.
 */

function on(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === '') return fallback
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}

export function reactionsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.EVENT_REACTIONS, true)
}

/** Written city briefings. Set DAILY_BRIEFING=0 to hide them. */
export function dailyBriefingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.DAILY_BRIEFING, true)
}

/**
 * Spoken playback. Off unless AI_GATEWAY_TTS_MODEL is set, the gateway can
 * authenticate, and AWS_BUCKET_NAME is set so the file is cached once per city.
 * DAILY_AUDIO=0 forces it off even when those are present.
 */
export function dailyAudioPlaybackEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const model = env.AI_GATEWAY_TTS_MODEL?.trim()
  const credential = env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN
  const bucket = env.AWS_BUCKET_NAME?.trim()
  if (!model || !credential || !bucket) return false
  return on(env.DAILY_AUDIO, true)
}

/** Gateway rewrite of a listing summary. The fact summary does not use this flag. */
export function eventInsightAiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (!on(env.EVENT_INSIGHT_AI, false)) return false
  return Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN)
}
