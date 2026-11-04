-- Watermark for incremental jobs, and the updatedAt index those jobs filter on.
-- Additive. Safe to re-run. Does not rewrite rows.
--
-- The shared database uses a 5 second statement timeout. Building an index on
-- Event can take longer than that and must not block writes, so this session
-- turns the timeout off and creates the index concurrently. Concurrent index
-- builds cannot run inside a transaction. Apply with the direct (non-pooler)
-- URL:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/20261104_job_watermark.sql
--
-- The app also creates JobWatermark if this file has not been applied yet.
-- prisma db push is a no-op for these objects once this file has run.

SET statement_timeout = 0;

CREATE TABLE IF NOT EXISTS "JobWatermark" (
  "job" TEXT NOT NULL,
  "cursorAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobWatermark_pkey" PRIMARY KEY ("job")
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Event_updatedAt_idx" ON "Event" ("updatedAt");
