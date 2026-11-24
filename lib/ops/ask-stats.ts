import { prisma } from '@/lib/db'

/** Cumulative Ask outcomes. The summary route reads these. A failed write does not fail Ask. */
export async function noteAsk(ok: boolean): Promise<void> {
  const key = ok ? 'ask_ok' : 'ask_error'
  try {
    await prisma.analyticsCounter.upsert({
      where: { key },
      create: { key, count: 1 },
      update: { count: { increment: 1 } },
    })
  } catch (err) {
    console.error('[ops] ask counter failed', err instanceof Error ? err.message : err)
  }
}
