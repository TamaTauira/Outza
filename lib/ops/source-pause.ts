import { prisma } from '@/lib/db'
import { reportFault } from '@/lib/owner-alerts'
import { nextSourcePause, sourceShouldRun, type SourcePauseState } from '@/lib/source-health'

let ready: Promise<void> | null = null

function ensure(): Promise<void> {
  if (!ready) {
    ready = prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "SourceHealthState" (
        "source" TEXT NOT NULL,
        "failStreak" INTEGER NOT NULL DEFAULT 0,
        "pausedAt" TIMESTAMP(3),
        "lastAttempt" TIMESTAMP(3),
        "lastSuccess" TIMESTAMP(3),
        "lastFailure" TIMESTAMP(3),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SourceHealthState_pkey" PRIMARY KEY ("source")
      )
    `.then(() => undefined).catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

function stateOf(row: { failStreak: number; pausedAt: Date | null; lastAttempt: Date | null } | null): SourcePauseState {
  return {
    failStreak: row?.failStreak ?? 0,
    pausedAt: row?.pausedAt?.getTime() ?? null,
    lastAttempt: row?.lastAttempt?.getTime() ?? null,
  }
}

export async function sourceShouldRunNow(name: string, now = Date.now()): Promise<boolean> {
  await ensure()
  const row = await prisma.sourceHealthState.findUnique({ where: { source: name } })
  return sourceShouldRun(stateOf(row), now)
}

async function save(name: string, next: ReturnType<typeof nextSourcePause>, outcome: 'success' | 'failure', detail: string) {
  const data = {
    failStreak: next.failStreak,
    pausedAt: next.pausedAt == null ? null : new Date(next.pausedAt),
    lastAttempt: new Date(next.lastAttempt ?? Date.now()),
    ...(outcome === 'success' ? { lastSuccess: new Date(next.lastAttempt ?? Date.now()) } : { lastFailure: new Date(next.lastAttempt ?? Date.now()) }),
  }
  await prisma.sourceHealthState.upsert({
    where: { source: name },
    create: { source: name, ...data },
    update: data,
  })
  if (next.fault) {
    await reportFault({
      area: 'Event refresh',
      key: `source-paused-${name}`,
      route: '/admin/sources',
      title: `${name} has been paused for more than 24 hours`,
      detail: `${detail} Listings already stored stay up until the usual stale rules hide them.`,
    })
  }
}

/** Counts a hard failure. Pauses on the third. Emails only after the pause is a day old. */
export async function noteSourceFailure(name: string, detail: string, now = Date.now()): Promise<void> {
  try {
    await ensure()
    const row = await prisma.sourceHealthState.findUnique({ where: { source: name } })
    const next = nextSourcePause(stateOf(row), 'failure', now)
    await save(name, next, 'failure', detail)
    if (next.newlyPaused) console.log(`[refresh] ${name} paused after ${next.failStreak} failures`)
  } catch (err) {
    console.error('[ops] source pause update failed', err instanceof Error ? err.message : err)
  }
}

/** A clean run clears the pause and the failure streak. */
export async function noteSourceSuccess(name: string, now = Date.now()): Promise<void> {
  try {
    await ensure()
    const row = await prisma.sourceHealthState.findUnique({ where: { source: name } })
    const next = nextSourcePause(stateOf(row), 'success', now)
    await save(name, next, 'success', '')
    if (next.resumed) console.log(`[refresh] ${name} resumed`)
  } catch (err) {
    console.error('[ops] source resume update failed', err instanceof Error ? err.message : err)
  }
}
