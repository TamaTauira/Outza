-- Venue owner profile, monthly stats opt-out. Additive only.
-- Applied by hand on Neon main after snapshot pre-venue-owner-20261119.
-- Does not alter Event rows or JobWatermark.

ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "gettingThere" TEXT;
ALTER TABLE "Venue" ADD COLUMN IF NOT EXISTS "hoursNote" TEXT;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "venueMonthlyOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastVenueReportAt" TIMESTAMP(3);
