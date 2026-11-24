-- Pause flag for a listings source that has failed three times.
-- Additive. Does not hide or delete listings.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/20261124_source_health.sql

CREATE TABLE IF NOT EXISTS "SourceHealthState" (
  "source" TEXT NOT NULL,
  "failStreak" INTEGER NOT NULL DEFAULT 0,
  "pausedAt" TIMESTAMP(3),
  "lastAttempt" TIMESTAMP(3),
  "lastSuccess" TIMESTAMP(3),
  "lastFailure" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceHealthState_pkey" PRIMARY KEY ("source")
);
