-- Proposed cleanup for stale series copies and same-night venue duplicates.
-- DO NOT RUN until a Neon snapshot of long-rice-87791950 / br-polished-brook-a7bed0u2 is taken.
-- This hides rows by setting duplicateOfId. It does not delete them.
-- The application already hides these rows at query time. This script is the optional data follow-up.
--
-- Read-only counts taken 21 Nov 2026, about 09:00 Sydney:
--   upcoming listable rows (date >= 2026-11-21): 59218
--   title names another day: 1 Halloween, 4 "November 7", 3 "21 November" on a different day
--   finish instant already past while the start date is still upcoming: 12
--   Sydney Home The Venue / Home Main Venue 9:00 pm Glasshouse and Homemade rows: 25
--   of those, the SELECT below returns 13 rows to hide (7 also name another day)
--   Saturday 21 Nov 9:00 pm drops from 6 visible rows to 2
--
-- The 12 finished sessions are hidden by the query (endsAt already past).
-- They are not assigned a duplicateOfId, because each one is its own finished night.

BEGIN;

CREATE TABLE IF NOT EXISTS event_stale_backup (
  id text PRIMARY KEY,
  title text,
  date date,
  "venueName" text,
  "duplicateOfId" text,
  "endsAt" timestamptz,
  keeper text,
  reason text,
  backed_up_at timestamptz DEFAULT now()
);

CREATE TEMP TABLE stale_losers AS
WITH cluster AS (
  SELECT id, title, date, "venueName", "duplicateOfId", "endsAt",
    CASE WHEN title ILIKE '%homemade%' THEN 'homemade' ELSE 'glass' END AS grp,
    (
      title ~* 'halloween'
      OR (title ~* '(november|nov)[[:space:]]+7(st|nd|rd|th)?' AND date::date <> DATE '2026-11-07')
      OR (title ~* '21(st|nd|rd|th)?[[:space:]]+(november|nov)' AND date::date <> DATE '2026-11-21')
    ) AS stale
  FROM "Event"
  WHERE "deletedAt" IS NULL AND "duplicateOfId" IS NULL AND status <> 'CANCELLED'
    AND date >= DATE '2026-11-21' AND time = '21:00'
    AND "venueName" ILIKE '%home%venue%'
    AND (title ILIKE '%glass%' OR title ILIKE '%homemade%')
), keepers AS (
  SELECT DISTINCT ON (date, grp) id, date, grp
  FROM cluster
  WHERE NOT stale
  ORDER BY date, grp, length(title), id
)
SELECT c.id, c.title, c.date, c."venueName", c."duplicateOfId", c."endsAt", k.id AS keeper,
  CASE WHEN c.stale THEN 'title-names-another-day' ELSE 'same-night-venue-copy' END AS reason
FROM cluster c
JOIN keepers k ON k.date = c.date AND k.grp = c.grp
WHERE c.id <> k.id;

-- Stop here if this is not 13.
-- SELECT count(*) FROM stale_losers;

INSERT INTO event_stale_backup (id, title, date, "venueName", "duplicateOfId", "endsAt", keeper, reason)
SELECT id, title, date, "venueName", "duplicateOfId", "endsAt", keeper, reason
FROM stale_losers
ON CONFLICT (id) DO NOTHING;

UPDATE "Event" AS e
SET "duplicateOfId" = l.keeper
FROM stale_losers AS l
WHERE e.id = l.id AND e."duplicateOfId" IS NULL;

COMMIT;
