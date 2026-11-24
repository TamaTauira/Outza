import { prisma } from '@/lib/db'

let ready: Promise<void> | null = null

/** Creates the ops tables if the SQL file has not been applied yet. Safe to re-run. */
export function ensureOpsTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "OpsDecision" (
          "id" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "targetType" TEXT NOT NULL,
          "targetId" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "reason" TEXT NOT NULL,
          "confidence" DOUBLE PRECISION NOT NULL,
          "actor" TEXT NOT NULL,
          "before" JSONB,
          "after" JSONB,
          "undoneAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "OpsDecision_pkey" PRIMARY KEY ("id")
        )
      `
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "OpsDecision_createdAt_idx" ON "OpsDecision" ("createdAt")`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "OpsDecision_target_idx" ON "OpsDecision" ("targetType", "targetId")`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "OpsDecision_kind_createdAt_idx" ON "OpsDecision" ("kind", "createdAt")`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "OpsDecision_undone_idx" ON "OpsDecision" ("undoneAt", "createdAt")`
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "OpsSetting" (
          "key" TEXT NOT NULL,
          "enabled" BOOLEAN NOT NULL DEFAULT true,
          "value" JSONB,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "OpsSetting_pkey" PRIMARY KEY ("key")
        )
      `
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "OpsDigestItem" (
          "id" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "targetType" TEXT NOT NULL,
          "targetId" TEXT NOT NULL,
          "summary" TEXT NOT NULL,
          "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
          "status" TEXT NOT NULL DEFAULT 'QUEUED',
          "payload" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "resolvedAt" TIMESTAMP(3),
          CONSTRAINT "OpsDigestItem_pkey" PRIMARY KEY ("id")
        )
      `
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "OpsDigestItem_status_createdAt_idx" ON "OpsDigestItem" ("status", "createdAt")`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "OpsDigestItem_target_idx" ON "OpsDigestItem" ("targetType", "targetId")`
      await prisma.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "OpsDigestItem_open_target" ON "OpsDigestItem" ("targetType", "targetId")
        WHERE "status" IN ('QUEUED', 'OPEN')
      `
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "OpsDigestToken" (
          "id" TEXT NOT NULL,
          "tokenHash" TEXT NOT NULL,
          "itemId" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "usedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "OpsDigestToken_pkey" PRIMARY KEY ("id")
        )
      `
      await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "OpsDigestToken_tokenHash_key" ON "OpsDigestToken" ("tokenHash")`
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "OpsDigestToken_itemId_idx" ON "OpsDigestToken" ("itemId")`
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}
