-- Source identity and data-quality alerts. Additive only.
-- Apply before the app deploy that reads the new columns:
--   psql "$DATABASE_URL" -f prisma/sql/20261103_source_identity.sql

ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "canonicalUrl" TEXT;
ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "sessionKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SourceRecord_source_externalId_key"
  ON "SourceRecord" ("source", "externalId");

CREATE INDEX IF NOT EXISTS "SourceRecord_canonicalUrl_sessionKey_idx"
  ON "SourceRecord" ("canonicalUrl", "sessionKey");

CREATE TABLE IF NOT EXISTS "DataQualityAlert" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataQualityAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataQualityAlert_kind_createdAt_idx"
  ON "DataQualityAlert" ("kind", "createdAt");

CREATE INDEX IF NOT EXISTS "DataQualityAlert_source_createdAt_idx"
  ON "DataQualityAlert" ("source", "createdAt");
