import { AsyncLocalStorage } from 'node:async_hooks'
import { PrismaClient } from '@prisma/client'
import { INTERACTIVE_CONNECTION_LIMIT, JOB_CONNECTION_LIMIT, POOL_TIMEOUT_SECONDS, pooledDatabaseUrl } from './db-url'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
  jobPrisma?: PrismaClient
}

function clientFor(connectionLimit: number): PrismaClient {
  const url = pooledDatabaseUrl(process.env.DATABASE_URL, {
    connectionLimit,
    poolTimeoutSeconds: POOL_TIMEOUT_SECONDS,
  })
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined)
}

// One interactive client and one job client per warm Fluid instance.
// Refresh, the quality pass and the image pass run for minutes on the same
// process that serves event pages. They take the job client, via the async
// context below, so a long ingest cannot hold the connections page reads need.
export const interactivePrisma = globalForPrisma.prisma ?? clientFor(INTERACTIVE_CONNECTION_LIMIT)
export const jobPrisma = globalForPrisma.jobPrisma ?? clientFor(JOB_CONNECTION_LIMIT)

globalForPrisma.prisma = interactivePrisma
globalForPrisma.jobPrisma = jobPrisma

const jobContext = new AsyncLocalStorage<PrismaClient>()

export function prismaPool(): 'interactive' | 'job' {
  return jobContext.getStore() ? 'job' : 'interactive'
}

/** Run ingest / quality / image work on the job pool. Page handlers stay on the interactive client. */
export function runWithJobPrisma<T>(fn: () => Promise<T>): Promise<T> {
  return jobContext.run(jobPrisma, fn)
}

// Call sites keep `import { prisma }`. The delegate is resolved when the
// property is read, so a query started inside runWithJobPrisma uses the job
// client and a page request in another async context does not.
export const prisma = new Proxy(interactivePrisma, {
  get(target, prop) {
    const client = jobContext.getStore() ?? target
    const value = Reflect.get(client, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
}) as PrismaClient
