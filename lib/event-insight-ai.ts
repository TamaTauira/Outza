import { prisma } from '@/lib/db'
import { eventInsightAiEnabled } from '@/lib/feature-flags'
import { rewriteIsGrounded } from '@/lib/event-insight'
import { missingRelation } from '@/lib/engagement-store'
import { completeJson } from '@/lib/llm'

export async function cachedRewrite(eventId: string, hash: string, allowed: string): Promise<string | null> {
  if (!eventInsightAiEnabled()) return null
  try {
    const row = await prisma.eventInsight.findUnique({ where: { eventId }, select: { contentHash: true, rewrite: true } })
    if (!row || row.contentHash !== hash) return null
    return rewriteIsGrounded(row.rewrite, allowed) ? row.rewrite : null
  } catch (err) {
    if (!missingRelation(err)) console.error('insight read failed', (err as Error)?.message)
    return null
  }
}

/** One gateway rewrite per fact sheet. A rejected rewrite is not stored. */
export async function ensureRewrite(eventId: string, hash: string, sentences: string[]): Promise<void> {
  if (!eventInsightAiEnabled()) return
  const allowed = sentences.join(' ')
  if (await cachedRewrite(eventId, hash, allowed)) return
  try {
    const output = await completeJson({
      messages: [{
        role: 'user',
        content: `Shorten these VibePeep listing sentences into one paragraph. Use only the words, names and numbers already in them. Do not add a review, a price, a date, a performer, or ticket availability. Return JSON {"rewrite":"..."}.\n\n${sentences.map((line) => `- ${line}`).join('\n')}`,
      }],
      timeoutMs: 8000,
      maxOutputTokens: 300,
      temperature: 0,
    })
    const rewrite = typeof output?.rewrite === 'string' ? output.rewrite : ''
    if (!rewriteIsGrounded(rewrite, allowed)) return
    await prisma.eventInsight.upsert({
      where: { eventId },
      create: { eventId, contentHash: hash, rewrite },
      update: { contentHash: hash, rewrite },
    })
  } catch (err) {
    if (!missingRelation(err)) console.error('insight rewrite failed', (err as Error)?.message)
  }
}
