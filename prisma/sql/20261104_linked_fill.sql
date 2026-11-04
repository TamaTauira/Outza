-- Which linked source filled a blank field on the canonical listing.
-- Apply before the deploy that reads the column:
--   psql "$DATABASE_URL" -f prisma/sql/20261104_linked_fill.sql
-- Until then, field copies still run. The event page omits the extra sentence.

ALTER TABLE "SourceRecord" ADD COLUMN IF NOT EXISTS "contributed" JSONB;
