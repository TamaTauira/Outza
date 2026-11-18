import type { Prisma } from '@prisma/client'
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

type Tx = Prisma.TransactionClient

/**
 * Run one unit of work on a single connection and cancel it if it overruns.
 * PgBouncer does not keep a session `statement_timeout`, so it is set inside
 * the transaction that holds the query. `maxWait` fails fast when the Prisma
 * pool is already full instead of sitting until `pool_timeout`.
 */
export async function withStatementTimeout<T>(timeoutMs: number, run: (tx: Tx) => Promise<T>): Promise<T> {
  const ms = String(Math.max(1, Math.floor(timeoutMs)))
  const budget = Math.max(1, Math.floor(timeoutMs))
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('statement_timeout', ${ms}, true)`
      return run(tx)
    }, { maxWait: 2_000, timeout: budget + 1_000 })
  } catch (err) {
    if (isDbSaturation(err)) throw err
    const message = err instanceof Error ? err.message : String(err)
    if (/timeout|Transaction already closed|expired transaction/i.test(message)) {
      const wrapped = new Error(message)
      wrapped.name = 'DbSaturationError'
      throw wrapped
    }
    throw err
  }
}
