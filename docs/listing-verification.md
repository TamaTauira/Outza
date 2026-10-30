# Listing verification

Tonight and Happening now only lead with listings whose start time overlaps that window. Untimed listings are labelled **Possibly available** and sit after the timed ones. Morning-only, expired, cancelled and sold-out listings do not lead those windows.

The public line on an event is `Source: Ticketmaster · Updated 28 Oct`, plus the organiser link and **Report incorrect details**. The **Get tickets** / **More info** button is unchanged. There is no confidence score and no Verified badge in the UI, emails or page metadata.

A confidence number can be stored on `Event.confidenceScore` for ranking and filters. It is not selected for public responses.

## What the jobs do

- Feed refresh (existing cron) updates `lastVerifiedAt` when a source still lists the event.
- `/api/cron/quality` still merges duplicates and audits expired rows. It now also:
  - writes `startsAt`, `endsAt`, `timezone`, `allDay` and the internal score
  - records conflicting times instead of overwriting the kept listing
  - queues admin flags for missing coordinates, suspect images, missing or changed sources, venue-hour clashes and repeated source failures
- Opening an event page within 36 hours of the start writes one `VerificationCheck` if the last check is older than 12 hours. It does not call a feed. The next refresh does.

Rules are deterministic. Nothing here calls a model per listing.

## Apply

```bash
yarn prisma db push
```

Or run `prisma/sql/20261030_listing_verification.sql` on Postgres. The SQL only adds columns and tables.

`lib/db.ts` keeps the page client and the job client apart. The quality pass already runs inside `runWithJobPrisma`. Event pages stay on the interactive client.

## Rollback

1. Stop the quality cron if a deploy is in progress, so it is not writing the new columns mid-rollback.
2. Revert this pull request. The previous code does not read `timezone`, `allDay`, `startsAt`, `endsAt`, `confidenceScore`, `venueId`, or the new tables.
3. Leave the new columns and tables in place. Dropping them is optional and only after the old code is live:

```sql
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_venueId_fkey";
DROP TABLE IF EXISTS "VerificationCheck";
DROP TABLE IF EXISTS "SourceRecord";
DROP TABLE IF EXISTS "EventOccurrence";
DROP TABLE IF EXISTS "AnalyticsCounter";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "venueId";
DROP TABLE IF EXISTS "Venue";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "confidenceScore";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "endsAt";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "startsAt";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "allDay";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "timezone";
```

Do not delete `Event`, `EventReport` or `QualityAudit` rows. Duplicate links (`duplicateOfId`) and statuses (`CANCELLED`, `SOLD_OUT`) stay.
