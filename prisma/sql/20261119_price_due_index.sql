-- Candidate rows for the hourly price lookup.
-- Additive. Safe to re-run. Does not rewrite rows.
--
-- The lookup asks for the next blank upcoming price (isFree false, no
-- priceMin, price empty or TBA). Doing that through the date index walks
-- every upcoming event. This partial index is just those blank rows, in
-- date order, so LIMIT 60 stops after a short index range.
--
-- The shared database can take a lock while an index builds, and a
-- concurrent build must not run inside a transaction. Apply with the
-- direct (non-pooler) URL:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/20261119_price_due_index.sql
--
-- prisma db push does not create partial indexes. The lookup query uses
-- the same literals as the predicate below, which is what lets the
-- planner prove the index applies.

SET statement_timeout = 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Event_unpriced_date_idx"
  ON "Event" ("date", "id")
  INCLUDE ("priceCheckedAt", "priceUnknownReason")
  WHERE "duplicateOfId" IS NULL
    AND "deletedAt" IS NULL
    AND "organiserEditedAt" IS NULL
    AND "isFree" = false
    AND "priceMin" IS NULL
    AND (
      price IS NULL
      OR price = ''
      OR lower(price) IN ('tba', 'tbc', 'price tba', 'price tbc')
    );
