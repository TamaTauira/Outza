# Community hub

Neighbourhood listings that do not have a ticketing site: garage sales, school fundraisers, farmers markets, neighbourhood pop-ups, community sport, charity events, dog-friendly meetups and local art.

These listings live on VibePeep Local (`/local`) with the garage, clearance and market sales. Submissions are Event rows plus audit, email-code, metric and template tables. `/community` redirects to `/local`.

## What a visitor gets

- `/local` is the neighbourhood page (sales and community sections together). Old `/community` URLs 301 here.
- `/local/in/[section]`, then city, suburb and an optional when segment (`tonight`, `this-weekend`, `friday`, `saturday`, `sunday`).
- Filters on the page: city, suburb, from, to, when, free. A repeating listing matches a date only when an occurrence falls in that window.
- Indexing uses `assessIndexability` in `lib/indexability.ts` (5 live listings; suburb pages also need 2 inside the fresh window). Thinner pages render, send `noindex`, and stay out of the sitemap.
- Listings without a photo use the genre WebPs in `public/placeholders/`.
- The public event page keeps a **Get Tickets** link when the organiser gave a ticket-seller URL, and **More Info** otherwise (their website, or the shareable event page).
- Street addresses stay off the public page unless the organiser opts in. School fundraisers are always suburb-only, and photos of children are not published.

## What an organiser gets

- `/local?tab=submit` on a phone: title, time, suburb, description, email code or magic link, optional photo. Built-in templates prefill a garage sale, a monthly market, a dog walk and a school fete. Warehouse clearances use the same form.
- After the email is confirmed, low-risk listings go live. School listings, children’s photos and spam signals wait in `/admin/community`.
- The confirmation email includes a manage link (`/local/manage/[token]`) for edits, postpone, cancel, reschedule, and “save as template”.
- `/local/poster/[id]` is a printable poster with a QR code pointing at the event page.
- Signing in with the same email can attach the listing to that account. Promoter dashboard edits already allow `source = community`. Ingested feeds still cannot be edited, and a refresh will not overwrite a community row.

## Moderation

Approve, reject, or remove. Remove sets `approvalState = REMOVED` and `deletedAt`. The `Event` row and `CommunityAudit` rows stay. Three open reports send the listing back to pending and write a `HOLD` audit.

Counters on the admin page, from real rows only:

- live listings per suburb and category
- approved ÷ submitted
- `CommunityMetric` rows with kind `ORGANIC` in the last 30 days (external or direct entrances, bots skipped)

## Email

Verification codes and manage links use `sendEmail` in `lib/email.ts` (Yahoo SMTP when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are set, otherwise Resend when `RESEND_API_KEY` is set). No new mail provider.

Optional `COMMUNITY_CODE_PEPPER` hashes codes and manage tokens. When it is unset, the hash uses `NEXTAUTH_SECRET` or `AUTH_SECRET`.

## Deploy

Apply `prisma/sql/20261030_community_hub.sql` before the app version that reads the new columns. The SQL only adds columns and tables.

## Rollback

1. Deploy the previous app build first, so nothing reads the new columns.
2. Then, if the columns themselves must go, run:

```sql
ALTER TABLE "CommunityAudit" DROP CONSTRAINT IF EXISTS "CommunityAudit_eventId_fkey";
DROP TABLE IF EXISTS "CommunityTemplate";
DROP TABLE IF EXISTS "CommunityMetric";
DROP TABLE IF EXISTS "CommunityCode";
DROP TABLE IF EXISTS "CommunityAudit";
DROP INDEX IF EXISTS "Event_manageTokenHash_key";
DROP INDEX IF EXISTS "Event_contactEmail_idx";
DROP INDEX IF EXISTS "Event_approvalState_deletedAt_idx";
DROP INDEX IF EXISTS "Event_communityKey_approvalState_date_idx";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "manageTokenHash";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "submitIpHash";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "communityFlags";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "templateKey";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "imageKidSafe";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "childrenInImage";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "emailVerifiedAt";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "contactEmail";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "locationVisibility";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "approvalState";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "submissionState";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "communityKey";
```

Dropping the columns deletes community listings that lived only in those fields, and drops the audit table. Do that only when the listing history is no longer needed. Leaving the columns in place and deploying the previous build is the safer rollback: old code ignores the new columns.
