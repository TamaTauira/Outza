-- Additive tables for VibePeep Together, watchlist reminders, and quality audit.
-- The project applies schema with `yarn prisma db push` (no --accept-data-loss).
-- This file is the same change, for a manual apply. It does not drop or rewrite existing tables.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reminderOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastWatchDigestAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "TogetherPlan" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "city" TEXT,
  "planDate" TIMESTAMP(3),
  "creatorId" TEXT,
  "creatorGuest" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TogetherPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TogetherPlan_token_key" ON "TogetherPlan"("token");
CREATE INDEX IF NOT EXISTS "TogetherPlan_creatorId_idx" ON "TogetherPlan"("creatorId");
CREATE INDEX IF NOT EXISTS "TogetherPlan_creatorGuest_idx" ON "TogetherPlan"("creatorGuest");

CREATE TABLE IF NOT EXISTS "TogetherItem" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TogetherItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TogetherItem_planId_eventId_key" ON "TogetherItem"("planId", "eventId");
CREATE INDEX IF NOT EXISTS "TogetherItem_eventId_idx" ON "TogetherItem"("eventId");

CREATE TABLE IF NOT EXISTS "TogetherMember" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "userId" TEXT,
  "guestKey" TEXT,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TogetherMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TogetherMember_planId_userId_key" ON "TogetherMember"("planId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TogetherMember_planId_guestKey_key" ON "TogetherMember"("planId", "guestKey");
CREATE INDEX IF NOT EXISTS "TogetherMember_userId_idx" ON "TogetherMember"("userId");
CREATE INDEX IF NOT EXISTS "TogetherMember_guestKey_idx" ON "TogetherMember"("guestKey");

CREATE TABLE IF NOT EXISTS "TogetherVote" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "userId" TEXT,
  "guestKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TogetherVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TogetherVote_planId_userId_key" ON "TogetherVote"("planId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TogetherVote_planId_guestKey_key" ON "TogetherVote"("planId", "guestKey");
CREATE INDEX IF NOT EXISTS "TogetherVote_itemId_idx" ON "TogetherVote"("itemId");

CREATE TABLE IF NOT EXISTS "VenueFollow" (
  "userId" TEXT NOT NULL,
  "venueKey" TEXT NOT NULL,
  "venueName" TEXT NOT NULL,
  "city" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenueFollow_pkey" PRIMARY KEY ("userId", "venueKey")
);
CREATE INDEX IF NOT EXISTS "VenueFollow_city_idx" ON "VenueFollow"("city");

CREATE TABLE IF NOT EXISTS "WatchNotice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WatchNotice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WatchNotice_userId_kind_eventId_key" ON "WatchNotice"("userId", "kind", "eventId");
CREATE INDEX IF NOT EXISTS "WatchNotice_userId_idx" ON "WatchNotice"("userId");

CREATE TABLE IF NOT EXISTS "QualityAudit" (
  "id" TEXT NOT NULL,
  "eventId" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QualityAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QualityAudit_action_createdAt_idx" ON "QualityAudit"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "QualityAudit_eventId_idx" ON "QualityAudit"("eventId");

DO $$ BEGIN
  ALTER TABLE "TogetherPlan" ADD CONSTRAINT "TogetherPlan_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TogetherItem" ADD CONSTRAINT "TogetherItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TogetherPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TogetherItem" ADD CONSTRAINT "TogetherItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TogetherMember" ADD CONSTRAINT "TogetherMember_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TogetherPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TogetherMember" ADD CONSTRAINT "TogetherMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TogetherVote" ADD CONSTRAINT "TogetherVote_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TogetherPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TogetherVote" ADD CONSTRAINT "TogetherVote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TogetherItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueFollow" ADD CONSTRAINT "VenueFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WatchNotice" ADD CONSTRAINT "WatchNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
