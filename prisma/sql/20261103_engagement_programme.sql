-- Reactions, daily engagement totals, cached city briefings, and insight rewrites.
-- Additive only. Apply before the app reads the new tables:
--   psql "$DATABASE_URL" -f prisma/sql/20261103_engagement_programme.sql

CREATE TABLE IF NOT EXISTS "EventReaction" (
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventReaction_pkey" PRIMARY KEY ("userId", "eventId", "kind")
);

CREATE INDEX IF NOT EXISTS "EventReaction_eventId_kind_idx" ON "EventReaction" ("eventId", "kind");
CREATE INDEX IF NOT EXISTS "EventReaction_userId_updatedAt_idx" ON "EventReaction" ("userId", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "EventReaction"
    ADD CONSTRAINT "EventReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EventReaction"
    ADD CONSTRAINT "EventReaction_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EngagementDay" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "EngagementDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EngagementDay_eventId_day_kind_key" ON "EngagementDay" ("eventId", "day", "kind");
CREATE INDEX IF NOT EXISTS "EngagementDay_day_idx" ON "EngagementDay" ("day");

DO $$ BEGIN
  ALTER TABLE "EngagementDay"
    ADD CONSTRAINT "EngagementDay_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DailyBriefing" (
  "id" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "edition" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "transcript" JSONB NOT NULL,
  "spoken" TEXT NOT NULL,
  "eventIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "audioStatus" TEXT NOT NULL DEFAULT 'NONE',
  "audioPath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyBriefing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyBriefing_city_edition_day_key" ON "DailyBriefing" ("city", "edition", "day");

CREATE TABLE IF NOT EXISTS "EventInsight" (
  "eventId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "rewrite" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventInsight_pkey" PRIMARY KEY ("eventId")
);

DO $$ BEGIN
  ALTER TABLE "EventInsight"
    ADD CONSTRAINT "EventInsight_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
