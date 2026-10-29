import { PrismaClient } from '@prisma/client'
import { pooledDatabaseUrl } from './db-url'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const databaseUrl = pooledDatabaseUrl(process.env.DATABASE_URL)

// One client per warm Fluid instance. The pooled URL keeps that to a single
// PgBouncer connection instead of a direct session on the 0.25 CU compute.
export const prisma = globalForPrisma.prisma ?? new PrismaClient(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined)

globalForPrisma.prisma = prisma
