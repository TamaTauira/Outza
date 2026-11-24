-- Ops decisions, weekly digest queue, and rule switches.
-- Additive. Safe to re-run. Does not update existing listings.
-- The app also creates these tables on first use.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/20261124_ops.sql

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
);

CREATE INDEX IF NOT EXISTS "OpsDecision_createdAt_idx" ON "OpsDecision" ("createdAt");
CREATE INDEX IF NOT EXISTS "OpsDecision_target_idx" ON "OpsDecision" ("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "OpsDecision_kind_createdAt_idx" ON "OpsDecision" ("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "OpsDecision_undone_idx" ON "OpsDecision" ("undoneAt", "createdAt");

CREATE TABLE IF NOT EXISTS "OpsSetting" (
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "value" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpsSetting_pkey" PRIMARY KEY ("key")
);

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
);

CREATE INDEX IF NOT EXISTS "OpsDigestItem_status_createdAt_idx" ON "OpsDigestItem" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "OpsDigestItem_target_idx" ON "OpsDigestItem" ("targetType", "targetId");
CREATE UNIQUE INDEX IF NOT EXISTS "OpsDigestItem_open_target" ON "OpsDigestItem" ("targetType", "targetId")
  WHERE "status" IN ('QUEUED', 'OPEN');

CREATE TABLE IF NOT EXISTS "OpsDigestToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpsDigestToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OpsDigestToken_tokenHash_key" ON "OpsDigestToken" ("tokenHash");
CREATE INDEX IF NOT EXISTS "OpsDigestToken_itemId_idx" ON "OpsDigestToken" ("itemId");
