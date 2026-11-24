-- Display derivatives for event cards.
-- Additive. Nullable columns only. Does not read or rewrite existing rows.
-- Safe to re-run.
--
-- Apply with the direct (non-pooler) URL before the app version that reads these columns:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/20261124_event_image_display.sql

ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "imageWidth" INTEGER;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "imageHeight" INTEGER;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "imageColor" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "imageBlur" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "imageDisplay" JSONB;
