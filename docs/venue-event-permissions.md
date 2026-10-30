# Venue and event permissions

Venue management and event management are different grants. `Event.venueId` says where a listing happens. It is not ownership and it never grants an edit.

## Functions

`canManageVenue(userId, venueId)` is true only when the user has an active organisation membership and an approved `VenueManagementGrant` for that venue. A VibePeep admin does not skip this. A pending claim is not a grant. Revoking a membership sets `revokedAt` and later calls return false.

`canManageEvent(userId, eventId)` is true when the user is the listing’s `promoterId`, or they have an active organiser membership on an approved `EventManagementGrant`, or they are a VibePeep admin. Venue grants are not an input.

A venue manager can see upcoming events at the venue, share them, and report a problem. Edit, delete, cancel, price, and schedule stay off unless `canManageEvent` is also true for that event. An organiser cannot edit the venue profile unless `canManageVenue` is true.

Paying for a venue placement does not create or change either grant. Placements are labelled Sponsored. There is no new subscription.

## Claims

Venue claims are free. The official domain is `Venue.officialDomain`, set by ingestion or by an admin when a website change is approved. An address typed into the claim form is ignored. A matching business email gets a one-time code (30 minutes, five tries, single use) through the existing mail helper. Opening that code approves only when the domain is allowed to stand alone. Government, education, and ticket-seller domains stay in review. A verified organisation that already holds a grant for that venue can skip a second identity check. A second person cannot take a claimed venue; they can request access or dispute it.

Event claims keep the existing rule: a signed-in email on the same domain as the event’s own website is approved, and everything else waits in Admin → Trust. A verified organiser organisation whose domain matches the new event can claim the next listing without repeating that check. Similar titles, a shared venue, or free-text organiser names do not approve a claim. A model score is ignored.

## Overrides

Direct edits by a verified organiser are per field (`EventFieldOverride`). The public columns show the override. The source value is kept on the override row. A later import refreshes fields that are not overridden. When the source value matches the override, the override is cleared and the history row stays. If the source says cancelled while an override still says the event is on, the import sets `Event.materialConflict` and does not silently mark the listing cancelled or leave it looking confirmed.

The public line is “Verified Organiser Update”. It means the organiser was allowed to edit. It does not mean every detail is accurate. Venue profiles that have an approved manager show “Managed by a verified venue representative”. There is still no generic Verified badge on events, and confidence scores stay off the page.

Listings edited before this change still use `organiserEditedAt`, which keeps the whole record locked. New edits of ingested listings use field overrides and do not set that lock, so untouched fields keep refreshing. Promoter-created listings (`source = promoter`) still save through the existing editor.

## Analytics

Venue analytics sum profile signals and the public view counts of events at that venue. They do not include promotion spend, audience lists, or ticket revenue. Platform totals keep using `Event.views` only, so the venue rollup is not added again. The dashboard says views and clicks are not attendance.

## Apply

Run this before the app deploy that reads the new columns:

```bash
# from a Postgres client pointed at the Neon database
psql "$DATABASE_URL" -f prisma/sql/20261030_venue_event_ownership.sql
```

Then `yarn prisma generate`. The SQL only adds columns and tables.

`OWNERSHIP_UI` and `NEXT_PUBLIC_OWNERSHIP_UI` default on. Set both to `0` to hide the dashboards and claim tools. Permission checks on the new routes stay in place either way.

Sponsorships (PR #47) and the community hub (PR #48) were still open when this was written. Venue placements reuse the existing one-time Stripe checkout, not a second billing system and not the monthly plans in that PR. Email codes use the same hashed, expiring, attempt-capped shape as the community hub’s `CommunityCode`, stored in `EmailVerificationCode` so this does not depend on that PR. When the hub merges, those two code tables can be folded together. Do not add a paid identity vendor.

## Rollback

1. Set `OWNERSHIP_UI=0` and `NEXT_PUBLIC_OWNERSHIP_UI=0` and redeploy if you only need the new screens hidden.
2. To remove the code, revert this pull request. The previous app does not read the new columns or tables.
3. Leave the tables in place until the old code is live. Dropping them is optional:

```sql
DROP TABLE IF EXISTS "SecurityAudit";
DROP TABLE IF EXISTS "EventEditAck";
DROP TABLE IF EXISTS "EventOverrideHistory";
DROP TABLE IF EXISTS "EventFieldOverride";
DROP TABLE IF EXISTS "EventManagementGrant";
DROP TABLE IF EXISTS "VenuePlacement";
DROP TABLE IF EXISTS "VenueProfileChange";
DROP TABLE IF EXISTS "VenueEventReport";
DROP TABLE IF EXISTS "VenueAnalyticsAggregate";
DROP TABLE IF EXISTS "VenueAuditLog";
DROP TABLE IF EXISTS "EmailVerificationCode";
DROP TABLE IF EXISTS "VenueClaimRequest";
DROP TABLE IF EXISTS "VenueManagementGrant";
DROP TABLE IF EXISTS "OrganisationMembership";
DROP TABLE IF EXISTS "Organisation";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "claimStatus";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "announcement";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "photos";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "logoUrl";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "accessibilityInfo";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "facilities";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "categories";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "legalName";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "facebook";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "instagram";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "contactPhone";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "contactEmail";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "description";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "officialDomain";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "website";
ALTER TABLE "Venue" DROP COLUMN IF EXISTS "address";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "sourceEditUrl";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "materialConflict";
```

Do not delete `Event`, `Venue`, `EventClaim`, or `Promotion` rows. Promoter edits, ticket links, and existing claims stay.

## Limits

- Postgres row-level security is not applied. The app connects as one database role, so policies would not see the signed-in user. Checks are in the server functions above.
- Evidence is a link, using the same pattern as organiser claims. There is no new file store.
- There is no live connection to Ticketmaster or Eventbrite accounts, so “trusted source” approval is only used when a caller passes that fact. Nothing in the product sets it yet.
- A venue report does not change the event. A person resolves it in Admin → Venue claims. Material reports show a short caution on the event page.
- `organiserEditedAt` listings still lock the whole record, including the existing cancellation write, until they are edited again as field overrides.
- Refresh of `startsAt` can lag when the date changes and the time is overridden. The public time string stays on the override.
- Neon was not migrated from this change. Apply the SQL file before merging.
