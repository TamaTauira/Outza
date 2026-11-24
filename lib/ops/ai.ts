import { completeJson, llmConfigured } from '@/lib/llm'
import type { HeldAi } from '@/lib/ops/rules'

/** Written policy for held listings. Protests and rallies stay hidden. */
export const HELD_POLICY = [
  'Hate, violence, weapons, self-harm, and scams stay hidden and are high-risk.',
  'Protests and rallies stay hidden. They are not high-risk by themselves.',
  'Ordinary classes, trivia, talks, gigs, markets, and workshops can be published.',
  'When unsure, say unsure. Do not invent a category.',
].join(' ')

export function parseDuplicateScore(raw: unknown): number | null {
  const value = raw && typeof raw === 'object' ? (raw as { score?: unknown }).score : null
  const score = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(score)) return null
  return Math.min(1, Math.max(0, score))
}

export function parseHeldClass(raw: unknown): HeldAi {
  if (!raw || typeof raw !== 'object') return null
  const label = (raw as { label?: unknown }).label
  const confidence = Number((raw as { confidence?: unknown }).confidence)
  if (label !== 'harm' && label !== 'rally' && label !== 'ordinary' && label !== 'unsure') return null
  return {
    label,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    highRisk: (raw as { highRisk?: unknown }).highRisk === true || label === 'harm',
  }
}

export async function scoreDuplicate(input: {
  left: { title: string; venue: string; when: string; url: string }
  right: { title: string; venue: string; when: string; url: string }
}): Promise<number | null> {
  if (!llmConfigured()) return null
  try {
    const raw = await completeJson({
      timeoutMs: 8_000,
      temperature: 0,
      maxOutputTokens: 120,
      messages: [{
        role: 'user',
        content: `Are these two public event listings the same event? Reply with JSON {"score": number} from 0 to 1. 1 means the same event. Compare title, venue, date, time, and URL only.\nA: ${JSON.stringify(input.left)}\nB: ${JSON.stringify(input.right)}`,
      }],
    })
    return parseDuplicateScore(raw)
  } catch (err) {
    console.error('[ops] duplicate score failed', err instanceof Error ? err.message : err)
    return null
  }
}

export async function classifyHeld(title: string, description: string | null): Promise<HeldAi> {
  if (!llmConfigured()) return null
  try {
    const raw = await completeJson({
      timeoutMs: 8_000,
      temperature: 0,
      maxOutputTokens: 160,
      messages: [{
        role: 'user',
        content: `${HELD_POLICY}\nReply with JSON {"label":"harm"|"rally"|"ordinary"|"unsure","confidence":number,"highRisk":boolean}.\nTitle: ${title}\nDescription: ${(description ?? '').slice(0, 1200)}`,
      }],
    })
    return parseHeldClass(raw)
  } catch (err) {
    console.error('[ops] held classification failed', err instanceof Error ? err.message : err)
    return null
  }
}
