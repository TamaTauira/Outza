import { dailyAudioPlaybackEnabled } from '@/lib/feature-flags'

/**
 * One city recording via the Vercel AI Gateway speech endpoint.
 * Returns null when playback is off or the provider rejects the request.
 * Callers keep the transcript either way.
 */
export async function synthesizeSpeech(text: string): Promise<Buffer | null> {
  if (!dailyAudioPlaybackEnabled()) return null
  const key = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  const model = process.env.AI_GATEWAY_TTS_MODEL?.trim()
  if (!key || !model) return null
  const voice = process.env.AI_GATEWAY_TTS_VOICE?.trim() || 'alloy'
  const base = (process.env.AI_GATEWAY_BASE_URL?.trim() || 'https://ai-gateway.vercel.sh/v1').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: text.slice(0, 4000),
        voice,
        response_format: 'mp3',
      }),
    })
    if (!res.ok) {
      console.error('daily tts failed', res.status)
      return null
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length < 200) return null
    return bytes
  } catch (err) {
    console.error('daily tts failed', (err as Error)?.message)
    return null
  }
}
