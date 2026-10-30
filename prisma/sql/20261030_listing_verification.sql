-- Additive listing-verification tables and columns.
-- Apply with `yarn prisma db push` (no --accept-data-loss), or run this file by hand.
-- It does not drop columns, rewrite rows, or delete listings.
-- Rollback: docs/listing-verification.md

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "allDay" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3);
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "confidenceScore" INTEGER;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "venueId" TEXT;

CREATE INDEX IF NOT EXISTS "Event_startsAt_idx" ON "Event"("startsAt");
CREATE INDEX IF NOT EXISTS "Event_venueId_idx" ON "Event"("venueId");

CREATE TABLE IF NOT EXISTS "Venue" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "openTime" TEXT,
  "closeTime" TEXT,
  "hoursSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Venue_key_key" ON "Venue"("key");
CREATE INDEX IF NOT EXISTS "Venue_city_idx" ON "Venue"("city");

CREATE TABLE IF NOT EXISTS "EventOccurrence" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "timezone" TEXT NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL,
  "recurrence" TEXT,
  CONSTRAINT "EventOccurrence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EventOccurrence_eventId_startsAt_key" ON "EventOccurrence"("eventId", "startsAt");
CREATE INDEX IF NOT EXISTS "EventOccurrence_startsAt_idx" ON "EventOccurrence"("startsAt");

CREATE TABLE IF NOT EXISTS "SourceRecord" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "missing" BOOLEAN NOT NULL DEFAULT false,
  "changed" BOOLEAN NOT NULL DEFAULT false,
  "conflicts" JSONB,
  CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SourceRecord_eventId_source_key" ON "SourceRecord"("eventId", "source");
CREATE INDEX IF NOT EXISTS "SourceRecord_missing_changed_idx" ON "SourceRecord"("missing", "changed");

CREATE TABLE IF NOT EXISTS "VerificationCheck" (
  "id" TEXT NOT NULL,
  "eventId" TEXT,
  "kind" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VerificationCheck_kind_createdAt_idx" ON "VerificationCheck"("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "VerificationCheck_eventId_idx" ON "VerificationCheck"("eventId");

CREATE TABLE IF NOT EXISTS "AnalyticsCounter" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsCounter_pkey" PRIMARY KEY ("key")
);

DO $$ BEGIN
  ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VerificationCheck" ADD CONSTRAINT "VerificationCheck_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
