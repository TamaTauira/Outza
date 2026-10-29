-- Reads the board, the event page and the homepage stats actually make.
-- Additive only. Safe to re-run. Event_city_date_status_idx is already in production;
-- the statement keeps a database created from the Prisma schema in step with it.

CREATE INDEX IF NOT EXISTS "Event_city_date_status_idx" ON "Event" ("city", "date", "status");

-- Related listings on an event page match city + category, then date.
CREATE INDEX IF NOT EXISTS "Event_city_category_date_idx" ON "Event" ("city", "category", "date");

-- "Last refreshed" reads the newest completed ingest. The log is small today and grows every run.
CREATE INDEX IF NOT EXISTS "RefreshLog_status_endedAt_idx" ON "RefreshLog" ("status", "endedAt");

-- Verified badges look up open reports for the events on the page.
CREATE INDEX IF NOT EXISTS "EventReport_eventId_status_idx" ON "EventReport" ("eventId", "status");
