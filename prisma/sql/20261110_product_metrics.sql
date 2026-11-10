-- First-party organiser analytics. Additive only.
-- Apply before the new dashboards read these tables:
--   psql "$DATABASE_URL" -f prisma/sql/20261110_product_metrics.sql
-- The app keeps working if the tables are missing: new charts stay empty and
-- the existing view, save and ticket counters are unchanged.

CREATE TABLE IF NOT EXISTS "ProductMetric" (
  "id" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL DEFAULT '',
  "subjectKind" TEXT NOT NULL DEFAULT 'event',
  "dim" TEXT NOT NULL DEFAULT '',
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductMetric_day_name_subjectId_subjectKind_dim_key"
  ON "ProductMetric" ("day", "name", "subjectId", "subjectKind", "dim");
CREATE INDEX IF NOT EXISTS "ProductMetric_subjectKind_subjectId_day_idx"
  ON "ProductMetric" ("subjectKind", "subjectId", "day");
CREATE INDEX IF NOT EXISTS "ProductMetric_name_day_idx" ON "ProductMetric" ("name", "day");

CREATE TABLE IF NOT EXISTS "ShareLink" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "promoterId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'link',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "visits" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShareLink_code_key" ON "ShareLink" ("code");
CREATE INDEX IF NOT EXISTS "ShareLink_promoterId_createdAt_idx" ON "ShareLink" ("promoterId", "createdAt");
CREATE INDEX IF NOT EXISTS "ShareLink_eventId_idx" ON "ShareLink" ("eventId");

DO $$ BEGIN
  ALTER TABLE "ShareLink"
    ADD CONSTRAINT "ShareLink_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShareLink"
    ADD CONSTRAINT "ShareLink_promoterId_fkey"
    FOREIGN KEY ("promoterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
