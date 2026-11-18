import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'

/** A query gave up because the pool was full or the statement was cancelled. */
export function isDbSaturation(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== 'object' || depth > 4) return false
  const code = 'code' in err ? String((err as { code?: unknown }).code) : ''
  if (code === 'P2024' || code === 'P2028' || code === 'P1001' || code === 'P1008' || code === 'P1017') return true
  const message = err instanceof Error ? err.message : String(err)
  if (/Timed out fetching a new connection|connection pool|statement timeout|canceling statement due to statement timeout|Unable to start a transaction|Transaction API error/i.test(message)) return true
  return 'cause' in err && isDbSaturation((err as { cause?: unknown }).cause, depth + 1)
}

/**
 * Stop waiting for a query after `timeoutMs`. An interactive transaction cannot
 * be used here: through the Neon pooler it can stay open until the platform
 * kills the function, which is what held /api/cron/price-enrich for 300s.
 * The caller gets the timeout. A query that already has a connection still
 * ends when the invocation does.
 */
export async function withStatementTimeout<T>(timeoutMs: number, run: (db: PrismaClient) => Promise<T>): Promise<T> {
  const budget = Math.max(1, Math.floor(timeoutMs))
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('statement timeout')
      err.name = 'DbSaturationError'
      reject(err)
    }, budget)
  })
  try {
    return await Promise.race([run(prisma), deadline])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
